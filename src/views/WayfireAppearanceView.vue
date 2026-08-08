<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import NumberInput from '@/components/ui/NumberInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PluginSection from '@/components/ui/PluginSection.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import TextInput from '@/components/ui/TextInput.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

const { t } = useI18n();

const decoration = useWayfireSection('decoration');
const animate = useWayfireSection('animate');

const animationOptions = computed(() => [
	{ label: t('views.wayfireAppearance.animations.none'), value: 'none' },
	{ label: t('views.wayfireAppearance.animations.zoom'), value: 'zoom' },
	{ label: t('views.wayfireAppearance.animations.fade'), value: 'fade' },
	{ label: t('views.wayfireAppearance.animations.fire'), value: 'fire' },
]);

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

async function saveAll() {
	await decoration.save();
	await animate.save();
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.windows')"
			:title="t('views.wayfireAppearance.title')"
			:description="t('views.wayfireAppearance.description')"
		/>

		<AlertMessage v-if="decoration.error.value || animate.error.value" tone="error"
			:message="decoration.error.value || animate.error.value" />
		<AlertMessage v-if="decoration.success.value || animate.success.value" tone="success"
			:message="t('common.saved')" />

		<form @submit.prevent="saveAll" class="flex flex-col gap-4">
			<PluginSection
				plugin-id="decoration"
				icon="preferences-desktop-theme"
				:description="t('views.wayfireAppearance.decorationHint')"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireAppearance.titleFont')">
						<TextInput
							:model-value="decoration.getVal('font', 'sans-serif')"
							@update:model-value="decoration.setVal('font', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.titleHeight')">
						<NumberInput
							:model-value="decoration.getInt('title_height', 30)"
							:min="0" :max="100"
							@update:model-value="decoration.setVal('title_height', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.borderSize')">
						<NumberInput
							:model-value="decoration.getInt('border_size', 4)"
							:min="0" :max="100"
							@update:model-value="decoration.setVal('border_size', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.buttonOrder')">
						<TextInput
							:model-value="decoration.getVal('button_order', 'minimize maximize close')"
							@update:model-value="decoration.setVal('button_order', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.activeColor')">
						<TextInput
							mono
							:model-value="decoration.getVal('active_color', '#222222aa')"
							@update:model-value="decoration.setVal('active_color', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.inactiveColor')">
						<TextInput
							mono
							:model-value="decoration.getVal('inactive_color', '#333333dd')"
							@update:model-value="decoration.setVal('inactive_color', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.borderRadius')">
						<NumberInput
							:model-value="decoration.getInt('border_radius', 0)"
							:min="0" :max="50"
							@update:model-value="decoration.setVal('border_radius', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.ignoreViews')">
						<TextInput
							mono
							:model-value="decoration.getVal('ignore_views', 'none')"
							placeholder="none, type is 'toplevel', etc."
							@update:model-value="decoration.setVal('ignore_views', $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<PluginSection
				plugin-id="animate"
				icon="preferences-desktop-effects"
				:description="t('views.wayfireAppearance.animateHint')"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.wayfireAppearance.openAnimation')">
						<SelectInput
							:modelValue="animate.getVal('open_animation', 'zoom')"
							:options="animationOptions"
							@update:modelValue="animate.setVal('open_animation', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.closeAnimation')">
						<SelectInput
							:modelValue="animate.getVal('close_animation', 'zoom')"
							:options="animationOptions"
							@update:modelValue="animate.setVal('close_animation', $event)"
						/>
					</FormGroup>
					<FormGroup :label="t('views.wayfireAppearance.duration')">
						<NumberInput
							:model-value="animate.getInt('duration', 500)"
							:min="0" :max="2000" :step="50"
							@update:model-value="animate.setVal('duration', $event)"
						/>
					</FormGroup>
				</div>
			</PluginSection>

			<div class="flex justify-end">
				<button
					type="submit"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90"
				>
					{{ t('common.save') }}
				</button>
			</div>
		</form>
	</div>
</template>
