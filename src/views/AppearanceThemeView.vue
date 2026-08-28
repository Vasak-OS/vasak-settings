<script lang="ts" setup>
import {
	readConfig,
	setDarkMode,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import type { Store } from 'pinia';
import { computed, onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';
import {
	getCurrentSystemState,
	getCursorThemes,
	getGtkThemes,
	getSchemeById,
	getSchemes,
	setSystemConfig,
} from '@/services/style.service';

interface SchemePreviewValue {
	label: string;
	value: string;
}

interface SchemeVariant {
	ui: {
		color: {
			primary: string;
			secondary: string;
		};
		text: {
			main: string;
			muted: string;
			'on-primary': string;
		};
		background: string;
		border: string;
		surface: string;
	};
	terminal: {
		foreground: string;
		background: string;
		cursor: string;
	};
}

interface SchemeItem {
	path: string;
	scheme: {
		id: string;
		name: string;
		author: string;
		description: string;
		version: string;
		colors: {
			dark: SchemeVariant;
			light: SchemeVariant;
		};
	};
}

const { t } = useI18n();

const configStore = ref<any>(null);
const gtkThemes = ref<string[]>([]);
const cursorThemes = ref<string[]>([]);
const schemes = ref<SchemeItem[]>([]);
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

const schemeOptions = computed(() => {
	return schemes.value
		.slice()
		.sort((first, second) => first.scheme.name.localeCompare(second.scheme.name))
		.map((scheme) => ({
			label: `${scheme.scheme.name} · ${scheme.scheme.id}`,
			value: scheme.scheme.id,
		}));
});

const buildPreviewValues = (variant?: SchemeVariant): SchemePreviewValue[] => {
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
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;

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

		const storedSchemeId =
			vskConfig.value?.style?.['color-scheme'] ||
			configStore.value.config?.style?.color_scheme ||
			'';
		selectedSchemeId.value = storedSchemeId;

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
			(vskConfig.value.style as any).color_scheme = selectedSchemeId.value;
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
			<AlertMessage v-if="error" :message="error" tone="error" />
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-2">
				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceTheme.baseStyles') }}</h3>
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

						<FormGroup :label="t('views.appearanceTheme.primaryColor')" html-for="primary-color">
							<div class="flex items-center gap-3">
								<input
									v-if="vskConfig"
									id="primary-color"
									type="color"
									v-model="(vskConfig.style as any)['primarycolor']"
									class="h-10 w-[50px] cursor-pointer rounded-corner border-2 border-ui-surface/10 bg-transparent p-0 transition-colors duration-200 hover:border-primary"
								/>
								<TextInput
									v-if="vskConfig"
									mono
									class="flex-1"
									v-model="(vskConfig.style as any)['primarycolor']"
									placeholder="#0084FF"
								/>
							</div>
						</FormGroup>

						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">{{ t('views.appearanceTheme.darkMode') }}</label>
							<div class="flex items-center gap-3">
								<SwitchToggle v-if="vskConfig" :is-on="vskConfig.style.darkmode" @toggle="val => (vskConfig!.style.darkmode = val)" />
								<span class="w-20 text-xs text-tx-muted">{{ vskConfig?.style.darkmode ? t('views.appearanceTheme.enabled') : t('views.appearanceTheme.disabled') }}</span>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceTheme.systemThemes') }}</h3>
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
					<h3 class="text-lg font-medium text-tx-primary">{{ t('views.appearanceTheme.schemeSection') }}</h3>
					<p class="text-sm text-tx-muted">
						{{ t('views.appearanceTheme.schemeHintPrefix') }} <span class="font-mono">scheme id</span> {{ t('views.appearanceTheme.schemeHintSuffix') }}
					</p>
				</div>

				<div class="flex flex-col gap-5">
					<FormGroup :label="t('views.appearanceTheme.schemeIdLabel')" html-for="scheme-id">
						<SelectInput
							id="scheme-id"
							v-model="selectedSchemeId"
							:options="schemeOptions"
							:disabled="schemeOptions.length === 0"
						/>
					</FormGroup>

					<div v-if="selectedScheme" class="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
						<div class="rounded-corner border border-ui-border bg-ui-surface/40 p-4">
							<div class="mb-4 flex flex-col gap-1">
								<div class="flex items-center justify-between gap-3">
									<h4 class="text-base font-medium text-tx-primary">{{ selectedScheme.scheme.name }}</h4>
									<span class="rounded-full border border-ui-border px-2 py-0.5 text-[11px] uppercase tracking-wider text-tx-muted">
										{{ selectedScheme.scheme.version }}
									</span>
								</div>
								<p class="text-sm text-tx-muted">{{ selectedScheme.scheme.description }}</p>
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								<div class="rounded-corner border border-ui-border bg-ui-bg/80 p-3">
									<div class="mb-3 flex items-center justify-between">
										<span class="text-sm font-medium text-tx-primary">{{ t('views.appearanceTheme.dark') }}</span>
										<span class="text-xs text-tx-muted">{{ selectedScheme.scheme.colors.dark.ui.background }}</span>
									</div>
									<div class="grid gap-2">
										<div
											v-for="swatch in selectedDarkPreview"
											:key="`dark-${swatch.label}`"
											class="flex items-center gap-2 rounded-corner border border-ui-border/70 bg-ui-surface/40 p-2"
										>
											<div class="h-8 w-8 rounded-corner border border-ui-border/60" :style="{ backgroundColor: swatch.value }" />
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-medium text-tx-primary">{{ swatch.label }}</p>
												<p class="truncate text-[11px] text-tx-muted">{{ swatch.value }}</p>
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-corner border border-ui-border bg-ui-bg/80 p-3">
									<div class="mb-3 flex items-center justify-between">
										<span class="text-sm font-medium text-tx-primary">{{ t('views.appearanceTheme.light') }}</span>
										<span class="text-xs text-tx-muted">{{ selectedScheme.scheme.colors.light.ui.background }}</span>
									</div>
									<div class="grid gap-2">
										<div
											v-for="swatch in selectedLightPreview"
											:key="`light-${swatch.label}`"
											class="flex items-center gap-2 rounded-corner border border-ui-border/70 bg-ui-surface/40 p-2"
										>
											<div class="h-8 w-8 rounded-corner border border-ui-border/60" :style="{ backgroundColor: swatch.value }" />
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-medium text-tx-primary">{{ swatch.label }}</p>
												<p class="truncate text-[11px] text-tx-muted">{{ swatch.value }}</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="rounded-corner border border-ui-border bg-ui-surface/30 p-4">
							<h4 class="mb-3 text-sm font-medium text-tx-primary">{{ t('views.appearanceTheme.schemeInfo') }}</h4>
							<div class="space-y-3 text-sm text-tx-muted">
								<p><span class="font-medium text-tx-primary">ID:</span> {{ selectedScheme.scheme.id }}</p>
								<p><span class="font-medium text-tx-primary">{{ t('views.appearanceTheme.author') }}:</span> {{ selectedScheme.scheme.author || t('views.appearanceTheme.notSpecified') }}</p>
								<p><span class="font-medium text-tx-primary">{{ t('views.appearanceTheme.path') }}:</span> {{ selectedScheme.path }}</p>
							</div>
						</div>
					</div>

					<EmptyStateBox v-else :message="t('views.appearanceTheme.noSchemes')" padding="md" />
				</div>
			</SectionCard>
		</div>
	</div>
</template>
