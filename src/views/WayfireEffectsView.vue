<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useWayfireSection } from '@/composables/useWayfireSection';
import { useWayfirePlugins } from '@/composables/useWayfirePlugins';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';

const blur = useWayfireSection('blur');
const wobbly = useWayfireSection('wobbly');
const zoom = useWayfireSection('zoom');
const alpha = useWayfireSection('alpha');
const invert = useWayfireSection('invert');
const fisheye = useWayfireSection('fisheye');
const cube = useWayfireSection('cube');
const wrot = useWayfireSection('wrot');

const { load: loadPlugins, error: pluginsError } = useWayfirePlugins();

const sectionError = computed(() => {
	return blur.error.value || wobbly.error.value || zoom.error.value
		|| alpha.error.value || invert.error.value || fisheye.error.value
		|| cube.error.value || wrot.error.value || pluginsError.value;
});

const blurMethods = [
	{ label: 'Kawase (recomendado)', value: 'kawase' },
	{ label: 'Box', value: 'box' },
	{ label: 'Gaussian', value: 'gaussian' },
	{ label: 'Bokeh', value: 'bokeh' },
];

const backgroundModes = [
	{ label: 'Simple', value: 'simple' },
	{ label: 'Skydome', value: 'skydome' },
	{ label: 'Cubemap', value: 'cubemap' },
];

onMounted(async () => {
	await Promise.all([
		loadPlugins(),
		blur.load(), wobbly.load(), zoom.load(), alpha.load(),
		invert.load(), fisheye.load(), cube.load(), wrot.load(),
	]);
	blur.initDefaults({ method: 'kawase', blur_by_default: 'all', saturation: '1.0', offset: '1.7', iterations: '2' });
	wobbly.initDefaults({ friction: '3.0', spring_k: '8.0', grid_resolution: '6' });
	zoom.initDefaults({ modifier: '<super>' });
	alpha.initDefaults({ modifier: '<super> <alt>' });
	invert.initDefaults({ toggle: '<super> KEY_I' });
	fisheye.initDefaults({ toggle: '<super> <ctrl> KEY_F', radius: '450', zoom: '7.0' });
	cube.initDefaults({ activate: '<ctrl> <alt> BTN_LEFT', zoom: '0.1', light: 'true', background_mode: 'simple' });
	wrot.initDefaults({ activate: '<super> <ctrl> BTN_RIGHT' });
});

