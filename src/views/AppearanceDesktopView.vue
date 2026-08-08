<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import type { Store } from 'pinia';
import { computed, onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const showFiles = ref(false);
const showHiddenFiles = ref(false);
const iconSize = ref(64);

onMounted(async () => {
	try {
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		if (vskConfig.value?.desktop) {
			showFiles.value = vskConfig.value.desktop.showfiles ?? false;
			showHiddenFiles.value = vskConfig.value.desktop.showhiddenfiles ?? false;
			iconSize.value = Number(vskConfig.value.desktop.iconsize ?? 64);
		}
	} catch (err) {
		error.value = t('views.appearanceDesktop.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (iconSize.value < 24 || iconSize.value > 128) {
			throw new Error(t('views.appearanceDesktop.invalidIconSize'));
		}

		if (vskConfig.value) {
			vskConfig.value.desktop = {
				...vskConfig.value.desktop,
				showfiles: showFiles.value,
				showhiddenfiles: showHiddenFiles.value,
				iconsize: iconSize.value,
			};

			await writeConfig(vskConfig.value);

			successMessage.value = t('views.appearanceDesktop.saved');
			setTimeout(() => {
				successMessage.value = '';
			}, 3000);
		}
	} catch (err) {
		error.value = t('views.appearanceDesktop.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};

const isFormValid = computed(() => {
	return iconSize.value >= 24 && iconSize.value <= 128;
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceDesktop.title')"
			:description="t('views.appearanceDesktop.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="!isFormValid || saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceDesktop.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceDesktop.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-2">
				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceDesktop.files') }}</h3>
					<div class="flex flex-col gap-5">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">{{ t('views.appearanceDesktop.showFiles') }}</label>
							<div class="flex items-center gap-3">
								<SwitchToggle
									:is-on="showFiles"
									@toggle="val => (showFiles = val)"
								/>
								<span class="w-20 text-xs text-tx-muted">{{ showFiles ? t('views.appearanceDesktop.enabled') : t('views.appearanceDesktop.disabled') }}</span>
							</div>
						</div>

						<div class="flex items-center justify-between">
							<label class="text-sm font-medium text-tx-primary">{{ t('views.appearanceDesktop.showHiddenFiles') }}</label>
							<div class="flex items-center gap-3">
								<SwitchToggle
									:is-on="showHiddenFiles"
									:disabled="!showFiles"
									@toggle="val => (showHiddenFiles = val)"
								/>
								<span class="w-20 text-xs text-tx-muted">{{ showHiddenFiles ? t('views.appearanceDesktop.enabled') : t('views.appearanceDesktop.disabled') }}</span>
							</div>
						</div>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceDesktop.dimensions') }}</h3>
					<div class="flex flex-col gap-5">
						<FormGroup :label="t('views.appearanceDesktop.iconSize')" html-for="icon-size" :label-class="'flex justify-between w-full'">
							<template #default>
								<div class="flex items-center gap-3">
									<span class="text-xs text-tx-muted w-8">24px</span>
									<RangeSlider
										id="icon-size"
										v-model="iconSize"
										:min="24"
										:max="128"
									/>
									<span class="text-xs text-tx-muted w-10 text-right">{{ iconSize }}px</span>
								</div>
							</template>
						</FormGroup>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>
