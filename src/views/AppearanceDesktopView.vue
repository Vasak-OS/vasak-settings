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
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const showFiles = ref(false);
const showHiddenFiles = ref(false);
const iconSize = ref(64);

onMounted(async () => {
	try {
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		if (vskConfig.value?.desktop) {
			showFiles.value = vskConfig.value.desktop.showfiles ?? false;
			showHiddenFiles.value = vskConfig.value.desktop.showhiddenfiles ?? false;
			iconSize.value = Number(vskConfig.value.desktop.iconsize ?? 64);
		}
	} catch (err) {
		error.value = `Error cargando configuración del escritorio: ${err}`;
	} finally {
		loading.value = false;
	}
});

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (iconSize.value < 24 || iconSize.value > 128) {
			throw new Error('El tamaño del icono debe estar entre 24 y 128');
		}

		if (vskConfig.value) {
			vskConfig.value.desktop = {
				...vskConfig.value.desktop,
				showfiles: showFiles.value,
				showhiddenfiles: showHiddenFiles.value,
				iconsize: iconSize.value,
			};

			await writeConfig(vskConfig.value);

			successMessage.value = 'Configuración del escritorio guardada exitosamente';
			setTimeout(() => {
				successMessage.value = '';
			}, 3000);
		}
	} catch (err) {
		error.value = `Error guardando configuración: ${err}`;
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return iconSize.value >= 24 && iconSize.value <= 128;
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			section="Apariencia"
			title="Archivos del Escritorio"
			description="Ajusta la visibilidad y el tamaño de los iconos en el fondo de escritorio."
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
					<h3 class="mb-4 text-lg font-medium text-tx-primary">Archivos</h3>
					<div class="flex flex-col gap-5">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">Mostrar Archivos</label>
							<div class="flex items-center gap-3">
								<SwitchToggle
									:is-on="showFiles"
									@toggle="val => (showFiles = val)"
								/>
								<span class="w-20 text-xs text-tx-muted">{{ showFiles ? "Activado" : "Desactivado" }}</span>
							</div>
						</div>

						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">Mostrar Archivos Ocultos</label>
							<div class="flex items-center gap-3">
								<SwitchToggle
									:is-on="showHiddenFiles"
									:disabled="!showFiles"
									@toggle="val => (showHiddenFiles = val)"
								/>
								<span class="w-20 text-xs text-tx-muted">{{ showHiddenFiles ? "Activado" : "Desactivado" }}</span>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">Dimensiones</h3>
					<div class="flex flex-col gap-5">
						<FormGroup label="Tamaño de Icono" html-for="icon-size" :label-class="'flex justify-between w-full'">
							<template #default>
								<div class="flex items-center gap-3">
									<span class="text-xs text-tx-muted w-8">24px</span>
									<RangeSlider
										id="icon-size"
										v-model="iconSize"
										:min="24"
										:max="128"
									/>
									<span class="text-xs text-tx-muted w-10 text-right">{{ iconSize }}px</span>
								</div>
							</template>
						</FormGroup>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>
