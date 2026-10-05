<script setup lang="ts">
/**
 * El tiempo de pantalla: cuánto se usa cada aplicación, en qué tipo de cosas y a
 * qué hora.
 *
 * Esta pantalla no mide nada. Lo mide `vasak-health-service` —qué ventana estuvo
 * enfocada, descontando la inactividad y el bloqueo— y acá se consulta y se
 * resume. El interruptor prende o apaga ese registro: apagado, lo ya guardado se
 * sigue pudiendo mirar, pero no se cuenta nada nuevo.
 *
 * El interruptor hace **dos** cosas: persiste `screen_time.enabled` en
 * `vasak.conf` —de donde el servicio lo lee al arrancar— y llama a `SetEnabled`
 * para que el cambio sea inmediato. Si sólo escribiera el archivo, el registro no
 * cambiaría hasta el próximo arranque del servicio.
 */
import { readConfig, useConfigStore, writeConfig } from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	BarChart,
	type BarChartItem,
	ConfigSection,
	EmptyState,
	PageHeader,
	ProgressBar,
	SegmentedControl,
	type SegmentedOption,
	StatTile,
	SwitchToggle,
	ThemeIcon,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref } from 'vue';
import AppIcon from '@/components/permissions/AppIcon.vue';
import {
	clearScreenTime,
	type ScreenTimeReport,
	screenTime,
	setScreenTimeEnabled,
} from '@/services/health.service';
import { readScreenTimeEnabled, writeScreenTimeEnabled } from '@/utils/config-values';
import {
	aggregateByApp,
	aggregateByCategory,
	aggregateHourly,
	splitDuration,
	totalMillis,
} from '@/utils/screen-time';

const { t } = useI18n();

/**
 * Las categorías de freedesktop que informa el servicio, con su icono del tema y
 * la clave con que se traducen.
 *
 * El icono sale del tema, como todo acá: son los nombres estándar que el
 * escritorio ya usa para esos grupos. Una categoría que no esté en esta tabla se
 * muestra con su propio nombre crudo y un icono genérico, y la vacía —cuando no
 * se pudo averiguar— cae en «Otras».
 */
const CATEGORIES: Record<string, { icon: string; key: string }> = {
	AudioVideo: { icon: 'applications-multimedia', key: 'audiovideo' },
	Audio: { icon: 'applications-multimedia', key: 'audiovideo' },
	Video: { icon: 'applications-multimedia', key: 'audiovideo' },
	Development: { icon: 'applications-development', key: 'development' },
	Education: { icon: 'applications-science', key: 'education' },
	Game: { icon: 'applications-games', key: 'game' },
	Graphics: { icon: 'applications-graphics', key: 'graphics' },
	Network: { icon: 'applications-internet', key: 'network' },
	Office: { icon: 'applications-office', key: 'office' },
	Science: { icon: 'applications-science', key: 'science' },
	Settings: { icon: 'preferences-system', key: 'settings' },
	System: { icon: 'applications-system', key: 'system' },
	Utility: { icon: 'applications-utilities', key: 'utility' },
};

const categoryIcon = (category: string) => CATEGORIES[category]?.icon ?? 'application-x-executable';

const categoryName = (category: string) => {
	const known = CATEGORIES[category];
	if (known) return t(`views.screenTime.categories.${known.key}`);
	// Una categoría que la tabla no conoce: su nombre crudo si lo hay, o «Otras».
	return category || t('views.screenTime.categories.other');
};

/** El período que se mira. */
type Period = 'today' | 'week' | 'all';
const period = ref<Period>('week');

const periodOptions = computed<SegmentedOption<Period>[]>(() => [
	{ value: 'today', label: t('views.screenTime.period.today') },
	{ value: 'week', label: t('views.screenTime.period.week') },
	{ value: 'all', label: t('views.screenTime.period.all') },
]);

/** La fecha local `AAAA-MM-DD` de un `Date`: el día que ve quien está sentado. */
const ymd = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

/** El rango `[from, to]` del período elegido. */
const range = (): { from: string; to: string } => {
	const now = new Date();
	const to = ymd(now);
	if (period.value === 'today') return { from: to, to };
	if (period.value === 'week') {
		const start = new Date(now);
		start.setDate(start.getDate() - 6);
		return { from: ymd(start), to };
	}
	// Todo: una fecha bien anterior a cualquier instalación. Los días sin datos no
	// viajan, así que pedir de más no cuesta.
	return { from: '2000-01-01', to };
};

const report = ref<ScreenTimeReport | null>(null);
const enabled = ref(false);
const loading = ref(true);
const error = ref('');
const successMessage = ref('');
const busy = ref(false);
const confirmingClear = ref(false);

