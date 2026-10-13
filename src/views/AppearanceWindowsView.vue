<script lang="ts" setup>
/**
 * Dónde va la barra de las ventanas.
 *
 * La barra de una aplicación —la que lleva el icono, el título y los botones de
 * la ventana— puede quedar arriba, abajo, a la izquierda o a la derecha. Lo
 * dibuja el marco compartido de `@vasakgroup/vue-libvasak`, que es el mismo en
 * todas las ventanas del escritorio, y lo lee de `window.barPosition`.
 *
 * Acá también se eligen los botones de la ventana —planos o estilo macOS, al
 * final o invertidos al principio— y el borde de afuera de las ventanas, el
 * panel y los emergentes del escritorio: fino o grueso, del color del esquema
 * o del de acento.
 *
 * No hay que reiniciar nada: el plugin de configuración emite `config-changed`
 * al guardar, y el marco escucha ese aviso y se acomoda con las ventanas
 * abiertas.
 */
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
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, type Ref, ref } from 'vue';
import {
	BAR_POSITIONS,
	type BarPosition,
	readBarPosition,
	readWindowBorder,
	readWindowControls,
	WINDOW_BORDER_COLORS,
	WINDOW_BORDER_WIDTHS,
	WINDOW_CONTROLS_ORDERS,
	WINDOW_CONTROLS_STYLES,
	type WindowBorderPreference,
	type WindowControlsPreference,
	writeBarPosition,
	writeWindowBorder,
	writeWindowControls,
} from '@/utils/config-values';

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const position = ref<BarPosition>('top');
const controls = ref<WindowControlsPreference>({ style: 'default', order: 'default' });
const border = ref<WindowBorderPreference>({ width: 'normal', color: 'scheme' });

/**
 * Las opciones de cada desplegable, como `{ value, label }`.
 *
 * Desde vue-libvasak 2.19.0 `SelectField` recibe las opciones por propiedad y ya
 * no por una ranura de `<option>`: van calculadas acá para que la etiqueta siga
 * el idioma de la sesión.
 */
const positionOptions = computed(() =>
	BAR_POSITIONS.map((side) => ({ value: side, label: t(`views.appearanceWindows.lados.${side}`) }))
);
const controlsStyleOptions = computed(() =>
	WINDOW_CONTROLS_STYLES.map((style) => ({
		value: style,
		label: t(`views.appearanceWindows.controlsStyles.${style}`),
	}))
);
const controlsOrderOptions = computed(() =>
	WINDOW_CONTROLS_ORDERS.map((order) => ({
		value: order,
		label: t(`views.appearanceWindows.controlsOrders.${order}`),
	}))
);
const borderWidthOptions = computed(() =>
	WINDOW_BORDER_WIDTHS.map((width) => ({
		value: width,
		label: t(`views.appearanceWindows.borderWidths.${width}`),
	}))
);
const borderColorOptions = computed(() =>
	WINDOW_BORDER_COLORS.map((color) => ({
		value: color,
		label: t(`views.appearanceWindows.borderColors.${color}`),
	}))
);

onMounted(async () => {
	try {
		await useConfigStore().loadConfig();
		vskConfig.value = await readConfig();
		position.value = readBarPosition(vskConfig.value);
		controls.value = readWindowControls(vskConfig.value);
		border.value = readWindowBorder(vskConfig.value);
	} catch (err) {
		error.value = t('views.appearanceWindows.errorLoading').replace('{0}', String(err));
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

		const config = vskConfig.value as unknown as Record<string, unknown>;
		writeBarPosition(config, position.value);
		writeWindowControls(config, controls.value);
		writeWindowBorder(config, border.value);
		await writeConfig(vskConfig.value);
		// Esta ventana también tiene que verse con el borde nuevo: el
		// config-manager lo aplica al cargar la configuración.
		await useConfigStore().loadConfig();

		successMessage.value = t('views.appearanceWindows.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceWindows.errorSaving').replace('{0}', String(err));
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
			:title="t('views.appearanceWindows.title')"
			:description="t('views.appearanceWindows.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceWindows.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.appearanceWindows.loading')" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<ConfigSection :title="t('views.appearanceWindows.bar')">

				<div class="flex items-start justify-between gap-4">
					<!-- Sólo la explicación: el nombre del control lo dice el `label`
					     del propio desplegable, y repetirlo acá lo escribe dos veces
					     una al lado de la otra. -->
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.barPositionHint') }}
					</p>
					<!-- La etiqueta va **dentro** del componente: un `<label>` suelto
					     al lado no está asociado a nada, y un lector de pantalla
					     anuncia un desplegable sin nombre. -->
					<SelectField
						v-model="position"
						:label="t('views.appearanceWindows.barPosition')"
						:options="positionOptions"
						class="w-48 shrink-0"
					/>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearanceWindows.controls')">
				<div class="flex items-start justify-between gap-4">
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.controlsStyleHint') }}
					</p>
					<SelectField
						v-model="controls.style"
						:label="t('views.appearanceWindows.controlsStyle')"
						:options="controlsStyleOptions"
						class="w-48 shrink-0"
					/>
				</div>
				<div class="flex items-start justify-between gap-4">
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.controlsOrderHint') }}
					</p>
					<SelectField
						v-model="controls.order"
						:label="t('views.appearanceWindows.controlsOrder')"
						:options="controlsOrderOptions"
						class="w-48 shrink-0"
					/>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearanceWindows.border')">
				<div class="flex items-start justify-between gap-4">
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.borderHint') }}
					</p>
					<SelectField
						v-model="border.width"
						:label="t('views.appearanceWindows.borderWidth')"
						:options="borderWidthOptions"
						class="w-48 shrink-0"
					/>
				</div>
				<div class="flex items-start justify-between gap-4">
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.borderColorHint') }}
					</p>
					<SelectField
						v-model="border.color"
						:label="t('views.appearanceWindows.borderColor')"
						:options="borderColorOptions"
						class="w-48 shrink-0"
					/>
				</div>
			</ConfigSection>
		</div>
	</div>
</template>
