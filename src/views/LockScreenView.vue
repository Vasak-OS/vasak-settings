<script lang="ts" setup>
/**
 * El aspecto de la pantalla de bloqueo.
 *
 * Edita la sección `lock` de `vasak.conf`: el reloj, el fondo y qué elementos
 * aparecen. `vasak-session-manager` lee las mismas claves para armar el bloqueo
 * —el contrato se lee/escribe con los ayudantes de `config-values.ts`, que
 * validan el tipo porque el archivo se puede editar a mano—. Los valores por
 * omisión reproducen la pantalla de hoy.
 *
 * Es config de cada usuario, no del sistema: a diferencia de la pantalla de
 * inicio de sesión (`LoginScreenView`), se guarda en `vasak.conf` y no pide
 * permiso de administrador. El campo de contraseña no se puede ocultar: el
 * bloqueo nunca se queda sin forma de desbloquear.
 *
 * Al guardar se conserva el resto de la sección por si en el futuro se suman
 * widgets (clima, agenda) que esta pantalla todavía no edita.
 */
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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
	SegmentedControl,
	type SegmentedOption,
	SettingRow,
	SwitchRow,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, type Ref, ref } from 'vue';
import {
	DEFAULT_LOCK_BACKGROUND_SOURCE,
	DEFAULT_LOCK_CLOCK_FORMAT,
	DEFAULT_LOCK_CLOCK_SIZE,
	LOCK_BACKGROUND_SOURCES,
	LOCK_CLOCK_FORMATS,
	LOCK_CLOCK_SIZES,
	type LockBackgroundSource,
	type LockClockFormat,
	type LockClockSize,
	type LockSettings,
	readLockSettings,
	writeLockSettings,
} from '@/utils/config-values';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);

/** El estado de la pantalla, con los valores de fábrica hasta que se lee el archivo. */
const settings = ref<LockSettings>({
	clockFormat: DEFAULT_LOCK_CLOCK_FORMAT,
	showDate: true,
	clockSize: DEFAULT_LOCK_CLOCK_SIZE,
	backgroundSource: DEFAULT_LOCK_BACKGROUND_SOURCE,
	backgroundImage: '',
	dimBackground: true,
	showMedia: true,
	showNotifications: true,
});

/** La imagen propia sólo tiene sentido —y sus controles— con el origen `image`. */
const usesImage = computed(() => settings.value.backgroundSource === 'image');

/** El nombre del archivo del fondo propio, sin la ruta entera. */
const backgroundImageName = computed(() => {
	const path = settings.value.backgroundImage;
	return path ? (path.split('/').pop() ?? path) : '';
});

const clockFormatOptions = computed<SegmentedOption<LockClockFormat>[]>(() =>
	LOCK_CLOCK_FORMATS.map((value) => ({
		value,
		label: t(`views.lockScreen.clockFormats.${value}`),
	}))
);

const clockSizeOptions = computed<SegmentedOption<LockClockSize>[]>(() =>
	LOCK_CLOCK_SIZES.map((value) => ({
		value,
		label: t(`views.lockScreen.clockSizes.${value}`),
	}))
);