const byApp = computed(() => (report.value ? aggregateByApp(report.value) : []));
const byCategory = computed(() => (report.value ? aggregateByCategory(report.value) : []));
const hourly = computed(() => (report.value ? aggregateHourly(report.value) : []));
const total = computed(() => (report.value ? totalMillis(report.value) : 0));

/** El tope para las barras relativas: el uso de la aplicación que más suma. */
const maxApp = computed(() => byApp.value[0]?.millis ?? 0);
const maxCategory = computed(() => byCategory.value[0]?.millis ?? 0);

const hasData = computed(() => total.value > 0);

/** Las 24 barras del desglose por hora, con su duración escrita. */
const hourlyBars = computed<BarChartItem[]>(() =>
	hourly.value.map((millis, hour) => ({
		key: String(hour),
		label: String(hour).padStart(2, '0'),
		shortLabel: String(hour),
		value: millis,
		valueLabel: formatDuration(millis),
	}))
);

/** Una duración como «2 h 15 min», sin segundos: en hábitos de uso no dicen nada. */
function formatDuration(millis: number): string {
	const { hours, minutes } = splitDuration(millis);
	if (hours > 0 && minutes > 0) {
		return t('views.screenTime.duration.hm')
			.replace('{0}', String(hours))
			.replace('{1}', String(minutes));
	}
	if (hours > 0) {
		return t('views.screenTime.duration.hoursOnly').replace('{0}', String(hours));
	}
	return t('views.screenTime.duration.minutesOnly').replace('{0}', String(minutes));
}

/** El porcentaje de una barra relativa, acotado por si el tope fuera cero. */
const relative = (millis: number, max: number) => (max > 0 ? (millis / max) * 100 : 0);

