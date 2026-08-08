<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import KeyBindingInput from '@/components/ui/KeyBindingInput.vue';
import NumberInput from '@/components/ui/NumberInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

const { t } = useI18n();

const vswitch = useWayfireSection('vswitch');
const expo = useWayfireSection('expo');
const oswitch = useWayfireSection('oswitch');
// The workspace grid lives in [core], not in a plugin, and had no UI at all.
const core = useWayfireSection('core');

const isSaving = computed(
	() => vswitch.saving.value || expo.saving.value || core.saving.value || oswitch.saving.value
);

const gridSummary = computed(() => {
	const columns = core.getInt('vwidth', 3);
	const rows = core.getInt('vheight', 2);
	return t('views.wayfireWorkspaces.gridSummary')
		.replace('{0}', String(columns))
		.replace('{1}', String(rows))
		.replace('{2}', String(columns * rows));
});

onMounted(async () => {
	await Promise.all([vswitch.load(), expo.load(), core.load(), oswitch.load()]);
	core.initDefaults({ vwidth: '3', vheight: '2' });
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
	oswitch.initDefaults({
		next_output: '<super> KEY_O',
		next_output_with_win: '<super> <shift> KEY_O',
	});
});

async function saveAll() {
	// [core] is merged, so saving here cannot disturb the plugin list.
	await Promise.all([vswitch.save(), expo.save(), core.save(), oswitch.save()]);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.windows')"
			:title="t('views.wayfireWorkspaces.title')"
			:description="t('views.wayfireWorkspaces.description')"
		/>

		<AlertMessage v-if="vswitch.error.value || expo.error.value" tone="error"
			:message="vswitch.error.value || expo.error.value" />
		<AlertMessage v-if="vswitch.success.value || expo.success.value" tone="success"
			:message="t('common.saved')" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<SectionCard>
				<h3 class="text-base font-medium">{{ t('views.wayfireWorkspaces.gridTitle') }}</h3>
				<p class="mt-0.5 mb-3 text-sm text-tx-muted">
					{{ t('views.wayfireWorkspaces.gridHint') }} {{ gridSummary }}
				</p>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireWorkspaces.columns')">
						<NumberInput
							:model-value="core.getInt('vwidth', 3)"
							:min="1" :max="9"
							@update:model-value="core.setVal('vwidth', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireWorkspaces.rows')">
						<NumberInput
							:model-value="core.getInt('vheight', 2)"
							:min="1" :max="9"
							@update:model-value="core.setVal('vheight', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<PluginSection plugin-id="vswitch" icon="video-display">
				<div class="mb-3">
					<div class="grid gap-4 sm:grid-cols-2">
						<FormGroup :label="t('views.wayfireWorkspaces.duration')">
							<NumberInput
								:model-value="vswitch.getInt('duration', 300)"
								:min="0" :max="2000" :step="50"
								@update:model-value="vswitch.setVal('duration', $event)"
							/>
						</FormGroup>
						<FormGroup :label="t('views.wayfireWorkspaces.wraparound')">
							<SwitchToggle
								:isOn="vswitch.getBool('wraparound', false)"
								@toggle="vswitch.setBool('wraparound', $event)"
							/>
						</FormGroup>
					</div>
				</div>

				<h4 class="mb-2 text-sm font-medium">{{ t('views.wayfireWorkspaces.switchShortcuts') }}</h4>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<FormGroup v-for="dir in ['left', 'down', 'up', 'right']" :key="dir" :label="t(`views.wayfireWorkspaces.directions.${dir}`)">
						<KeyBindingInput
							:modelValue="vswitch.getVal('binding_' + dir, '')"
							@update:modelValue="vswitch.setVal('binding_' + dir, $event)"
						/>
					</FormGroup>
				</div>

				<h4 class="mb-2 mt-4 text-sm font-medium">{{ t('views.wayfireWorkspaces.moveWithShortcuts') }}</h4>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<FormGroup v-for="dir in ['left', 'down', 'up', 'right']" :key="'with_'+dir" :label="t(`views.wayfireWorkspaces.directions.${dir}`)">
						<KeyBindingInput
							:modelValue="vswitch.getVal('with_win_' + dir, '')"
							@update:modelValue="vswitch.setVal('with_win_' + dir, $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="expo" icon="view-grid">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireWorkspaces.expoToggle')">
						<KeyBindingInput
							:modelValue="expo.getVal('toggle', '')"
							@update:modelValue="expo.setVal('toggle', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireWorkspaces.duration')">
						<NumberInput
							:model-value="expo.getInt('duration', 300)"
							:min="0" :max="2000" :step="50"
							@update:model-value="expo.setVal('duration', $event)"
						/>
					</FormGroup>
				</div>

				<h4 class="mb-2 mt-4 text-sm font-medium">{{ t('views.wayfireWorkspaces.selectByNumber') }}</h4>
				<div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<FormGroup v-for="n in 9" :key="n" :label="t('views.wayfireWorkspaces.workspace').replace('{0}', String(n))">
						<KeyBindingInput
							:modelValue="expo.getVal('select_workspace_' + n, '')"
							@update:modelValue="expo.setVal('select_workspace_' + n, $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection plugin-id="oswitch" icon="video-display">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireWorkspaces.nextOutput')">
						<KeyBindingInput
							:modelValue="oswitch.getVal('next_output', '<super> KEY_O')"
							@update:modelValue="oswitch.setVal('next_output', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireWorkspaces.nextOutputWithWin')">
						<KeyBindingInput
							:modelValue="oswitch.getVal('next_output_with_win', '<super> <shift> KEY_O')"
							@update:modelValue="oswitch.setVal('next_output_with_win', $event)"
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
				{{ isSaving ? t('common.saving') : t('common.save') }}
			</button>
			</div>
		</form>
	</div>
</template>
