<script lang="ts" setup>
import {
	readConfig,
	setDarkMode,
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
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	getCurrentSystemState,
	getCursorThemes,
	getGtkThemes,
	setSystemConfig,
} from '@/services/style.service';

const configStore = ref<any>(null);
const gtkThemes = ref<string[]>([]);
const cursorThemes = ref<string[]>([]);
const iconPacks = ref<string[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const selectedGtkTheme = ref('Adwaita');
const selectedCursorTheme = ref('Adwaita');

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

		const [themes, cursors] = await Promise.all([
			getGtkThemes(),
			getCursorThemes(),
		]);

		gtkThemes.value = Array.isArray(themes) && themes.length ? themes : ['Adwaita'];
		cursorThemes.value = Array.isArray(cursors) && cursors.length ? cursors : ['Adwaita'];

		if (selectedGtkTheme.value && !gtkThemes.value.includes(selectedGtkTheme.value)) {
			gtkThemes.value.unshift(selectedGtkTheme.value);
		}
		if (selectedCursorTheme.value && !cursorThemes.value.includes(selectedCursorTheme.value)) {
			cursorThemes.value.unshift(selectedCursorTheme.value);
		}
	} catch (err) {
		error.value = `Error cargando configuración: ${err}`;
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
			throw new Error('Border radius debe estar entre 1 y 20');
		}

		if (vskConfig.value?.style?.darkmode !== (configStore.value.config?.style?.darkmode || false)) {
			await setDarkMode(vskConfig.value?.style?.darkmode || false);
		}

		await writeConfig(vskConfig.value);
		await applySystemChanges();

		successMessage.value = 'Configuración guardada exitosamente';
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = `Error guardando configuración: ${err}`;
		console.error(err);
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return selectedGtkTheme.value && selectedCursorTheme.value;
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			section="Apariencia"
			title="Tema y UI"
			description="Personaliza colores, formas y temas del escritorio."
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

		<EmptyStateBox v-if="loading" message="Cargando configuración..." padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-2">
				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">Estilos Base</h3>
					<div class="flex flex-col gap-5">
						<FormGroup label="Border Radius" html-for="border-radius" :label-class="'flex justify-between w-full'">
							<template #default>
								<div class="flex items-center gap-3">
									<span class="text-xs text-tx-muted w-6">1px</span>
									<RangeSlider
										v-if="vskConfig"
										id="border-radius"
										v-model="vskConfig.style.radius"
										:min="1"
										:max="20"
									/>
									<span class="text-xs text-tx-muted w-8 text-right">{{ vskConfig?.style.radius }}px</span>
								</div>
							</template>
						</FormGroup>

						<FormGroup label="Color Primario" html-for="primary-color">
							<div class="flex items-center gap-3">
								<input
									v-if="vskConfig"
									id="primary-color"
									type="color"
									v-model="(vskConfig.style as any)['primarycolor']"
									class="h-10 w-[50px] cursor-pointer rounded-corner border-2 border-ui-surface/10 bg-transparent transition-colors duration-200 hover:border-[var(--primary-color,#0084ff)] p-0"
								/>
								<input
									v-if="vskConfig"
									type="text"
									v-model="(vskConfig.style as any)['primarycolor']"
									placeholder="#0084FF"
									class="flex-1 rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono text-tx-primary transition-all duration-200 focus:border-[var(--primary-color,#0084ff)] focus:bg-ui-surface/80 focus:outline-none"
								/>
							</div>
						</FormGroup>

						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">Modo Oscuro</label>
							<div class="flex items-center gap-3">
								<SwitchToggle
									v-if="vskConfig"
									:is-on="vskConfig.style.darkmode"
									@toggle="val => (vskConfig!.style.darkmode = val)"
								/>
								<span class="w-20 text-xs text-tx-muted">{{ vskConfig?.style.darkmode ? "Activado" : "Desactivado" }}</span>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">Temas del Sistema</h3>
					<div class="flex flex-col gap-5">
						<FormGroup label="Tema GTK" html-for="gtk-theme">
							<SelectInput id="gtk-theme" v-model="selectedGtkTheme" :options="gtkThemes" />
						</FormGroup>

						<FormGroup label="Tema de Cursor" html-for="cursor-theme">
							<SelectInput id="cursor-theme" v-model="selectedCursorTheme" :options="cursorThemes" />
						</FormGroup>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>