const load = async () => {
	loading.value = true;
	error.value = '';
	try {
		const { from, to } = range();
		const result = await screenTime(from, to);
		report.value = result;
		enabled.value = result.enabled;
	} catch (err) {
		error.value = t('views.screenTime.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
};

const changePeriod = async (value: Period) => {
	period.value = value;
	await load();
};

const toggleEnabled = async (value: boolean) => {
	busy.value = true;
	error.value = '';
	successMessage.value = '';
	const previous = enabled.value;
	enabled.value = value;
	try {
		// Persistir en el archivo —de donde el servicio lo lee al arrancar— y
		// avisarle en el acto. Las dos cosas, o el cambio no sobrevive al próximo
		// arranque o no se aplica hasta entonces.
		const config = await readConfig();
		if (config) {
			writeScreenTimeEnabled(config as unknown as Record<string, unknown>, value);
			await writeConfig(config);
		}
		await setScreenTimeEnabled(value);
		successMessage.value = t('views.screenTime.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		// Que el interruptor vuelva a la verdad si algo falló.
		enabled.value = previous;
		error.value = t('views.screenTime.errorSaving').replace('{0}', String(err));
	} finally {
		busy.value = false;
	}
};

const doClear = async () => {
	busy.value = true;
	error.value = '';
	try {
		await clearScreenTime();
		confirmingClear.value = false;
		await load();
	} catch (err) {
		error.value = t('views.screenTime.clear.errorClearing').replace('{0}', String(err));
	} finally {
		busy.value = false;
	}
};

onMounted(async () => {
	try {
		// Dejar la configuración cargada en el store, como el resto de las pantallas.
		const store = useConfigStore();
		await store.loadConfig();
		const config = await readConfig();
		enabled.value = readScreenTimeEnabled(config);
	} catch {
		// Si la configuración no se pudo leer, el estado real llega igual con el
		// informe de abajo.
	}
	await load();
});
</script>

<template>
	<div ref="root" class="@container flex min-h-full flex-col gap-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.system')"
			:title="t('views.screenTime.title')"
			:description="t('views.screenTime.description')"
		>
			<template #actions>
				<SegmentedControl
					:model-value="period"
					:options="periodOptions"
					:label="t('views.screenTime.periodLabel')"
					@update:model-value="(value: Period | null) => { if (value) changePeriod(value); }"
				/>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
		<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

		<!-- El interruptor. Va arriba de todo porque es lo que gobierna a lo demás:
		     apagado, lo guardado se sigue viendo pero no se suma nada nuevo. -->
		<ConfigSection :title="t('views.screenTime.record')">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<p class="min-w-0 flex-1 text-sm text-tx-muted">
					{{ t('views.screenTime.recordHint') }}
				</p>
				<SwitchToggle
					:label="t('views.screenTime.record')"
					:model-value="enabled"
					:disabled="busy"
					@update:model-value="(value) => toggleEnabled(value)"
				/>
			</div>
		</ConfigSection>

		<EmptyState
			v-if="loading"
			:title="t('views.screenTime.loading')"
			icon="preferences-system-time"
			bordered
		/>

		<template v-else>
			<EmptyState
				v-if="!hasData"
				:title="t('views.screenTime.noData.title')"
				:note="enabled ? t('views.screenTime.noData.note') : t('views.screenTime.noData.disabled')"
				icon="preferences-system-time"
				bordered
			/>

			<template v-else>
				<!-- El resumen: el total y el alcance de lo que se está mirando. -->
				<div class="grid grid-cols-1 gap-3 @sm:grid-cols-2">
					<StatTile
						:label="t('views.screenTime.summary.total')"
						:value="formatDuration(total)"
						icon="preferences-system-time"
					/>
					<StatTile
						:label="t('views.screenTime.summary.apps')"
						:value="String(byApp.length)"
						icon="applications-other"
					/>
				</div>

				<!-- Por aplicación: la pregunta de «¿en qué se me va el tiempo?». -->
				<ConfigSection :title="t('views.screenTime.byApp.title')">
					<ul class="flex flex-col gap-3">
						<li v-for="app in byApp" :key="app.app_id" class="flex items-center gap-3">
							<AppIcon :name="app.icon" />
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<div class="flex items-baseline justify-between gap-2">
									<span class="min-w-0 truncate font-medium text-tx-main">{{ app.name }}</span>
									<span class="shrink-0 text-sm text-tx-muted">{{ formatDuration(app.millis) }}</span>
								</div>
								<ProgressBar :value="relative(app.millis, maxApp)" :label="app.name" size="xs" />
							</div>
						</li>
					</ul>
				</ConfigSection>

				<!-- Por categoría: en qué tipo de cosas, sumando el `category` de cada
				     aplicación. -->
				<ConfigSection :title="t('views.screenTime.byCategory.title')">
					<ul class="flex flex-col gap-3">
						<li v-for="cat in byCategory" :key="cat.category" class="flex items-center gap-3">
							<span
								class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-corner-xs border border-ui-border bg-ui-bg/60"
							>
								<ThemeIcon :name="categoryIcon(cat.category)" :size="24" type="symbol" />
							</span>
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<div class="flex items-baseline justify-between gap-2">
									<span class="min-w-0 truncate font-medium text-tx-main">{{ categoryName(cat.category) }}</span>
									<span class="shrink-0 text-sm text-tx-muted">{{ formatDuration(cat.millis) }}</span>
								</div>
								<ProgressBar :value="relative(cat.millis, maxCategory)" :label="categoryName(cat.category)" size="xs" />
							</div>
						</li>
					</ul>
				</ConfigSection>

				<!-- Por horario: a qué hora del día, con las 24 cubetas de todos los
				     días sumadas. -->
				<ConfigSection
					:title="t('views.screenTime.byHour.title')"
					:description="t('views.screenTime.byHour.description')"
				>
					<BarChart :bars="hourlyBars" :label="t('views.screenTime.byHour.title')" />
				</ConfigSection>
			</template>
		</template>

		<!-- Borrar el historial. Destructivo y no se deshace, así que pide una
		     confirmación en el lugar antes de llamar a `ClearScreenTime`. -->
		<ConfigSection
			:title="t('views.screenTime.clear.title')"
			:description="t('views.screenTime.clear.description')"
		>
			<div v-if="!confirmingClear">
				<button
					type="button"
					:disabled="busy"
					class="w-fit rounded-corner-m border border-ui-border px-4 py-2 text-sm font-medium text-status-error hover:bg-ui-surface disabled:opacity-50"
					@click="confirmingClear = true"
				>
					{{ t('views.screenTime.clear.button') }}
				</button>
			</div>
			<div v-else class="flex flex-wrap items-center gap-3">
				<p class="min-w-0 flex-1 text-sm text-tx-main">{{ t('views.screenTime.clear.confirm') }}</p>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						:disabled="busy"
						class="rounded-corner-m bg-status-error px-4 py-2 text-sm font-medium text-tx-on-error disabled:opacity-50"
						@click="doClear"
					>
						{{ t('views.screenTime.clear.confirmButton') }}
					</button>
					<button
						type="button"
						:disabled="busy"
						class="rounded-corner-m border border-ui-border px-4 py-2 text-sm text-tx-muted hover:bg-ui-surface disabled:opacity-50"
						@click="confirmingClear = false"
					>
						{{ t('common.cancel') }}
					</button>
				</div>
			</div>
		</ConfigSection>
	</div>
</template>