async function saveAll() {
	await Promise.all([
		blur.save(), wobbly.save(), zoom.save(), alpha.save(),
		invert.save(), fisheye.save(), cube.save(), wrot.save(),
	]);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Efectos"
			description="Efectos visuales del gestor de ventanas. Activá solo los que uses: cada efecto apagado es trabajo que la GPU no hace."
		/>

		<AlertMessage v-if="sectionError" tone="error" :message="sectionError" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-3">
			<!-- Los más usados primero -->
			<PluginSection plugin-id="blur" icon="applications-graphics">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Método">
						<SelectInput
							:modelValue="blur.getVal('method', 'kawase')"
							:options="blurMethods"
							@update:modelValue="blur.setVal('method', $event)"
						/>
					</FormGroup>
					<FormGroup label="Saturación">
						<RangeSlider
							:modelValue="blur.getFloat('saturation', 1.0)"
							:min="0" :max="3" :step="0.1"
							@update:modelValue="blur.setVal('saturation', String($event))"
						/>
						<span class="text-xs text-tx-muted">{{ blur.getFloat('saturation', 1.0).toFixed(1) }}</span>
					</FormGroup>
				</div>

				<details class="mt-4 border-t border-ui-border pt-3">
					<summary class="cursor-pointer text-xs font-medium text-tx-muted">Opciones avanzadas</summary>
					<div class="mt-3 grid gap-4 sm:grid-cols-3">
						<FormGroup label="Aplicar a">
							<input
								type="text"
								:value="blur.getVal('blur_by_default', 'all')"
								@input="blur.setVal('blur_by_default', ($event.target as HTMLInputElement).value)"
								placeholder="all, type is 'toplevel', etc."
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
							/>
						</FormGroup>
						<FormGroup label="Offset">
							<input
								type="number" min="0" max="20" step="0.1"
								:value="blur.getFloat('offset', 1.7)"
								@input="blur.setVal('offset', ($event.target as HTMLInputElement).value)"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>
						<FormGroup label="Iteraciones">
							<input
								type="number" min="1" max="20"
								:value="blur.getInt('iterations', 2)"
								@input="blur.setVal('iterations', ($event.target as HTMLInputElement).value)"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>
					</div>
				</details>
			</PluginSection>

			<PluginSection plugin-id="zoom" icon="zoom-in">
				<FormGroup label="Modificador">
					<KeyBindingInput
						:modelValue="zoom.getVal('modifier', '<super>')"
						@update:modelValue="zoom.setVal('modifier', $event)"
					/>
				</FormGroup>
			</PluginSection>

			<PluginSection plugin-id="wobbly" icon="preferences-desktop-effects">
				<div class="grid gap-4 sm:grid-cols-3">
					<FormGroup label="Fricción">
						<input
							type="number" min="0" max="20" step="0.5"
							:value="wobbly.getFloat('friction', 3.0)"
							@input="wobbly.setVal('friction', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Constante de resorte">
						<input
							type="number" min="0" max="20" step="0.5"
							:value="wobbly.getFloat('spring_k', 8.0)"
							@input="wobbly.setVal('spring_k', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Resolución de grid">
						<input
							type="number" min="2" max="20"
							:value="wobbly.getInt('grid_resolution', 6)"
							@input="wobbly.setVal('grid_resolution', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="alpha" icon="video-display">
				<FormGroup label="Modificador">
					<KeyBindingInput
						:modelValue="alpha.getVal('modifier', '<super> <alt>')"
						@update:modelValue="alpha.setVal('modifier', $event)"
					/>
				</FormGroup>
			</PluginSection>

			<PluginSection plugin-id="invert" icon="preferences-desktop-display">
				<FormGroup label="Alternar">
					<KeyBindingInput
						:modelValue="invert.getVal('toggle', '<super> KEY_I')"
						@update:modelValue="invert.setVal('toggle', $event)"
					/>
				</FormGroup>
			</PluginSection>

			<PluginSection plugin-id="fisheye" icon="preferences-desktop-effects">
				<div class="grid gap-4 sm:grid-cols-3">
					<FormGroup label="Alternar">
						<KeyBindingInput
							:modelValue="fisheye.getVal('toggle', '<super> <ctrl> KEY_F')"
							@update:modelValue="fisheye.setVal('toggle', $event)"
						/>
					</FormGroup>
					<FormGroup label="Radio (px)">
						<input
							type="number" min="50" max="2000"
							:value="fisheye.getInt('radius', 450)"
							@input="fisheye.setVal('radius', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Zoom">
						<input
							type="number" min="1" max="20" step="0.5"
							:value="fisheye.getFloat('zoom', 7.0)"
							@input="fisheye.setVal('zoom', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="cube" icon="applications-other">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Activar">
						<KeyBindingInput
							:modelValue="cube.getVal('activate', '<ctrl> <alt> BTN_LEFT')"
							@update:modelValue="cube.setVal('activate', $event)"
						/>
					</FormGroup>
					<FormGroup label="Zoom">
						<RangeSlider
							:modelValue="cube.getFloat('zoom', 0.1)"
							:min="0" :max="1" :step="0.05"
							@update:modelValue="cube.setVal('zoom', String($event))"
						/>
						<span class="text-xs text-tx-muted">{{ cube.getFloat('zoom', 0.1).toFixed(2) }}</span>
					</FormGroup>
					<FormGroup label="Iluminación">
						<SwitchToggle
							:isOn="cube.getBool('light', true)"
							@toggle="cube.setBool('light', $event)"
						/>
					</FormGroup>
					<FormGroup label="Modo de fondo">
						<SelectInput
							:modelValue="cube.getVal('background_mode', 'simple')"
							:options="backgroundModes"
							@update:modelValue="cube.setVal('background_mode', $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="wrot" icon="object-rotate-right">
				<FormGroup label="Activar">
					<KeyBindingInput
						:modelValue="wrot.getVal('activate', '<super> <ctrl> BTN_RIGHT')"
						@update:modelValue="wrot.setVal('activate', $event)"
					/>
				</FormGroup>
			</PluginSection>

			<div class="flex justify-end">
				<button
					type="submit"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90"
				>
					Guardar cambios
				</button>
			</div>
		</form>
	</div>
</template>
