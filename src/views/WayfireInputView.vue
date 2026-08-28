<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import NumberInput from '@/components/ui/NumberInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

const { t } = useI18n();
const input = useWayfireSection('input');

const accelProfiles = computed(() => [
	{ label: t('views.wayfireInput.accelProfiles.default'), value: 'default' },
	{ label: t('views.wayfireInput.accelProfiles.none'), value: 'none' },
	{ label: t('views.wayfireInput.accelProfiles.adaptive'), value: 'adaptive' },
	{ label: t('views.wayfireInput.accelProfiles.flat'), value: 'flat' },
]);

const clickMethods = computed(() => [
	{ label: t('views.wayfireInput.clickMethods.default'), value: 'default' },
	{ label: t('views.wayfireInput.clickMethods.none'), value: 'none' },
	{ label: t('views.wayfireInput.clickMethods.buttonAreas'), value: 'button-areas' },
	{ label: t('views.wayfireInput.clickMethods.clickfinger'), value: 'clickfinger' },
]);

const scrollMethods = computed(() => [
	{ label: t('views.wayfireInput.scrollMethods.default'), value: 'default' },
	{ label: t('views.wayfireInput.scrollMethods.none'), value: 'none' },
	{ label: t('views.wayfireInput.scrollMethods.twoFinger'), value: 'two-finger' },
	{ label: t('views.wayfireInput.scrollMethods.edge'), value: 'edge' },
	{ label: t('views.wayfireInput.scrollMethods.onButtonDown'), value: 'on-button-down' },
]);

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
			:section="t('sidebar.windows')"
			:title="t('views.wayfireInput.title')"
			:description="t('views.wayfireInput.description')"
		/>

		<AlertMessage v-if="input.error.value" :message="input.error.value" tone="error" />
		<AlertMessage v-if="input.success.value" :message="input.success.value" tone="success" />

		<div v-if="input.loading.value" class="text-center text-tx-muted py-8">{{ t('common.loading') }}</div>

		<form v-else @submit.prevent="input.save()" class="flex flex-col gap-4">
			<SectionCard :title="t('views.wayfireInput.keyboard')">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireInput.repeatDelay')">
						<NumberInput
							:model-value="input.getInt('kb_repeat_delay', 400)"
							:min="100" :max="2000" :step="50"
							@update:model-value="input.setVal('kb_repeat_delay', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.repeatRate')">
						<NumberInput
							:model-value="input.getInt('kb_repeat_rate', 40)"
							:min="1" :max="200" :step="1"
							@update:model-value="input.setVal('kb_repeat_rate', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.numlock')">
						<SwitchToggle :label="t('views.wayfireInput.numlock')"
							:isOn="input.getBool('kb_numlock_default_state', false)"
							@toggle="input.setBool('kb_numlock_default_state', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard :title="t('views.wayfireInput.mouse')">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireInput.leftHanded')">
						<SwitchToggle :label="t('views.wayfireInput.leftHanded')"
							:isOn="input.getBool('left_handed_mode', false)"
							@toggle="input.setBool('left_handed_mode', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.middleEmulation')">
						<SwitchToggle :label="t('views.wayfireInput.middleEmulation')"
							:isOn="input.getBool('middle_emulation', false)"
							@toggle="input.setBool('middle_emulation', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.accelProfile')">
						<SelectInput
							:modelValue="input.getVal('mouse_accel_profile', 'default')"
							:options="accelProfiles"
							@update:modelValue="input.setVal('mouse_accel_profile', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.cursorSpeed')">
						<input
							type="range" min="-1" max="1" step="0.05"
							:value="input.getFloat('mouse_cursor_speed', 0)"
							@input="input.setVal('mouse_cursor_speed', ($event.target as HTMLInputElement).value)"
							class="w-full"
						/>
						<span class="text-xs text-tx-muted">{{ input.getFloat('mouse_cursor_speed', 0).toFixed(2) }}</span>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.mouseNaturalScroll')">
						<SwitchToggle :label="t('views.wayfireInput.mouseNaturalScroll')"
							:isOn="input.getBool('mouse_natural_scroll', false)"
							@toggle="input.setBool('mouse_natural_scroll', $event)"
						/>
					</FormGroup>
				</div>
			</SectionCard>

			<SectionCard :title="t('views.wayfireInput.touchpad')">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireInput.tapToClick')">
						<SwitchToggle :label="t('views.wayfireInput.tapToClick')"
							:isOn="input.getBool('tap_to_click', true)"
							@toggle="input.setBool('tap_to_click', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.clickMethod')">
						<SelectInput
							:modelValue="input.getVal('click_method', 'default')"
							:options="clickMethods"
							@update:modelValue="input.setVal('click_method', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.scrollMethod')">
						<SelectInput
							:modelValue="input.getVal('scroll_method', 'default')"
							:options="scrollMethods"
							@update:modelValue="input.setVal('scroll_method', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.naturalScroll')">
						<SwitchToggle :label="t('views.wayfireInput.naturalScroll')"
							:isOn="input.getBool('natural_scroll', false)"
							@toggle="input.setBool('natural_scroll', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.disableWhileTyping')">
						<SwitchToggle :label="t('views.wayfireInput.disableWhileTyping')"
							:isOn="input.getBool('disable_touchpad_while_typing', false)"
							@toggle="input.setBool('disable_touchpad_while_typing', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.disableWithMouse')">
						<SwitchToggle :label="t('views.wayfireInput.disableWithMouse')"
							:isOn="input.getBool('disable_touchpad_while_mouse', false)"
							@toggle="input.setBool('disable_touchpad_while_mouse', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.tapAndDrag')">
						<SwitchToggle :label="t('views.wayfireInput.tapAndDrag')"
							:isOn="input.getBool('tap_and_drag', true)"
							@toggle="input.setBool('tap_and_drag', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.accelProfile')">
						<SelectInput
							:modelValue="input.getVal('touchpad_accel_profile', 'default')"
							:options="accelProfiles"
							@update:modelValue="input.setVal('touchpad_accel_profile', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.cursorSpeed')">
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

			<SectionCard :title="t('views.wayfireInput.cursor')">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireInput.cursorTheme')">
						<TextInput
							:model-value="input.getVal('cursor_theme', 'default')"
							@update:model-value="input.setVal('cursor_theme', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireInput.cursorSize')">
						<NumberInput
							:model-value="input.getInt('cursor_size', 24)"
							:min="16" :max="96" :step="4"
							@update:model-value="input.setVal('cursor_size', $event)"
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
					{{ input.saving.value ? t('common.saving') : t('common.save') }}
				</button>
			</div>
		</form>
	</div>
</template>
