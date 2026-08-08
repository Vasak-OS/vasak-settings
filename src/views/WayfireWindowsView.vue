<script setup lang="ts">
import { onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
import NumberInput from '@/components/ui/NumberInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

// [core] keys that belong here and had no UI: closing a window and who draws
// the window decorations.
const core = useWayfireSection('core');

const decorationModes = [
	{ label: 'La aplicación (cliente)', value: 'client' },
	{ label: 'El compositor (servidor)', value: 'server' },
];

const grid = useWayfireSection('grid');
const switcher = useWayfireSection('switcher');
const fastSwitcher = useWayfireSection('fast-switcher');
const place = useWayfireSection('place');
const windowRules = useWayfireSection('window-rules', true);

const placeModes = [
	{ label: 'Centrada', value: 'center' },
	{ label: 'En cascada', value: 'cascade' },
	{ label: 'Al azar', value: 'random' },
	{ label: 'Maximizada', value: 'maximize' },
];

function addRule() {
	let index = 1;
	while (`rule_${index}` in windowRules.values.value) {
		index += 1;
	}
	windowRules.values.value[`rule_${index}`] = '';
}

function removeRule(key: string) {
	delete windowRules.values.value[key];
}
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
	await Promise.all([
		grid.save(),
		move.save(),
		resize.save(),
		wmactions.save(),
		core.save(),
		switcher.save(),
		fastSwitcher.save(),
		place.save(),
		windowRules.save(),
	]);
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
						<NumberInput
							:model-value="move.getInt('snap_threshold', 10)"
							:min="0" :max="100"
							@update:model-value="move.setVal('snap_threshold', $event)"
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
					<NumberInput
						class="mt-1"
						:model-value="grid.getInt('duration', 300)"
						:min="0" :max="2000" :step="50"
						@update:model-value="grid.setVal('duration', $event)"
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

			<PluginSection plugin-id="switcher" icon="preferences-system-windows">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Siguiente ventana">
						<KeyBindingInput
							:modelValue="switcher.getVal('next_view', '<alt> KEY_TAB')"
							@update:modelValue="switcher.setVal('next_view', $event)"
						/>
					</FormGroup>
					<FormGroup label="Ventana anterior">
						<KeyBindingInput
							:modelValue="switcher.getVal('prev_view', '<alt> <shift> KEY_TAB')"
							@update:modelValue="switcher.setVal('prev_view', $event)"
						/>
					</FormGroup>
				</div>
				<details class="mt-4 border-t border-ui-border pt-3">
					<summary class="cursor-pointer text-xs font-medium text-tx-muted">Opciones avanzadas</summary>
					<div class="mt-3 grid gap-4 sm:grid-cols-2">
						<FormGroup label="Duración de la animación (ms)">
							<NumberInput
								:model-value="switcher.getInt('speed', 500)"
								:min="0" :max="3000" :step="50"
								@update:model-value="switcher.setVal('speed', $event)"
							/>
						</FormGroup>
						<FormGroup label="Escala de las miniaturas">
							<NumberInput
								:model-value="switcher.getFloat('view_thumbnail_scale', 1)"
								:min="0.1" :max="3" :step="0.1"
								@update:model-value="switcher.setVal('view_thumbnail_scale', $event)"
							/>
						</FormGroup>
					</div>
				</details>
			</PluginSection>

			<PluginSection plugin-id="fast-switcher" icon="preferences-system-windows">
				<div class="grid gap-4 sm:grid-cols-3">
					<FormGroup label="Activar">
						<KeyBindingInput
							:modelValue="fastSwitcher.getVal('activate', '<alt> KEY_ESC')"
							@update:modelValue="fastSwitcher.setVal('activate', $event)"
						/>
					</FormGroup>
					<FormGroup label="Activar hacia atrás">
						<KeyBindingInput
							:modelValue="fastSwitcher.getVal('activate_backward', '')"
							@update:modelValue="fastSwitcher.setVal('activate_backward', $event)"
						/>
					</FormGroup>
					<FormGroup label="Opacidad de las inactivas">
						<NumberInput
							:model-value="fastSwitcher.getFloat('inactive_alpha', 0.7)"
							:min="0" :max="1" :step="0.05"
							@update:model-value="fastSwitcher.setVal('inactive_alpha', $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="place" icon="preferences-system-windows">
				<FormGroup label="Dónde aparecen las ventanas nuevas">
					<SelectInput
						:modelValue="place.getVal('mode', 'center')"
						:options="placeModes"
						@update:modelValue="place.setVal('mode', $event)"
					/>
				</FormGroup>
			</PluginSection>

			<PluginSection plugin-id="window-rules" icon="preferences-system-windows">
				<p class="mb-3 text-xs text-tx-muted">
					Una regla por línea, con la sintaxis de Wayfire. Ejemplo:
					<code>on created if app_id is "vasak-terminal" then set alpha 0.95</code>
				</p>
				<div class="flex flex-col gap-2">
					<div v-for="(value, key) in windowRules.values.value" :key="key" class="flex items-center gap-2">
						<TextInput
							mono
							class="flex-1"
							:model-value="value"
							placeholder="on created if app_id is &quot;...&quot; then ..."
							@update:model-value="windowRules.setVal(key as string, $event)"
						/>
						<button
							type="button"
							@click="removeRule(key as string)"
							class="shrink-0 rounded-corner border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs font-medium text-status-danger hover:bg-status-danger/20"
						>
							Eliminar
						</button>
					</div>
					<p v-if="Object.keys(windowRules.values.value).length === 0" class="rounded-corner border border-dashed border-ui-border bg-ui-surface/30 p-3 text-center text-sm text-tx-muted">
						Sin reglas definidas
					</p>
				</div>
				<button
					type="button"
					@click="addRule"
					class="mt-3 rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface"
				>
					+ Añadir regla
				</button>
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
