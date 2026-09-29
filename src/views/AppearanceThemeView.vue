<script lang="ts" setup>
import {
	readConfig,
	setDarkMode,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, FormGroup, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { computed, onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue';
import SchemeCard from '@/components/scheme/SchemeCard.vue';
import SchemeColorEditor from '@/components/scheme/SchemeColorEditor.vue';
import SchemeResetControl from '@/components/scheme/SchemeResetControl.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import { useCustomScheme } from '@/composables/useCustomScheme';
import {
	getCurrentSystemState,
	getCursorThemes,
	getGtkThemes,
	getSchemeById,
	getSchemes,
	setSystemConfig,
} from '@/services/style.service';
import { getCurrentUserName } from '@/services/users.service';
import { clearStyle, SCHEME_KEY, writeScheme } from '@/tools/config-values';
import { CUSTOM_SCHEME_ID } from '@/tools/custom-scheme';
import type { SchemeEntry, SchemeFile, SchemeVariantColors } from '@/types/scheme';

interface SchemePreviewValue {
	label: string;
	value: string;
}

const { t } = useI18n();

const configStore = ref<any>(null);
const gtkThemes = ref<string[]>([]);
const cursorThemes = ref<string[]>([]);
const schemes = ref<SchemeEntry[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const selectedGtkTheme = ref('Adwaita');
const selectedCursorTheme = ref('Adwaita');
const selectedSchemeId = ref('');

const selectedScheme = computed(() => {
	return schemes.value.find((scheme) => scheme.scheme.id === selectedSchemeId.value) ?? null;
});

/** El esquema que dice el archivo de configuración: el que está en uso. */
const activeSchemeId = ref('');

/** Los esquemas que no son el «Personalizado», por nombre. */
const baseSchemes = computed(() =>
	schemes.value
		.filter((entry) => entry.scheme.id !== CUSTOM_SCHEME_ID)
		.sort((first, second) => first.scheme.name.localeCompare(second.scheme.name))
);

const baseSchemeOptions = computed(() =>
	baseSchemes.value.map((entry) => ({ label: entry.scheme.name, value: entry.scheme.id }))
);

const customEntry = computed(
	() => schemes.value.find((entry) => entry.scheme.id === CUSTOM_SCHEME_ID) ?? null
);

const isCustomSelected = computed(
	() => selectedSchemeId.value === CUSTOM_SCHEME_ID && customEntry.value !== null
);

const cardSwatches = (colors: SchemeVariantColors | undefined) =>
	colors
		? [
				colors.ui.background,
				colors.ui.surface,
				colors.ui.color.primary,
				colors.ui.color.secondary,
				colors.ui.text.main,
			]
		: [];

const customError = ref('');
const creatingCustom = ref(false);

/** Deja en la lista la versión recién guardada, en su lugar o primera. */
const upsertScheme = (entry: SchemeEntry) => {
	const index = schemes.value.findIndex((item) => item.scheme.id === entry.scheme.id);
	if (index === -1) schemes.value.unshift(entry);
	else schemes.value.splice(index, 1, entry);
};

// No se avisa ni se reaplica nada después de guardar: el vigilante del plugin
// ve el archivo cambiar y emite `config-changed`, y `App.vue` reaplica el
// esquema en esta ventana como en todas las demás. Reaplicarlo acá además
// haría que esta ventana recargue dos veces cada cambio.
const custom = useCustomScheme({ onSaved: upsertScheme });

watch(
	customEntry,
	(entry) => {
		// Sólo la primera vez: después el editor es la fuente de verdad, y
		// volver a cargar lo guardado pisaría un cambio todavía en el
		// antirrebote.
		if (entry && !custom.scheme.value) custom.load(entry.scheme);
	},
	{ immediate: true }
);

watch(custom.error, (err) => {
	customError.value = err
		? t('views.appearanceTheme.custom.saveError').replace('{0}', String(err))
		: '';
});

/**
 * Deja un esquema como el que está en uso, por el mismo camino que «Aplicar
 * cambios»: la clave que se lee, sin las claves muertas, y el archivo entero.
 *
 * Se parte de una lectura nueva y no de lo que la pantalla tiene cargado, para
 * no guardar de paso un radio o un modo oscuro que el usuario tocó y todavía no
 * aplicó.
 */
const applyScheme = async (id: string) => {
	const fresh = (await readConfig()) ?? vskConfig.value;
	if (!fresh) return;
	writeScheme(fresh.style, id);
	clearStyle(fresh.style);
	await writeConfig(fresh);
	activeSchemeId.value = id;
	if (vskConfig.value) writeScheme(vskConfig.value.style, id);
	// Tampoco se reaplica acá: escribir `vasak.conf` ya dispara `config-changed`.
};

const customIdentity = (base: SchemeFile) => ({
	name: t('views.appearanceTheme.custom.name'),
	description: t('views.appearanceTheme.custom.basedOn').replace('{0}', base.name),
});

/** «Crear a partir del actual»: clona el esquema en uso, lo guarda y lo usa. */
const createCustom = async () => {
	creatingCustom.value = true;
	customError.value = '';
	try {
		const { created } = await custom.ensureCustom(customEntry.value?.scheme ?? null, async () => {
			const baseId = activeSchemeId.value || selectedSchemeId.value;
			const found = await getSchemeById(baseId);
			if (!found?.scheme) throw new Error(baseId);
			const base = found.scheme as SchemeFile;
			const author = await getCurrentUserName();
			return { base, identity: { ...customIdentity(base), author } };
		});
		selectedSchemeId.value = CUSTOM_SCHEME_ID;
		if (created) await applyScheme(CUSTOM_SCHEME_ID);
	} catch (err) {
		customError.value = t('views.appearanceTheme.custom.createError').replace('{0}', String(err));
		console.error(err);
	} finally {
		creatingCustom.value = false;
	}
};

/** «Empezar de nuevo desde…», ya confirmado por el diálogo. */
const resetCustom = async (baseId: string) => {
	const base = baseSchemes.value.find((entry) => entry.scheme.id === baseId);
	if (!base) return;
	customError.value = '';
	try {
		const author = custom.scheme.value?.author || (await getCurrentUserName());
		await custom.createFrom(base.scheme, { ...customIdentity(base.scheme), author });
	} catch (err) {
		customError.value = t('views.appearanceTheme.custom.createError').replace('{0}', String(err));
		console.error(err);
	}
};

onBeforeUnmount(() => {
	// Un color cambiado justo antes de salir de la pantalla no se pierde.
	custom.flush().catch((err) => console.error(err));
});

const buildPreviewValues = (variant?: SchemeVariantColors): SchemePreviewValue[] => {
	if (!variant) {
		return [];
	}

	return [
		{ label: t('views.appearanceTheme.colors.background'), value: variant.ui.background },
		{ label: t('views.appearanceTheme.colors.surface'), value: variant.ui.surface },
		{ label: t('views.appearanceTheme.colors.border'), value: variant.ui.border },
		{ label: t('views.appearanceTheme.colors.primary'), value: variant.ui.color.primary },
		{ label: t('views.appearanceTheme.colors.secondary'), value: variant.ui.color.secondary },
		{ label: t('views.appearanceTheme.colors.text'), value: variant.ui.text.main },
		{ label: t('views.appearanceTheme.colors.textMuted'), value: variant.ui.text.muted },
		{ label: t('views.appearanceTheme.colors.onPrimary'), value: variant.ui.text['on-primary'] },
		{
			label: t('views.appearanceTheme.colors.terminalBackground'),
			value: variant.terminal.background,
		},
		{
			label: t('views.appearanceTheme.colors.terminalForeground'),
			value: variant.terminal.foreground,
		},
	];
};

const selectedDarkPreview = computed(() =>
	buildPreviewValues(selectedScheme.value?.scheme.colors.dark)
);
const selectedLightPreview = computed(() =>
	buildPreviewValues(selectedScheme.value?.scheme.colors.light)
);

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		try {
			const systemState = await getCurrentSystemState();
			selectedGtkTheme.value = systemState.gtk_theme || 'Adwaita';
			selectedCursorTheme.value = systemState.cursor_theme || 'Adwaita';
		} catch (err) {
			console.warn('No se pudo obtener estado del sistema, usando valores por defecto:', err);
			selectedGtkTheme.value = 'Adwaita';
			selectedCursorTheme.value = 'Adwaita';
		}

		const [themes, cursors, loadedSchemes] = await Promise.all([
			getGtkThemes(),
			getCursorThemes(),
			getSchemes(),
		]);

		gtkThemes.value = Array.isArray(themes) && themes.length ? themes : ['Adwaita'];
		cursorThemes.value = Array.isArray(cursors) && cursors.length ? cursors : ['Adwaita'];
		schemes.value = Array.isArray(loadedSchemes) ? loadedSchemes : [];

		// Antes esto caía a `style.color_scheme` cuando la clave con guión no
		// estaba. Era caer a la clave mal escrita —la que hacía que elegir un
		// esquema no cambiara nada—, así que el respaldo tapaba el error en la
		// pantalla mientras el sistema seguía con el esquema viejo.
		const storedSchemeId = vskConfig.value?.style?.[SCHEME_KEY] || '';
		selectedSchemeId.value = storedSchemeId;
		activeSchemeId.value = storedSchemeId;

		if (selectedGtkTheme.value && !gtkThemes.value.includes(selectedGtkTheme.value)) {
			gtkThemes.value.unshift(selectedGtkTheme.value);
		}
		if (selectedCursorTheme.value && !cursorThemes.value.includes(selectedCursorTheme.value)) {
			cursorThemes.value.unshift(selectedCursorTheme.value);
		}

		if (selectedSchemeId.value) {
			const schemeExists = schemes.value.some(
				(scheme) => scheme.scheme.id === selectedSchemeId.value
			);
			if (!schemeExists) {
				try {
					const selectedSchemeData = await getSchemeById(selectedSchemeId.value);
					if (selectedSchemeData?.scheme?.id) {
						schemes.value.unshift(selectedSchemeData);
					} else if (schemes.value.length > 0) {
						selectedSchemeId.value = schemes.value[0].scheme.id;
					}
				} catch (schemeErr) {
					console.warn(
						'No se pudo cargar el scheme guardado, usando el primero disponible:',
						schemeErr
					);
					if (schemes.value.length > 0) {
						selectedSchemeId.value = schemes.value[0].scheme.id;
					}
				}
			}
		} else if (schemes.value.length > 0) {
			selectedSchemeId.value = schemes.value[0].scheme.id;
		}
	} catch (err) {
		error.value = t('views.appearanceTheme.errorLoading').replace('{0}', String(err));
		console.error(err);
	} finally {
		loading.value = false;
	}
});

