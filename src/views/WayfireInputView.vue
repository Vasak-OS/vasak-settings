<script setup lang="ts">
import { onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

const input = useWayfireSection('input');

const accelProfiles = [
	{ label: 'Por defecto', value: 'default' },
	{ label: 'Ninguno', value: 'none' },
	{ label: 'Adaptativo', value: 'adaptive' },
	{ label: 'Plano', value: 'flat' },
];

const clickMethods = [
	{ label: 'Por defecto', value: 'default' },
	{ label: 'Ninguno', value: 'none' },
	{ label: 'Áreas de botón', value: 'button-areas' },
	{ label: 'Click con dedos', value: 'clickfinger' },
];

const scrollMethods = [
	{ label: 'Por defecto', value: 'default' },
	{ label: 'Ninguno', value: 'none' },
	{ label: 'Dos dedos', value: 'two-finger' },
	{ label: 'Borde', value: 'edge' },
	{ label: 'Botón presionado', value: 'on-button-down' },
];

onMounted(async () => {
	await input.load();
	input.initDefaults({
		kb_repeat_delay: '400',
		kb_repeat_rate: '40',
		kb_numlock_default_state: 'false',
		left_handed_mode: 'false',
		middle_emulation: 'false',
		mouse_accel_profile: 'default',
		mouse_cursor_speed: '0',
		mouse_natural_scroll: 'false',
		tap_to_click: 'true',
		click_method: 'default',
		scroll_method: 'default',
		natural_scroll: 'false',
		disable_touchpad_while_typing: 'false',
		disable_touchpad_while_mouse: 'false',
		tap_and_drag: 'true',
		touchpad_accel_profile: 'default',
		touchpad_cursor_speed: '0',
		cursor_theme: 'default',
		cursor_size: '24',
	});
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Teclado y Ratón"
			description="Configuración de entrada: teclado, ratón, touchpad y cursor."
		/>

		<AlertMessage v-if="input.error.value" :message="input.error.value" tone="error" />
		<AlertMessage v-if="input.success.value" :message="input.success.value" tone="success" />

		<div v-if="input.loading.value" class="text-center text-tx-muted py-8">Cargando...</div>

		<form v-else @submit.prevent="input.save()" class="flex flex-col gap-4">
			<SectionCard title="Teclado">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Delay de repetición (ms)">
						<input
							type="number" min="100" max="2000" step="50"
							:value="input.getInt('kb_repeat_delay', 400)"
							@input="input.setVal('kb_repeat_delay', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Velocidad de repetición (car/s)">
						<input
							type="number" min="1" max="200" step="1"
							:value="input.getInt('kb_repeat_rate', 40)"
							@input="input.setVal('kb_repeat_rate', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="NumLock al inicio">
						<SwitchToggle
							:isOn="input.getBool('kb_numlock_default_state', false)"
							@toggle="input.setBool('kb_numlock_default_state', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard title="Ratón">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Modo zurdo">
						<SwitchToggle
							:isOn="input.getBool('left_handed_mode', false)"
							@toggle="input.setBool('left_handed_mode', $event)"
						/>
					</FormGroup>
					<FormGroup label="Emulación de botón central">
						<SwitchToggle
							:isOn="input.getBool('middle_emulation', false)"
							@toggle="input.setBool('middle_emulation', $event)"
						/>
					</FormGroup>
					<FormGroup label="Perfil de aceleración">
						<SelectInput
							:modelValue="input.getVal('mouse_accel_profile', 'default')"
							:options="accelProfiles"
							@update:modelValue="input.setVal('mouse_accel_profile', $event)"
						/>
					</FormGroup>
					<FormGroup label="Velocidad del cursor">
						<input
							type="range" min="-1" max="1" step="0.05"
							:value="input.getFloat('mouse_cursor_speed', 0)"
							@input="input.setVal('mouse_cursor_speed', ($event.target as HTMLInputElement).value)"
							class="w-full"
						/>
						<span class="text-xs text-tx-muted">{{ input.getFloat('mouse_cursor_speed', 0).toFixed(2) }}</span>
					</FormGroup>
					<FormGroup label="Desplazamiento natural (invertido)">
						<SwitchToggle
							:isOn="input.getBool('mouse_natural_scroll', false)"
							@toggle="input.setBool('mouse_natural_scroll', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard title="Touchpad">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Tocar para hacer clic">
						<SwitchToggle
							:isOn="input.getBool('tap_to_click', true)"
							@toggle="input.setBool('tap_to_click', $event)"
						/>
					</FormGroup>
					<FormGroup label="Método de clic">
						<SelectInput
							:modelValue="input.getVal('click_method', 'default')"
							:options="clickMethods"
							@update:modelValue="input.setVal('click_method', $event)"
						/>
					</FormGroup>
					<FormGroup label="Método de desplazamiento">
						<SelectInput
							:modelValue="input.getVal('scroll_method', 'default')"
							:options="scrollMethods"
							@update:modelValue="input.setVal('scroll_method', $event)"
						/>
					</FormGroup>
					<FormGroup label="Desplazamiento natural">
						<SwitchToggle
							:isOn="input.getBool('natural_scroll', false)"
							@toggle="input.setBool('natural_scroll', $event)"
						/>
					</FormGroup>
					<FormGroup label="Desactivar al escribir">
						<SwitchToggle
							:isOn="input.getBool('disable_touchpad_while_typing', false)"
							@toggle="input.setBool('disable_touchpad_while_typing', $event)"
						/>
					</FormGroup>
					<FormGroup label="Desactivar con ratón conectado">
						<SwitchToggle
							:isOn="input.getBool('disable_touchpad_while_mouse', false)"
							@toggle="input.setBool('disable_touchpad_while_mouse', $event)"
						/>
					</FormGroup>
					<FormGroup label="Tocar y arrastrar">
						<SwitchToggle
							:isOn="input.getBool('tap_and_drag', true)"
							@toggle="input.setBool('tap_and_drag', $event)"
						/>
					</FormGroup>
					<FormGroup label="Perfil de aceleración">
						<SelectInput
							:modelValue="input.getVal('touchpad_accel_profile', 'default')"
							:options="accelProfiles"
							@update:modelValue="input.setVal('touchpad_accel_profile', $event)"
						/>
					</FormGroup>
					<FormGroup label="Velocidad del cursor">
						<input
							type="range" min="-1" max="1" step="0.05"
							:value="input.getFloat('touchpad_cursor_speed', 0)"
							@input="input.setVal('touchpad_cursor_speed', ($event.target as HTMLInputElement).value)"
							class="w-full"
						/>
						<span class="text-xs text-tx-muted">{{ input.getFloat('touchpad_cursor_speed', 0).toFixed(2) }}</span>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard title="Cursor">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Tema de cursor">
						<input
							type="text"
							:value="input.getVal('cursor_theme', 'default')"
							@input="input.setVal('cursor_theme', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
					<FormGroup label="Tamaño del cursor">
						<input
							type="number" min="16" max="96" step="4"
							:value="input.getInt('cursor_size', 24)"
							@input="input.setVal('cursor_size', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<div class="flex justify-end">
				<button
					type="submit"
					:disabled="input.saving.value"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
				>
					{{ input.saving.value ? 'Guardando...' : 'Guardar cambios' }}
				</button>
			</div>
		</form>
	</div>
</template>
