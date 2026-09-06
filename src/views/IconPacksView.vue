<script lang="ts" setup>
import { convertFileSrc } from '@tauri-apps/api/core';
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { getIconPackIcons, getIconPacks } from '@/services/style.service';

interface IconPackPreview {
	name: string;
	path: string;
	icons: string[];
}

const { t } = useI18n();

const configStore = ref<any>(null);
const iconPacks = ref<string[]>([]);
const packPreviews = ref<Map<string, IconPackPreview>>(new Map());
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const selectedDarkPack = ref('Adwaita');
const selectedLightPack = ref('Adwaita');

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		// Obtener el estado guardado de los packs
		if (vskConfig.value?.icons) {
			selectedDarkPack.value = vskConfig.value.icons.dark || 'Adwaita';
			selectedLightPack.value = vskConfig.value.icons.light || 'Adwaita';
		}

		// Obtener packs disponibles
		const packs = await getIconPacks();
		iconPacks.value = Array.isArray(packs) && packs.length ? packs : ['Adwaita'];

		// Cargar previsualizaciones para todos los packs visibles
		await Promise.all(iconPacks.value.map((packName) => loadPackPreview(packName)));
	} catch (err) {
		error.value = t('views.appearanceIconPacks.errorLoading').replace('{0}', String(err));
		console.error(err);
	} finally {
		loading.value = false;
	}
});

const loadPackPreview = async (packName: string) => {
	try {
		if (packPreviews.value.has(packName)) {
			return;
		}
		const preview = await getIconPackIcons(packName);
		packPreviews.value.set(packName, preview);
	} catch (err) {
		console.warn(`No se pudo cargar preview para ${packName}:`, err);
	}
};

const selectDarkPack = async (packName: string) => {
	selectedDarkPack.value = packName;
	await loadPackPreview(packName);
};

const selectLightPack = async (packName: string) => {
	selectedLightPack.value = packName;
	await loadPackPreview(packName);
};

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (!vskConfig.value) {
			throw new Error(t('views.appearanceIconPacks.configNotLoaded'));
		}

		// Actualizar los packs en la configuración
		if (!vskConfig.value.icons) {
			vskConfig.value.icons = { dark: '', light: '' };
		}
		vskConfig.value.icons.dark = selectedDarkPack.value;
		vskConfig.value.icons.light = selectedLightPack.value;

		// Guardar configuración
		await writeConfig(vskConfig.value);

		successMessage.value = t('views.appearanceIconPacks.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceIconPacks.errorSaving').replace('{0}', String(err));
		console.error(err);
	} finally {
		saving.value = false;
	}
};

const getPackPreview = (packName: string) => {
	return packPreviews.value.get(packName);
};

const isFormValid = computed(() => {
	return selectedDarkPack.value && selectedLightPack.value;
});

const isChanged = computed(() => {
	return (
		selectedDarkPack.value !== (vskConfig.value?.icons?.dark || 'Adwaita') ||
		selectedLightPack.value !== (vskConfig.value?.icons?.light || 'Adwaita')
	);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceIconPacks.title')"
			:description="t('views.appearanceIconPacks.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="!isFormValid || saving || !isChanged"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceIconPacks.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceIconPacks.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />

			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<!-- Modo Oscuro -->
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceIconPacks.darkMode') }}</h3>
				<FormGroup :label="t('views.appearanceIconPacks.selectPack')" html-for="dark-pack" :label-class="'flex justify-between w-full'">
					<div class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
						<div
							v-for="pack in iconPacks"
							:key="`dark-${pack}`"
							class="cursor-pointer transition-all duration-200"
							@click="selectDarkPack(pack)"
						>
							<div
								class="rounded-corner border-2 p-4 flex flex-col gap-3 hover:bg-ui-surface/50"
								:class="[
									selectedDarkPack === pack
										? 'border-primary bg-primary/10'
										: 'border-ui-border bg-ui-surface/30',
								]"
							>
								<div class="flex gap-2 justify-center">
									<img
										v-for="(icon, idx) in (getPackPreview(pack)?.icons || []).slice(0, 4)"
										:key="`${pack}-icon-${idx}`"
										:src="convertFileSrc(icon)"
										:alt="t('views.appearanceIconPacks.iconAlt').replace('{0}', pack).replace('{1}', String(idx))"
										class="w-8 h-8 rounded opacity-80 hover:opacity-100 transition-opacity"
										@error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
									/>
									<div
										v-if="!getPackPreview(pack) || getPackPreview(pack)?.icons.length === 0"
										class="w-8 h-8 rounded bg-ui-border/50 flex items-center justify-center text-xs text-tx-muted"
									>
										?
									</div>
								</div>
								<p class="text-sm font-medium text-tx-primary text-center truncate">{{ pack }}</p>
							</div>
						</div>
					</div>
				</FormGroup>
			</SectionCard>

			<!-- Modo Claro -->
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceIconPacks.lightMode') }}</h3>
				<FormGroup :label="t('views.appearanceIconPacks.selectPack')" html-for="light-pack" :label-class="'flex justify-between w-full'">
					<div class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
						<div
							v-for="pack in iconPacks"
							:key="`light-${pack}`"
							class="cursor-pointer transition-all duration-200"
							@click="selectLightPack(pack)"
						>
							<div
								class="rounded-corner border-2 p-4 flex flex-col gap-3 hover:bg-ui-surface/50"
								:class="[
									selectedLightPack === pack
										? 'border-primary bg-primary/10'
										: 'border-ui-border bg-ui-surface/30',
								]"
							>
								<div class="flex gap-2 justify-center">
									<img
										v-for="(icon, idx) in (getPackPreview(pack)?.icons || []).slice(0, 4)"
										:key="`${pack}-light-icon-${idx}`"
										:src="convertFileSrc(icon)"
										:alt="t('views.appearanceIconPacks.iconAlt').replace('{0}', pack).replace('{1}', String(idx))"
										class="w-8 h-8 rounded opacity-80 hover:opacity-100 transition-opacity"
										@error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
									/>
									<div
										v-if="!getPackPreview(pack) || getPackPreview(pack)?.icons.length === 0"
										class="w-8 h-8 rounded bg-ui-border/50 flex items-center justify-center text-xs text-tx-muted"
									>
										?
									</div>
								</div>
								<p class="text-sm font-medium text-tx-primary text-center truncate">{{ pack }}</p>
								<div
									v-if="selectedLightPack === pack"
									class="text-xs text-primary font-medium text-center"
								>
									✓ {{ t('views.appearanceIconPacks.selected') }}
								</div>
							</div>
						</div>
					</div>
				</FormGroup>
			</SectionCard>

			<!-- Información -->
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.appearanceIconPacks.info') }}</h3>
				<div class="text-sm text-tx-muted space-y-2">
					<p>
						<span class="font-medium text-tx-primary">{{ t('views.appearanceIconPacks.darkMode') }}:</span>
						{{ t('views.appearanceIconPacks.infoDark') }}
					</p>
					<p>
						<span class="font-medium text-tx-primary">{{ t('views.appearanceIconPacks.lightMode') }}:</span>
						{{ t('views.appearanceIconPacks.infoLight') }}
					</p>
					<p class="mt-4">
						{{ t('views.appearanceIconPacks.infoPaths') }} <code class="text-xs">/usr/share/icons</code>
						{{ t('views.appearanceIconPacks.infoPathsSeparator') }}
						<code class="text-xs">~/.local/share/icons</code>
					</p>
				</div>
			</SectionCard>
		</div>
	</div>
</template>
