<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import type { Store } from 'pinia';
import { computed, onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import { getSystemFonts, type SystemFontItem } from '@/services/style.service';

type FontTarget = 'termina' | 'title' | 'apps';

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const fonts = ref<SystemFontItem[]>([]);
const searchQuery = ref('');
const activeTarget = ref<FontTarget>('termina');

const selectedFonts = ref<Record<FontTarget, string>>({
	termina: '',
	title: '',
	apps: '',
});

const targetOptions = [
	{ label: 'Terminal', value: 'termina' },
	{ label: 'Títulos', value: 'title' },
	{ label: 'Aplicaciones', value: 'apps' },
];

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
		termina: vskConfig.value?.fonts?.termina || '',
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

		if (!selectedFonts.value.termina && uniqueFonts.value.length > 0) {
			selectedFonts.value.termina = uniqueFonts.value[0].name;
		}
		if (!selectedFonts.value.title && uniqueFonts.value.length > 1) {
			selectedFonts.value.title = uniqueFonts.value[1].name;
		}
		if (!selectedFonts.value.apps && uniqueFonts.value.length > 2) {
			selectedFonts.value.apps = uniqueFonts.value[2].name;
		}
	} catch (err) {
		error.value = `Error cargando fuentes del sistema: ${err}`;
	} finally {
		loading.value = false;
	}
});

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (!vskConfig.value) {
			throw new Error('No se pudo cargar la configuración actual');
		}

		vskConfig.value.fonts = {
			termina: selectedFonts.value.termina,
			title: selectedFonts.value.title,
			apps: selectedFonts.value.apps,
		};

		await writeConfig(vskConfig.value);
		successMessage.value = 'Fuentes guardadas exitosamente';
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = `Error guardando fuentes: ${err}`;
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return Boolean(
		selectedFonts.value.termina && selectedFonts.value.title && selectedFonts.value.apps
	);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			section="Apariencia"
			title="Fuentes"
			description="Busca fuentes del sistema y asígnalas al terminal, a los títulos y a las aplicaciones."
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="!isFormValid || saving"
					@click="saveConfig"
				>
					{{ saving ? 'Guardando...' : 'Aplicar Cambios' }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" message="Cargando fuentes del sistema..." padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-[360px_1fr]">
				<SectionCard>
					<div class="flex flex-col gap-4">
						<FormGroup label="Objetivo activo" html-for="font-target">
							<SelectInput id="font-target" v-model="activeTarget" :options="targetOptions" />
						</FormGroup>

						<FormGroup label="Buscar fuente" html-for="font-search">
							<template #default>
								<input
									id="font-search"
									v-model="searchQuery"
									type="text"
									placeholder="Buscar por nombre, ruta o postscript"
									class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
								/>
							</template>
						</FormGroup>

						<div class="rounded-corner border border-ui-border bg-ui-bg/60 p-4">
							<div class="mb-3 text-sm font-medium text-tx-primary">Selecciones actuales</div>
							<div class="space-y-3 text-sm text-tx-muted">
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">Terminal</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.termina) }">
										{{ selectedFonts.termina || 'Sin fuente asignada' }}
									</div>
								</div>
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">Títulos</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.title) }">
										{{ selectedFonts.title || 'Sin fuente asignada' }}
									</div>
								</div>
								<div>
									<div class="text-xs uppercase tracking-wide text-tx-muted">Aplicaciones</div>
									<div class="text-tx-primary" :style="{ fontFamily: fontStack(selectedFonts.apps) }">
										{{ selectedFonts.apps || 'Sin fuente asignada' }}
									</div>
								</div>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-lg font-medium text-tx-primary">Biblioteca de fuentes</h3>
							<p class="text-sm text-tx-muted">
								Haz clic en una tarjeta para asignarla al objetivo activo.
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
							:class="selectedFonts[activeTarget] === font.name ? 'border-primary bg-ui-surface/80 shadow-[0_0_0_1px_var(--primary-color,#0084ff)]/20' : 'border-ui-border bg-ui-bg/40'"
							@click="pickFont(font)"
						>
							<div class="flex items-start justify-between gap-3">
								<div>
									<div class="text-base font-medium text-tx-primary">{{ font.name }}</div>
									<div class="text-xs text-tx-muted">{{ font.fontName || 'Sin postscript' }}</div>
								</div>
								<div class="rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tx-muted">
									{{ font.monospaced ? 'Mono' : 'Proporcional' }}
								</div>
							</div>

							<div class="mt-4 rounded-corner border border-ui-border bg-ui-bg/80 p-3">
								<div class="text-[11px] uppercase tracking-wider text-tx-muted">Vista previa</div>
								<div
									class="mt-2 text-sm leading-6 text-tx-primary"
									:style="{ fontFamily: fontStack(font.name) }"
								>
									The quick brown fox jumps over the lazy dog
								</div>
							</div>

							<div class="mt-3 flex items-center justify-between text-[11px] text-tx-muted">
								<span>{{ font.style }}</span>
								<span>peso {{ font.weight }}</span>
							</div>
						</button>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>