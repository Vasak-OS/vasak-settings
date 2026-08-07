<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

const vswitch = useWayfireSection('vswitch');
const expo = useWayfireSection('expo');

const isSaving = computed(() => vswitch.saving.value || expo.saving.value);

onMounted(async () => {
	await Promise.all([vswitch.load(), expo.load()]);
	vswitch.initDefaults({
		duration: '300',
		wraparound: 'false',
		binding_left: '',
		binding_down: '',
		binding_up: '',
		binding_right: '',
		with_win_left: '',
		with_win_down: '',
		with_win_up: '',
		with_win_right: '',
	});
	expo.initDefaults({
		toggle: '',
		duration: '300',
		select_workspace_1: '',
		select_workspace_2: '',
		select_workspace_3: '',
		select_workspace_4: '',
		select_workspace_5: '',
		select_workspace_6: '',
		select_workspace_7: '',
		select_workspace_8: '',
		select_workspace_9: '',
	});
});

async function saveAll() {
	await vswitch.save();
	await expo.save();
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Espacios de trabajo"
			description="Configuración de áreas de trabajo virtuales."
		/>

		<AlertMessage v-if="vswitch.error.value || expo.error.value" tone="error"
			:message="vswitch.error.value || expo.error.value" />
		<AlertMessage v-if="vswitch.success.value || expo.success.value" tone="success"
			message="Configuración guardada correctamente" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<PluginSection plugin-id="vswitch" icon="video-display">
				<div class="mb-3">
					<div class="grid gap-4 sm:grid-cols-2">
						<FormGroup label="Duración de animación (ms)">
							<input
								type="number" min="0" max="2000" step="50"
								:value="vswitch.getInt('duration', 300)"
								@input="vswitch.setVal('duration', ($event.target as HTMLInputElement).value)"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>
						<FormGroup label="Wrap around">
							<SwitchToggle
								:isOn="vswitch.getBool('wraparound', false)"
								@toggle="vswitch.setBool('wraparound', $event)"
							/>
						</FormGroup>
					</div>
				</div>

				<h4 class="mb-2 text-sm font-medium">Atajos: cambiar espacio</h4>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<FormGroup v-for="dir in ['left', 'down', 'up', 'right']" :key="dir" :label="dir">
						<KeyBindingInput
							:modelValue="vswitch.getVal('binding_' + dir, '')"
							@update:modelValue="vswitch.setVal('binding_' + dir, $event)"
						/>
					</FormGroup>
				</div>

				<h4 class="mb-2 mt-4 text-sm font-medium">Atajos: mover ventana conmigo</h4>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<FormGroup v-for="dir in ['left', 'down', 'up', 'right']" :key="'with_'+dir" :label="dir">
						<KeyBindingInput
							:modelValue="vswitch.getVal('with_win_' + dir, '')"
							@update:modelValue="vswitch.setVal('with_win_' + dir, $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="expo" icon="view-grid">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Alternar vista general">
						<KeyBindingInput
							:modelValue="expo.getVal('toggle', '')"
							@update:modelValue="expo.setVal('toggle', $event)"
						/>
					</FormGroup>
					<FormGroup label="Duración de animación (ms)">
						<input
							type="number" min="0" max="2000" step="50"
							:value="expo.getInt('duration', 300)"
							@input="expo.setVal('duration', ($event.target as HTMLInputElement).value)"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						/>
					</FormGroup>
				</div>

				<h4 class="mb-2 mt-4 text-sm font-medium">Seleccionar espacio por número</h4>
				<div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<FormGroup v-for="n in 9" :key="n" :label="'Espacio ' + n">
						<KeyBindingInput
							:modelValue="expo.getVal('select_workspace_' + n, '')"
							@update:modelValue="expo.setVal('select_workspace_' + n, $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<div class="flex justify-end">
		<button
				type="submit"
				:disabled="isSaving"
				class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90"
			>
				{{ isSaving ? 'Guardando...' : 'Guardar cambios' }}
			</button>
			</div>
		</form>
	</div>
</template>
