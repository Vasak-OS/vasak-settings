<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	ConfigSection,
	EmptyState,
	PageHeader,
	SelectField,
	SwitchToggle,
} from '@vasakgroup/vue-libvasak';
import { onMounted, type Ref, ref } from 'vue';
import {
	DEFAULT_PANEL_SIZE,
	MAX_PANEL_SIZE,
	MIN_PANEL_SIZE,
	PANEL_ANIMATIONS,
	PANEL_LAYOUTS,
	PANEL_POSITIONS,
	PANEL_STYLES,
	type PanelAnimation,
	type PanelLayout,
	type PanelPosition,
	type PanelStyle,
	readPanelAnimation,
	readPanelIndicators,
	readPanelLayout,
	readPanelPosition,
	readPanelSize,
	readPanelStyle,
	writePanelAppearance,
	writePanelIndicators,
	writePanelPosition,
} from '@/utils/config-values';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);

/**
 * Todo arranca encendido.
 *
 * La sección `panel` no existe en la configuración hasta que alguien apaga
 * algo, así que la ausencia de una clave significa «mostralo». El escritorio lee
 * exactamente con este criterio (`!== false`), y si acá se leyera al revés, el
 * panel y esta pantalla se contradirían en cada instalación nueva.
 */
const weather = ref(true);
const music = ref(true);
const transfer = ref(true);
const tray = ref(true);
const privacy = ref(true);

/**
 * De qué lado queda la barra.
 *
 * Arriba por omisión, que es donde estuvo siempre. El escritorio la reancla y
 * reacomoda lo de adentro al recibir `config-changed`, así que moverla no pide
 * reiniciar la sesión.
 */
const position = ref<PanelPosition>('top');

/**
 * El aspecto de la barra: su tipo, su densidad, su animación y su tamaño. Son
 * las claves que el escritorio lee en `panel-appearance.ts`; acá se leen y se
 * escriben con los mismos valores y los mismos de fábrica. Al guardar, el panel
 * se reacomoda solo con `config-changed`, sin reiniciar la sesión.
 */
const style = ref<PanelStyle>('pills');
const layout = ref<PanelLayout>('distributed');
const animation = ref<PanelAnimation>('off');
const size = ref<number>(DEFAULT_PANEL_SIZE);

/** Los pasos del tamaño que ofrece el desplegable, dentro del rango permitido. */
const SIZE_STEPS = [MIN_PANEL_SIZE, 90, DEFAULT_PANEL_SIZE, 110, MAX_PANEL_SIZE] as const;

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		const panel = readPanelIndicators(vskConfig.value);
		weather.value = panel.weather;
		music.value = panel.music;
		transfer.value = panel.transfer;
		tray.value = panel.tray;
		privacy.value = panel.privacy;
		position.value = readPanelPosition(vskConfig.value);
		style.value = readPanelStyle(vskConfig.value);
		layout.value = readPanelLayout(vskConfig.value);
		animation.value = readPanelAnimation(vskConfig.value);
		size.value = readPanelSize(vskConfig.value);
	} catch (err) {
		error.value = t('views.appearancePanel.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (!vskConfig.value) return;

		writePanelIndicators(vskConfig.value as any, {
			weather: weather.value,
			music: music.value,
			transfer: transfer.value,
			tray: tray.value,
			privacy: privacy.value,
		});

		writePanelPosition(vskConfig.value as unknown as Record<string, unknown>, position.value);

		writePanelAppearance(vskConfig.value as unknown as Record<string, unknown>, {
			style: style.value,
			layout: layout.value,
			animation: animation.value,
			size: size.value,
		});

		await writeConfig(vskConfig.value);

		// El escritorio recarga la configuración al recibir `config-changed`, que
		// emite el propio plugin: el panel se acomoda sin reiniciar la sesión.
		successMessage.value = t('views.appearancePanel.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearancePanel.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.appearance')"
			:title="t('views.appearancePanel.title')"
			:description="t('views.appearancePanel.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearancePanel.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.appearancePanel.loading')" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>

			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<ConfigSection :title="t('views.appearancePanel.bar')">

				<div class="flex items-start justify-between gap-4">
					<!-- Sólo la explicación: el nombre del control lo dice el `label`
					     del propio desplegable, y repetirlo acá lo escribe dos veces
					     una al lado de la otra. -->
					<p class="text-xs text-tx-muted">
						{{ t('views.appearancePanel.positionHint') }}
					</p>
					<!-- La etiqueta va **dentro** del componente: un `<label>` suelto
					     al lado no está asociado a nada, y un lector de pantalla
					     anuncia un desplegable sin nombre. -->
					<SelectField
						v-model="position"
						:label="t('views.appearancePanel.position')"
						class="w-48 shrink-0"
					>
						<option v-for="side in PANEL_POSITIONS" :key="side" :value="side">
							{{ t(`views.appearancePanel.lados.${side}`) }}
						</option>
					</SelectField>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearancePanel.appearance')">
				<div class="flex flex-col gap-5">
					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.styleHint') }}
						</p>
						<SelectField
							v-model="style"
							:label="t('views.appearancePanel.style')"
							class="w-48 shrink-0"
						>
							<option v-for="name in PANEL_STYLES" :key="name" :value="name">
								{{ t(`views.appearancePanel.styles.${name}`) }}
							</option>
						</SelectField>
					</div>

					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.layoutHint') }}
						</p>
						<SelectField
							v-model="layout"
							:label="t('views.appearancePanel.layout')"
							class="w-48 shrink-0"
						>
							<option v-for="name in PANEL_LAYOUTS" :key="name" :value="name">
								{{ t(`views.appearancePanel.layouts.${name}`) }}
							</option>
						</SelectField>
					</div>

					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.animationHint') }}
						</p>
						<SelectField
							v-model="animation"
							:label="t('views.appearancePanel.animation')"
							class="w-48 shrink-0"
						>
							<option v-for="name in PANEL_ANIMATIONS" :key="name" :value="name">
								{{ t(`views.appearancePanel.animations.${name}`) }}
							</option>
						</SelectField>
					</div>

					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.sizeHint') }}
						</p>
						<!-- Pasos discretos y no un deslizador libre: el tamaño ya va
						     acotado a [80, 120] %, y unos pocos valores son más claros
						     que arrastrar hasta un número exacto. -->
						<!-- `:value` numérico y `v-model` a secas: el valor que llega ya es
						     número, sin el modificador `.number` (que `SelectField` no
						     declara y el typecheck rechaza). -->
						<SelectField
							v-model="size"
							:label="t('views.appearancePanel.size')"
							class="w-48 shrink-0"
						>
							<option v-for="step in SIZE_STEPS" :key="step" :value="step">{{ step }} %</option>
						</SelectField>
					</div>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearancePanel.indicators')">

				<div class="flex flex-col gap-5">
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.weather') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.weatherHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.weather')" :model-value="weather" @update:model-value="(val) => (weather = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.music') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.musicHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.music')" :model-value="music" @update:model-value="(val) => (music = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.transfer') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.transferHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.transfer')" :model-value="transfer" @update:model-value="(val) => (transfer = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.tray') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.trayHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.tray')" :model-value="tray" @update:model-value="(val) => (tray = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.privacy') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.privacyHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.privacy')" :model-value="privacy" @update:model-value="(val) => (privacy = val)" />
					</div>
				</div>
			</ConfigSection>
		</div>
	</div>
</template>
