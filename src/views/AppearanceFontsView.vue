<script lang="ts" setup>
import {
	readConfig,
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
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { fijarNitidez, nitidezActiva } from '@/services/nitidez.service';
import { getSystemFonts, type SystemFontItem } from '@/services/style.service';

type FontTarget = 'terminal' | 'title' | 'apps';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const fonts = ref<SystemFontItem[]>([]);
const searchQuery = ref('');
const activeTarget = ref<FontTarget>('terminal');

/**
 * El engrosado de trazos de FreeType.
 *
 * Aparte de las familias porque es otra cosa: las de arriba eligen **qué** letra
 * se usa y ésta **cómo** se dibuja. Y se guarda sola, sin pasar por «Aplicar
 * cambios», porque no vive en la configuración de VasakOS sino en un archivo de
 * entorno de la sesión.
 */
const nitidez = ref(false);
const guardandoNitidez = ref(false);

const selectedFonts = ref<Record<FontTarget, string>>({
	terminal: '',
	title: '',
	apps: '',
});

const targetOptions = computed(() => [
	{ label: t('views.appearanceFonts.targets.terminal'), value: 'terminal' },
	{ label: t('views.appearanceFonts.targets.title'), value: 'title' },
	{ label: t('views.appearanceFonts.targets.apps'), value: 'apps' },
]);

const uniqueFonts = computed(() => {
	const seen = new Set<string>();
	return fonts.value
		.filter((font) => {
			if (seen.has(font.name)) {
				return false;
			}
			seen.add(font.name);
			return true;
		})
		.sort((first, second) => first.name.localeCompare(second.name));
});

const filteredFonts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();
	const list = uniqueFonts.value.filter((font) => {
		if (!query) {
			return true;
		}

		return [font.name, font.fontName, font.path].some((value) =>
			value.toLowerCase().includes(query)
		);
	});

	return list.slice(0, 180);
});

const fontStack = (fontName: string) => {
	if (!fontName) {
		return 'sans-serif';
	}

	return `'${fontName.replace(/'/g, "\\'")}', sans-serif`;
};

const pickFont = (font: SystemFontItem) => {
	selectedFonts.value[activeTarget.value] = font.name;
};

const updateSelectionFromConfig = () => {
	selectedFonts.value = {
		terminal: vskConfig.value?.fonts?.terminal || '',
		title: vskConfig.value?.fonts?.title || '',
		apps: vskConfig.value?.fonts?.apps || '',
	};
};

