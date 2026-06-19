<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import { useWayfireSection } from '@/composables/useWayfireSection';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
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

const [blurIcon] = useReactiveIcon('applications-graphics');
const [wobblyIcon] = useReactiveIcon('preferences-desktop-effects');
const [zoomIcon] = useReactiveIcon('zoom-in');
const [alphaIcon] = useReactiveIcon('video-display');
const [invertIcon] = useReactiveIcon('preferences-desktop-display');
const [fisheyeIcon] = useReactiveIcon('preferences-desktop-effects');
const [wrotIcon] = useReactiveIcon('object-rotate-right');
const [cubeIcon] = useReactiveIcon('applications-other');

const sectionError = computed(() => {
	return blur.error.value || wobbly.error.value || zoom.error.value
		|| alpha.error.value || invert.error.value || fisheye.error.value
		|| cube.error.value || wrot.error.value;
});

const blurMethods = [
	{ label: 'Box', value: 'box' },
	{ label: 'Gaussian', value: 'gaussian' },
	{ label: 'Kawase', value: 'kawase' },
	{ label: 'Bokeh', value: 'bokeh' },
];

onMounted(async () => {
	await Promise.all([
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
	await blur.save();
	await wobbly.save();
	await zoom.save();
	await alpha.save();
	await invert.save();
	await fisheye.save();
	await cube.save();
	await wrot.save();
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Efectos"
			description="Efectos visuales del gestor de ventanas."
		/>

		<AlertMessage v-if="sectionError" tone="error" :message="sectionError" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="blurIcon" :src="blurIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Blur (desenfoque)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Aplica un efecto de desenfoque al fondo de las ventanas o a ventanas específicas.
							Mejora la legibilidad y la estética del escritorio. Requiere el plugin <code>blur</code> en la lista de plugins de <code>[core]</code>.
						</p>
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Método">
						<SelectInput
							:modelValue="blur.getVal('method', 'kawase')"
							:options="blurMethods"
							@update:modelValue="blur.setVal('method', $event)"
						/>
					</FormGroup>
					<FormGroup label="Aplicar a">
						<input
							type="text"
							:value="blur.getVal('blur_by_default', 'all')"
							@input="blur.setVal('blur_by_default', ($event.target as HTMLInputElement).value)"
							placeholder="all, type is 'toplevel', etc."
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
						/>
					</FormGroup>
					<FormGroup label="Saturación">
						<input
							type="range" min="0" max="3" step="0.1"
							:value="blur.getFloat('saturation', 1.0)"
							@input="blur.setVal('saturation', ($event.target as HTMLInputElement).value)"
							class="w-full"
						/>
						<span class="text-xs text-tx-muted">{{ blur.getFloat('saturation', 1.0).toFixed(1) }}</span>
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
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="wobblyIcon" :src="wobblyIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Wobbly (ventanas gelatinosas)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Hace que las ventanas se deformen elásticamente al moverlas o redimensionarlas,
							como si fueran de gelatina. Controla la intensidad con fricción y constante de resorte.
						</p>
					</div>
				</div>
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
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="zoomIcon" :src="zoomIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Zoom</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Permite acercar una zona de la pantalla manteniendo presionado el modificador
							y usando la rueda del ratón. Útil para accesibilidad o para ver detalles pequeños.
						</p>
					</div>
				</div>
				<FormGroup label="Modificador">
					<KeyBindingInput
						:modelValue="zoom.getVal('modifier', '<super>')"
						@update:modelValue="zoom.setVal('modifier', $event)"
					/>
				</FormGroup>
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="alphaIcon" :src="alphaIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Alpha (opacidad)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Cambia la opacidad de las ventanas al mantener el modificador y usar la rueda
							del ratón. Permite ver a través de las ventanas para acceder a contenido detrás de ellas.
						</p>
					</div>
				</div>
				<FormGroup label="Modificador">
					<KeyBindingInput
						:modelValue="alpha.getVal('modifier', '<super> <alt>')"
						@update:modelValue="alpha.setVal('modifier', $event)"
					/>
				</FormGroup>
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="invertIcon" :src="invertIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Invertir colores</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Invierte los colores de toda la pantalla. Útil para accesibilidad o para cambiar
							rápidamente entre modo claro y oscuro.
						</p>
					</div>
				</div>
				<FormGroup label="Alternar">
					<KeyBindingInput
						:modelValue="invert.getVal('toggle', '<super> KEY_I')"
						@update:modelValue="invert.setVal('toggle', $event)"
					/>
				</FormGroup>
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="fisheyeIcon" :src="fisheyeIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Fisheye (efecto lupa)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Crea un efecto de lupa que distorsiona y amplía el área alrededor del cursor,
							similar a una lente de ojo de pez. Útil para presentaciones o para examinar áreas específicas.
						</p>
					</div>
				</div>
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
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="wrotIcon" :src="wrotIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Rotación de ventanas (wrot)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Permite rotar ventanas libremente arrastrando con el ratón mientras se mantiene
							el modificador. Útil para organizar el espacio de trabajo de forma no convencional.
						</p>
					</div>
				</div>
				<FormGroup label="Activar">
					<KeyBindingInput
						:modelValue="wrot.getVal('activate', '<super> <ctrl> BTN_RIGHT')"
						@update:modelValue="wrot.setVal('activate', $event)"
					/>
				</FormGroup>
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="cubeIcon" :src="cubeIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Cube (escritorio 3D)</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Muestra los espacios de trabajo como las caras de un cubo 3D, con animaciones
							de rotación al cambiar de espacio. Requiere el plugin <code>cube</code> en la lista de plugins de <code>[core]</code>.
						</p>
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Activar">
						<KeyBindingInput
							:modelValue="cube.getVal('activate', '<ctrl> <alt> BTN_LEFT')"
							@update:modelValue="cube.setVal('activate', $event)"
						/>
					</FormGroup>
					<FormGroup label="Zoom">
						<input
							type="range" min="0" max="1" step="0.05"
							:value="cube.getFloat('zoom', 0.1)"
							@input="cube.setVal('zoom', ($event.target as HTMLInputElement).value)"
							class="w-full"
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
						<input
							type="text"
							:value="cube.getVal('background_mode', 'simple')"
							@input="cube.setVal('background_mode', ($event.target as HTMLInputElement).value)"
							placeholder="simple, skydome, cubemap"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>
			</SectionCard>

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
