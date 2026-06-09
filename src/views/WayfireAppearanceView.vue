<script setup lang="ts">
import { onMounted } from 'vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import { useWayfireSection } from '@/composables/useWayfireSection';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';

const decoration = useWayfireSection('decoration');
const animate = useWayfireSection('animate');

const [decorationIcon] = useReactiveIcon('preferences-desktop-theme');
const [animateIcon] = useReactiveIcon('preferences-desktop-effects');

const animationOptions = [
	{ label: 'Ninguna', value: 'none' },
	{ label: 'Zoom', value: 'zoom' },
	{ label: 'Fade', value: 'fade' },
	{ label: 'Fuego', value: 'fire' },
];

onMounted(async () => {
	await Promise.all([decoration.load(), animate.load()]);
	decoration.initDefaults({
		font: 'sans-serif',
		title_height: '30',
		border_size: '4',
		button_order: 'minimize maximize close',
		active_color: '#222222aa',
		inactive_color: '#333333dd',
		border_radius: '0',
		ignore_views: 'none',
	});
	animate.initDefaults({
		open_animation: 'zoom',
		close_animation: 'zoom',
		duration: '500',
	});
});

function saveAll() {
	Promise.all([decoration.save(), animate.save()]);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Apariencia del Gestor de Ventanas"
			description="Decoración de ventanas y animaciones."
		/>

		<AlertMessage v-if="decoration.error.value || animate.error.value" tone="error"
			:message="decoration.error.value || animate.error.value" />
		<AlertMessage v-if="decoration.success.value || animate.success.value" tone="success"
			message="Configuración guardada correctamente" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="decorationIcon" :src="decorationIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Decoración de ventanas</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Personaliza la barra de título, bordes y botones de las ventanas.
							Los colores se expresan en formato RGBA hexadecimal (<code>#RRGGBBAA</code>).
						</p>
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Fuente del título">
						<input
							type="text"
							:value="decoration.getVal('font', 'sans-serif')"
							@input="decoration.setVal('font', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Altura del título (px)">
						<input
							type="number" min="0" max="100"
							:value="decoration.getInt('title_height', 30)"
							@input="decoration.setVal('title_height', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Tamaño del borde (px)">
						<input
							type="number" min="0" max="100"
							:value="decoration.getInt('border_size', 4)"
							@input="decoration.setVal('border_size', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Orden de botones">
						<input
							type="text"
							:value="decoration.getVal('button_order', 'minimize maximize close')"
							@input="decoration.setVal('button_order', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Color activo (RGBA)">
						<input
							type="text"
							:value="decoration.getVal('active_color', '#222222aa')"
							@input="decoration.setVal('active_color', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
						/>
					</FormGroup>
					<FormGroup label="Color inactivo (RGBA)">
						<input
							type="text"
							:value="decoration.getVal('inactive_color', '#333333dd')"
							@input="decoration.setVal('inactive_color', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
						/>
					</FormGroup>
					<FormGroup label="Radio de borde (px)">
						<input
							type="number" min="0" max="50"
							:value="decoration.getInt('border_radius', 0)"
							@input="decoration.setVal('border_radius', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Ignorar decoración en">
						<input
							type="text"
							:value="decoration.getVal('ignore_views', 'none')"
							@input="decoration.setVal('ignore_views', ($event.target as HTMLInputElement).value)"
							placeholder="none, type is 'toplevel', etc."
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard>
				<div class="mb-4 flex items-start gap-3">
					<img v-if="animateIcon" :src="animateIcon" class="mt-0.5 h-8 w-8 shrink-0" />
					<div>
						<h3 class="text-base font-medium">Animaciones</h3>
						<p class="mt-0.5 text-sm text-tx-muted">
							Controla cómo aparecen y desaparecen las ventanas. La duración global
							se aplica a la animación de las ventanas (zoom/fade/fuego).
						</p>
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Animación de apertura">
						<SelectInput
							:modelValue="animate.getVal('open_animation', 'zoom')"
							:options="animationOptions"
							@update:modelValue="animate.setVal('open_animation', $event)"
						/>
					</FormGroup>
					<FormGroup label="Animación de cierre">
						<SelectInput
							:modelValue="animate.getVal('close_animation', 'zoom')"
							:options="animationOptions"
							@update:modelValue="animate.setVal('close_animation', $event)"
						/>
					</FormGroup>
					<FormGroup label="Duración (ms)">
						<input
							type="number" min="0" max="2000" step="50"
							:value="animate.getInt('duration', 500)"
							@input="animate.setVal('duration', ($event.target as HTMLInputElement).value)"
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
