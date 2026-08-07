<script setup lang="ts">
import { onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

// [core] keys that belong here and had no UI: closing a window and who draws
// the window decorations.
const core = useWayfireSection('core');

const decorationModes = [
	{ label: 'La aplicación (cliente)', value: 'client' },
	{ label: 'El compositor (servidor)', value: 'server' },
];

const grid = useWayfireSection('grid');
const move = useWayfireSection('move');
const resize = useWayfireSection('resize');
const wmactions = useWayfireSection('wm-actions');

const gridSlots = [
	{ key: 'slot_tl', label: 'Arriba izquierda' },
	{ key: 'slot_t', label: 'Arriba centro' },
	{ key: 'slot_tr', label: 'Arriba derecha' },
	{ key: 'slot_l', label: 'Izquierda' },
	{ key: 'slot_c', label: 'Centro / Maximizar' },
	{ key: 'slot_r', label: 'Derecha' },
	{ key: 'slot_bl', label: 'Abajo izquierda' },
	{ key: 'slot_b', label: 'Abajo centro' },
	{ key: 'slot_br', label: 'Abajo derecha' },
	{ key: 'restore', label: 'Restaurar' },
];

const winActions = [
	{ key: 'toggle_fullscreen', label: 'Pantalla completa' },
	{ key: 'toggle_always_on_top', label: 'Siempre encima' },
	{ key: 'toggle_sticky', label: 'Sticky (todas las áreas)' },
	{ key: 'toggle_maximize', label: 'Maximizar' },
	{ key: 'minimize', label: 'Minimizar' },
	{ key: 'toggle_showdesktop', label: 'Mostrar escritorio' },
	{ key: 'send_to_back', label: 'Enviar al fondo' },
];

onMounted(async () => {
	await Promise.all([grid.load(), move.load(), resize.load(), wmactions.load()]);
	grid.initDefaults({
		duration: '300',
		slot_tl: '',
		slot_t: '',
		slot_tr: '',
		slot_l: '',
		slot_c: '',
		slot_r: '',
		slot_bl: '',
		slot_b: '',
		slot_br: '',
		restore: '',
	});
	move.initDefaults({ activate: '<super> BTN_LEFT', enable_snap: 'true', snap_threshold: '10' });
	resize.initDefaults({ activate: '<super> BTN_RIGHT' });
	wmactions.initDefaults({
		toggle_fullscreen: '',
		toggle_always_on_top: '',
		toggle_sticky: '',
		toggle_maximize: '',
		minimize: '',
		toggle_showdesktop: '',
		send_to_back: '',
	});
	await core.load();
	core.initDefaults({
		close_top_view: '<super> KEY_Q | <alt> KEY_F4',
		preferred_decoration_mode: 'client',
	});
});

async function saveAll() {
	await Promise.all([grid.save(), move.save(), resize.save(), wmactions.save(), core.save()]);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Ventanas"
			description="Comportamiento de ventanas: movimiento, redimensión, grid y acciones."
		/>

		<AlertMessage
			v-if="grid.error.value || move.error.value || resize.error.value || wmactions.error.value"
			tone="error"
			:message="grid.error.value || move.error.value || resize.error.value || wmactions.error.value"
		/>
		<AlertMessage
			v-if="grid.success.value || move.success.value || resize.success.value || wmactions.success.value"
			tone="success"
			message="Configuración guardada correctamente"
		/>

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<SectionCard>
				<h3 class="text-base font-medium">General</h3>
				<div class="mt-3 grid gap-4 sm:grid-cols-2">
					<FormGroup label="Cerrar ventana">
						<KeyBindingInput
							:modelValue="core.getVal('close_top_view', '<super> KEY_Q')"
							@update:modelValue="core.setVal('close_top_view', $event)"
						/>
					</FormGroup>
					<FormGroup label="Quién dibuja la decoración">
						<SelectInput
							:modelValue="core.getVal('preferred_decoration_mode', 'client')"
							:options="decorationModes"
							@update:modelValue="core.setVal('preferred_decoration_mode', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<PluginSection plugin-id="move" icon="preferences-system-windows">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Activar movimiento">
						<KeyBindingInput
							:modelValue="move.getVal('activate', '<super> BTN_LEFT')"
							@update:modelValue="move.setVal('activate', $event)"
						/>
					</FormGroup>
					<FormGroup label="Snap a bordes">
						<SwitchToggle
							:isOn="move.getBool('enable_snap', true)"
							@toggle="move.setBool('enable_snap', $event)"
						/>
					</FormGroup>
					<FormGroup label="Umbral de snap (px)">
						<input
							type="number" min="0" max="100"
							:value="move.getInt('snap_threshold', 10)"
							@input="move.setVal('snap_threshold', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="resize" icon="preferences-system-windows">
				<div class="grid gap-4 sm:grid-cols-1">
					<FormGroup label="Activar redimensión">
						<KeyBindingInput
							:modelValue="resize.getVal('activate', '<super> BTN_RIGHT')"
							@update:modelValue="resize.setVal('activate', $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="grid" icon="view-grid">
				<div class="mb-3">
					<label class="text-sm font-medium">Duración de animación (ms)</label>
					<input
						type="number" min="0" max="2000" step="50"
						:value="grid.getInt('duration', 300)"
						@input="grid.setVal('duration', ($event.target as HTMLInputElement).value)"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<FormGroup v-for="s in gridSlots" :key="s.key" :label="s.label">
						<KeyBindingInput
							:modelValue="grid.getVal(s.key, '')"
							@update:modelValue="grid.setVal(s.key, $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="wm-actions" icon="preferences-system-windows">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup v-for="a in winActions" :key="a.key" :label="a.label">
						<KeyBindingInput
							:modelValue="wmactions.getVal(a.key, '')"
							@update:modelValue="wmactions.setVal(a.key, $event)"
						/>
					</FormGroup>
				</div>
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