onMounted(async () => {
	try {
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;
		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();
		updateSelectionFromConfig();

		const loadedFonts = await getSystemFonts();
		fonts.value = Array.isArray(loadedFonts) ? loadedFonts : [];

		if (!selectedFonts.value.terminal && uniqueFonts.value.length > 0) {
			selectedFonts.value.terminal = uniqueFonts.value[0].name;
		}
		if (!selectedFonts.value.title && uniqueFonts.value.length > 1) {
			selectedFonts.value.title = uniqueFonts.value[1].name;
		}
		if (!selectedFonts.value.apps && uniqueFonts.value.length > 2) {
			selectedFonts.value.apps = uniqueFonts.value[2].name;
		}
		nitidez.value = await nitidezActiva();
	} catch (err) {
		error.value = t('views.appearanceFonts.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const alternarNitidez = async (valor: boolean) => {
	guardandoNitidez.value = true;
	error.value = '';
	try {
		await fijarNitidez(valor);
		nitidez.value = valor;
	} catch (err) {
		error.value = t('views.appearanceFonts.errorSaving').replace('{0}', String(err));
	} finally {
		guardandoNitidez.value = false;
	}
};

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (!vskConfig.value) {
			throw new Error(t('views.appearanceFonts.configNotLoaded'));
		}

		vskConfig.value.fonts = {
			terminal: selectedFonts.value.terminal,
			title: selectedFonts.value.title,
			apps: selectedFonts.value.apps,
		};

		await writeConfig(vskConfig.value);
		successMessage.value = t('views.appearanceFonts.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceFonts.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return Boolean(
		selectedFonts.value.terminal && selectedFonts.value.title && selectedFonts.value.apps
	);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceFonts.title')"
			:description="t('views.appearanceFonts.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="!isFormValid || saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceFonts.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceFonts.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-[360px_1fr]">
				<SectionCard>
					<div class="flex flex-col gap-4">
						<FormGroup :label="t('views.appearanceFonts.activeTarget')" html-for="font-target">
							<SelectInput id="font-target" v-model="activeTarget" :options="targetOptions" />
						</FormGroup>

						<FormGroup :label="t('views.appearanceFonts.searchFont')" html-for="font-search">
							<template #default>
								<input
									id="font-search"
									v-model="searchQuery"
									type="text"
									:placeholder="t('views.appearanceFonts.searchPlaceholder')"
									class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary transition-colors placeholder:text-tx-muted/70 focus:border-primary"
								/>
							</template>
						</FormGroup>

						<div class="rounded-corner border border-ui-border bg-ui-bg/60 p-4">
							<div class="mb-3 text-sm font-medium text-tx-primary">{{ t('views.appearanceFonts.currentSelections') }}</div>
							<div class="space-y-3 text-sm text-tx-muted">
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">{{ t('views.appearanceFonts.targets.terminal') }}</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.terminal) }">
										{{ selectedFonts.terminal || t('views.appearanceFonts.noFontAssigned') }}
									</div>
								</div>
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">{{ t('views.appearanceFonts.targets.title') }}</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.title) }">
										{{ selectedFonts.title || t('views.appearanceFonts.noFontAssigned') }}
									</div>
								</div>
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">{{ t('views.appearanceFonts.targets.apps') }}</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.apps) }">
										{{ selectedFonts.apps || t('views.appearanceFonts.noFontAssigned') }}
									</div>
								</div>
							</div>
						</div>
					</div>
				</SectionCard>

				<!-- El engrosado de trazos. Va aparte de las familias porque es otra
				     cosa: arriba se elige **qué** letra se usa, acá **cómo** se
				     dibuja. Y se guarda solo, sin pasar por «Aplicar cambios»,
				     porque no vive en la configuración de VasakOS sino en un
				     archivo de entorno de la sesión. -->
				<SectionCard>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<h3 class="text-lg font-medium text-tx-primary">
								{{ t('views.appearanceFonts.sharpness') }}
							</h3>
							<p class="text-sm text-tx-muted">{{ t('views.appearanceFonts.sharpnessHint') }}</p>
							<!-- Se dice siempre y no sólo al tocarlo: alguien que abre esta
							     pantalla y ve el interruptor encendido tiene que saber por
							     qué el texto de al lado no cambió. -->
							<p class="mt-1 text-xs text-tx-muted">
								{{ t('views.appearanceFonts.sharpnessRelogin') }}
							</p>
						</div>
						<SwitchToggle
							:label="t('views.appearanceFonts.sharpness')"
							:is-on="nitidez"
							:disabled="guardandoNitidez"
							@toggle="alternarNitidez"
						/>
					</div>
				</SectionCard>

				<SectionCard>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-lg font-medium text-tx-primary">{{ t('views.appearanceFonts.library') }}</h3>
							<p class="text-sm text-tx-muted">
								{{ t('views.appearanceFonts.libraryHint') }}
							</p>
						</div>
						<div class="rounded-full border border-ui-border bg-ui-surface/60 px-3 py-1 text-xs font-medium text-tx-muted">
							{{ filteredFonts.length }} / {{ uniqueFonts.length }}
						</div>
					</div>

					<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<button
							v-for="font in filteredFonts"
							:key="font.id"
							type="button"
							class="group rounded-corner border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-ui-surface/70"
							:class="selectedFonts[activeTarget] === font.name ? 'border-primary bg-ui-surface/80 shadow-[0_0_0_1px_var(--color-primary)]/20' : 'border-ui-border bg-ui-bg/40'"
							@click="pickFont(font)"
						>
							<div class="flex items-start justify-between gap-3">
								<div>
									<div class="text-base font-medium text-tx-primary">{{ font.name }}</div>
									<div class="text-xs text-tx-muted">{{ font.fontName || t('views.appearanceFonts.noPostscript') }}</div>
								</div>
								<div class="rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tx-muted">
									{{ font.monospaced ? t('views.appearanceFonts.mono') : t('views.appearanceFonts.proportional') }}
								</div>
							</div>

							<div class="mt-4 rounded-corner border border-ui-border bg-ui-bg/80 p-3">
								<div class="text-[11px] uppercase tracking-wider text-tx-muted">{{ t('views.appearanceFonts.preview') }}</div>
								<div
									class="mt-2 text-sm leading-6 text-tx-primary"
									:style="{ fontFamily: fontStack(font.name) }"
								>
									{{ t('views.appearanceFonts.previewText') }}
								</div>
							</div>

							<div class="mt-3 flex items-center justify-between text-[11px] text-tx-muted">
								<span>{{ font.style }}</span>
								<span>{{ t('views.appearanceFonts.weight').replace('{0}', String(font.weight)) }}</span>
							</div>
						</button>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>