const backgroundSourceOptions = computed<SegmentedOption<LockBackgroundSource>[]>(() =>
	LOCK_BACKGROUND_SOURCES.map((value) => ({
		value,
		label: t(`views.lockScreen.backgroundSources.${value}`),
	}))
);

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		settings.value = readLockSettings(vskConfig.value);
	} catch (err) {
		error.value = t('views.lockScreen.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const pickBackgroundImage = async () => {
	try {
		const picked = await openDialog({
			multiple: false,
			directory: false,
			title: t('views.lockScreen.backgroundImagePick'),
			filters: [
				{
					name: t('views.lockScreen.imageFilter'),
					extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'],
				},
			],
		});
		if (typeof picked === 'string') settings.value.backgroundImage = picked;
	} catch (err) {
		// No se guardó nada: el error es del selector, no del guardado.
		error.value = t('views.lockScreen.backgroundImageError').replace('{0}', String(err));
	}
};

const clearBackgroundImage = () => {
	settings.value.backgroundImage = '';
};

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		// Se relee justo antes de escribir, no la copia de la carga: entre medio
		// pudieron cambiar otras claves de `lock` (o de otras secciones), y
		// `writeConfig` escribe el objeto tal cual. `writeLockSettings` conserva el
		// resto sobre la copia fresca.
		const latest = await readConfig();
		if (!latest) throw new Error('configuración no disponible');

		writeLockSettings(latest as unknown as Record<string, unknown>, settings.value);
		await writeConfig(latest);
		vskConfig.value = latest;

		successMessage.value = t('views.lockScreen.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.lockScreen.errorSaving').replace('{0}', String(err));
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
			:title="t('views.lockScreen.title')"
			:description="t('views.lockScreen.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.lockScreen.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.lockScreen.loading')" />

		<div v-else class="@container flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<ConfigSection :title="t('views.lockScreen.clock')" :description="t('views.lockScreen.clockHint')">
				<div class="flex flex-col gap-4">
					<SettingRow :label="t('views.lockScreen.clockFormat')">
						<SegmentedControl
							:model-value="settings.clockFormat"
							:label="t('views.lockScreen.clockFormat')"
							:options="clockFormatOptions"
							@update:model-value="(value) => { if (value) settings.clockFormat = value; }"
						/>
					</SettingRow>

					<SettingRow :label="t('views.lockScreen.clockSize')">
						<SegmentedControl
							:model-value="settings.clockSize"
							:label="t('views.lockScreen.clockSize')"
							:options="clockSizeOptions"
							@update:model-value="(value) => { if (value) settings.clockSize = value; }"
						/>
					</SettingRow>

					<SwitchRow
						v-model="settings.showDate"
						:label="t('views.lockScreen.showDate')"
						:description="t('views.lockScreen.showDateHint')"
					/>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.lockScreen.background')" :description="t('views.lockScreen.backgroundHint')">
				<div class="flex flex-col gap-4">
					<SettingRow :label="t('views.lockScreen.backgroundSource')">
						<SegmentedControl
							:model-value="settings.backgroundSource"
							variant="chips"
							:label="t('views.lockScreen.backgroundSource')"
							:options="backgroundSourceOptions"
							@update:model-value="(value) => { if (value) settings.backgroundSource = value; }"
						/>
					</SettingRow>

					<template v-if="usesImage">
						<SettingRow
							:label="t('views.lockScreen.backgroundImage')"
							:description="t('views.lockScreen.backgroundImageHint')"
						>
							<div class="flex min-w-0 items-center gap-2">
								<span v-if="backgroundImageName" class="min-w-0 flex-1 truncate text-sm text-tx-muted">
									{{ backgroundImageName }}
								</span>
								<span v-else class="min-w-0 flex-1 truncate text-sm text-tx-muted">
									{{ t('views.lockScreen.backgroundImageNone') }}
								</span>
								<button
									type="button"
									class="shrink-0 rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-sm font-medium hover:bg-ui-surface"
									@click="pickBackgroundImage"
								>
									{{ t('views.lockScreen.backgroundImageChoose') }}
								</button>
								<button
									v-if="backgroundImageName"
									type="button"
									class="shrink-0 rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-sm font-medium hover:bg-ui-surface"
									@click="clearBackgroundImage"
								>
									{{ t('common.clear') }}
								</button>
							</div>
						</SettingRow>

						<SwitchRow
							v-model="settings.dimBackground"
							:label="t('views.lockScreen.dimBackground')"
							:description="t('views.lockScreen.dimBackgroundHint')"
						/>
					</template>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.lockScreen.elements')" :description="t('views.lockScreen.elementsHint')">
				<div class="flex flex-col gap-4">
					<SwitchRow
						v-model="settings.showMedia"
						:label="t('views.lockScreen.showMedia')"
						:description="t('views.lockScreen.showMediaHint')"
					/>
					<SwitchRow
						v-model="settings.showNotifications"
						:label="t('views.lockScreen.showNotifications')"
						:description="t('views.lockScreen.showNotificationsHint')"
					/>
				</div>
			</ConfigSection>
		</div>
	</div>
</template>