const applySystemChanges = async () => {
	try {
		const config = {
			dark_mode: vskConfig.value?.style?.darkmode || false,
			cursor_theme: selectedCursorTheme.value,
			gtk_theme: selectedGtkTheme.value,
		};
		await setSystemConfig({ config });
	} catch (err) {
		console.error('Error aplicando cambios del sistema:', err);
	}
};

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (
			!vskConfig.value?.style?.radius ||
			vskConfig.value.style.radius < 1 ||
			vskConfig.value.style.radius > 20
		) {
			throw new Error(t('views.appearanceTheme.invalidRadius'));
		}

		if (!selectedSchemeId.value) {
			throw new Error(t('views.appearanceTheme.schemeRequired'));
		}

		if (vskConfig.value?.style?.darkmode !== (configStore.value.config?.style?.darkmode || false)) {
			await setDarkMode(vskConfig.value?.style?.darkmode || false);
		}

		if (vskConfig.value) {
			writeScheme(vskConfig.value.style, selectedSchemeId.value);
			clearStyle(vskConfig.value.style);
		}

		await writeConfig(vskConfig.value);
		await applySystemChanges();

		successMessage.value = t('views.appearanceTheme.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceTheme.errorSaving').replace('{0}', String(err));
		console.error(err);
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return selectedGtkTheme.value && selectedCursorTheme.value && selectedSchemeId.value;
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceTheme.title')"
			:description="t('views.appearanceTheme.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="!isFormValid || saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceTheme.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceTheme.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<div class="grid gap-4 xl:grid-cols-2">
				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-main">{{ t('views.appearanceTheme.baseStyles') }}</h3>
					<div class="flex flex-col gap-5">
						<FormGroup :label="t('views.appearanceTheme.borderRadius')" html-for="border-radius" :label-class="'flex justify-between w-full'">
							<template #default>
								<div class="flex items-center gap-3">
									<span class="w-6 text-xs text-tx-muted">1px</span>
									<RangeSlider v-if="vskConfig" id="border-radius" v-model="vskConfig.style.radius" :min="1" :max="20" />
									<span class="w-8 text-right text-xs text-tx-muted">{{ vskConfig?.style.radius }}px</span>
								</div>
							</template>
						</FormGroup>

						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.darkMode') }}</label>
							<div class="flex items-center gap-3">
								<SwitchToggle :label="t('views.appearanceTheme.darkMode')" v-if="vskConfig" :model-value="vskConfig.style.darkmode" @update:model-value="val => (vskConfig!.style.darkmode = val)" />
								<span class="w-20 text-xs text-tx-muted">{{ vskConfig?.style.darkmode ? t('views.appearanceTheme.enabled') : t('views.appearanceTheme.disabled') }}</span>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-main">{{ t('views.appearanceTheme.systemThemes') }}</h3>
					<div class="flex flex-col gap-5">
						<FormGroup :label="t('views.appearanceTheme.gtkTheme')" html-for="gtk-theme">
							<SelectInput id="gtk-theme" v-model="selectedGtkTheme" :options="gtkThemes" />
						</FormGroup>

						<FormGroup :label="t('views.appearanceTheme.cursorTheme')" html-for="cursor-theme">
							<SelectInput id="cursor-theme" v-model="selectedCursorTheme" :options="cursorThemes" />
						</FormGroup>
					</div>
				</SectionCard>
			</div>

			<SectionCard>
				<div class="mb-4 flex flex-col gap-1">
					<h3 class="text-lg font-medium text-tx-main">{{ t('views.appearanceTheme.schemeSection') }}</h3>
					<p class="text-sm text-tx-muted">
						{{ t('views.appearanceTheme.schemeHintPrefix') }} <span class="font-mono">scheme id</span> {{ t('views.appearanceTheme.schemeHintSuffix') }}
					</p>
				</div>

				<div class="flex flex-col gap-5">
					<AlertMessage v-if="customError" tone="error">{{ customError }}</AlertMessage>

					<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" :aria-label="t('views.appearanceTheme.schemeList')">
						<!-- «Personalizado» va primero, exista o no. -->
						<li>
							<SchemeCard
								v-if="customEntry"
								:title="custom.scheme.value?.name ?? customEntry.scheme.name"
								:subtitle="custom.scheme.value?.description ?? customEntry.scheme.description"
								:swatches="cardSwatches(custom.scheme.value?.colors.dark ?? customEntry.scheme.colors.dark)"
								:selected="selectedSchemeId === CUSTOM_SCHEME_ID"
								@select="selectedSchemeId = CUSTOM_SCHEME_ID"
							/>
							<div
								v-else
								class="flex h-full flex-col justify-between gap-3 rounded-corner border border-dashed border-ui-border bg-ui-surface/70 p-3"
							>
								<div class="min-w-0">
									<p class="text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.custom.name') }}</p>
									<p class="text-xs text-tx-muted">{{ t('views.appearanceTheme.custom.createHint') }}</p>
								</div>
								<button
									type="button"
									data-create-custom
									class="w-fit rounded-corner border border-primary bg-ui-surface/70 px-3 py-1.5 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
									:disabled="creatingCustom || !(activeSchemeId || selectedSchemeId)"
									@click="createCustom"
								>
									{{ creatingCustom ? t('common.saving') : t('views.appearanceTheme.custom.create') }}
								</button>
							</div>
						</li>
						<li v-for="entry in baseSchemes" :key="entry.scheme.id">
							<SchemeCard
								:title="entry.scheme.name"
								:subtitle="entry.scheme.id"
								:swatches="cardSwatches(entry.scheme.colors.dark)"
								:selected="selectedSchemeId === entry.scheme.id"
								@select="selectedSchemeId = entry.scheme.id"
							/>
						</li>
					</ul>

					<div v-if="isCustomSelected && custom.scheme.value" class="flex flex-col gap-4 rounded-corner border border-ui-border bg-ui-surface/70 p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<h4 class="text-base font-medium text-tx-main">{{ custom.scheme.value.name }}</h4>
								<p class="text-sm text-tx-muted">{{ custom.scheme.value.description }}</p>
								<p class="mt-1 font-mono text-xs text-tx-muted">{{ customEntry?.path }}</p>
							</div>
							<span class="text-xs text-tx-muted" aria-live="polite">
								{{ custom.saving.value ? t('common.saving') : '' }}
							</span>
						</div>

						<AlertMessage v-if="activeSchemeId !== CUSTOM_SCHEME_ID" tone="info">
							{{ t('views.appearanceTheme.custom.notActive') }}
						</AlertMessage>

						<SchemeColorEditor
							:scheme="custom.scheme.value"
							:initial-variant="vskConfig?.style.darkmode === false ? 'light' : 'dark'"
							@update="(variant, patch) => custom.updateColors(variant, patch)"
						/>

						<SchemeResetControl :options="baseSchemeOptions" @reset="resetCustom" />
					</div>

					<div v-else-if="selectedScheme && selectedScheme.scheme.id !== CUSTOM_SCHEME_ID" class="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
						<div class="rounded-corner border border-ui-border bg-ui-surface/70 p-4">
							<div class="mb-4 flex flex-col gap-1">
								<div class="flex items-center justify-between gap-3">
									<h4 class="text-base font-medium text-tx-main">{{ selectedScheme.scheme.name }}</h4>
									<span class="rounded-full border border-ui-border px-2 py-0.5 text-[11px] uppercase tracking-wider text-tx-muted">
										{{ selectedScheme.scheme.version }}
									</span>
								</div>
								<p class="text-sm text-tx-muted">{{ selectedScheme.scheme.description }}</p>
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								<div class="rounded-corner border border-ui-border bg-ui-bg/80 p-3">
									<div class="mb-3 flex items-center justify-between">
										<span class="text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.dark') }}</span>
										<span class="text-xs text-tx-muted">{{ selectedScheme.scheme.colors.dark.ui.background }}</span>
									</div>
									<div class="grid gap-2">
										<div
											v-for="swatch in selectedDarkPreview"
											:key="`dark-${swatch.label}`"
											class="flex items-center gap-2 rounded-corner border border-ui-border/70 bg-ui-surface/70 p-2"
										>
											<div class="h-8 w-8 rounded-corner border border-ui-border/60" :style="{ backgroundColor: swatch.value }" />
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-medium text-tx-main">{{ swatch.label }}</p>
												<p class="truncate text-[11px] text-tx-muted">{{ swatch.value }}</p>
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-corner border border-ui-border bg-ui-bg/80 p-3">
									<div class="mb-3 flex items-center justify-between">
										<span class="text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.light') }}</span>
										<span class="text-xs text-tx-muted">{{ selectedScheme.scheme.colors.light.ui.background }}</span>
									</div>
									<div class="grid gap-2">
										<div
											v-for="swatch in selectedLightPreview"
											:key="`light-${swatch.label}`"
											class="flex items-center gap-2 rounded-corner border border-ui-border/70 bg-ui-surface/70 p-2"
										>
											<div class="h-8 w-8 rounded-corner border border-ui-border/60" :style="{ backgroundColor: swatch.value }" />
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-medium text-tx-main">{{ swatch.label }}</p>
												<p class="truncate text-[11px] text-tx-muted">{{ swatch.value }}</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="rounded-corner border border-ui-border bg-ui-surface/30 p-4">
							<h4 class="mb-3 text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.schemeInfo') }}</h4>
							<div class="space-y-3 text-sm text-tx-muted">
								<p><span class="font-medium text-tx-main">ID:</span> {{ selectedScheme.scheme.id }}</p>
								<p><span class="font-medium text-tx-main">{{ t('views.appearanceTheme.author') }}:</span> {{ selectedScheme.scheme.author || t('views.appearanceTheme.notSpecified') }}</p>
								<p><span class="font-medium text-tx-main">{{ t('views.appearanceTheme.path') }}:</span> {{ selectedScheme.path }}</p>
							</div>
						</div>
					</div>

					<EmptyStateBox v-else :message="t('views.appearanceTheme.noSchemes')" padding="md" />
				</div>
			</SectionCard>
		</div>
	</div>
</template>
