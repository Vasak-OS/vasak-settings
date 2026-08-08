<script lang="ts" setup>
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import type { Store } from 'pinia';
import { computed, onMounted, onUnmounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { getOfficialWallpapers } from '@/services/style.service';

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const officialWallpapers = ref<string[]>([]);
const selectedWallpaperPath = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const configStore = ref<any>(null);
let unlistenFileDrop: (() => void) | null = null;

const wallpaperPreviewUrl = computed(() => {
	if (!selectedWallpaperPath.value) return '';
	return convertFileSrc(selectedWallpaperPath.value);
});

const getWallpaperLabel = (path: string) => {
	const filename = path.split('/').pop() ?? path;
	return filename.replace(/\.[^.]+$/, '');
};

const isSelected = (path: string) => selectedWallpaperPath.value === path;

const applyWallpaperPath = (path: string) => {
	selectedWallpaperPath.value = path.trim();
};

const handleDropPath = (path: string) => {
	const lowered = path.toLowerCase();
	const valid = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.avif'];
	if (!valid.some((ext) => lowered.endsWith(ext))) {
		error.value = t('views.appearanceWallpaper.invalidImage');
		return;
	}

	applyWallpaperPath(path);
	error.value = '';
};

const saveWallpaperConfig = async () => {
	if (!vskConfig.value) return;

	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		const finalPath = selectedWallpaperPath.value.trim();
		vskConfig.value.desktop = {
			...vskConfig.value.desktop,
			wallpaper: finalPath ? [finalPath] : [],
		};

		await writeConfig(vskConfig.value);
		successMessage.value = t('views.appearanceWallpaper.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 2500);
	} catch (err) {
		error.value = t('views.appearanceWallpaper.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};

onMounted(async () => {
	try {
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();
		selectedWallpaperPath.value = vskConfig.value?.desktop?.wallpaper?.[0] ?? '';

		officialWallpapers.value = await getOfficialWallpapers<string[]>();

		unlistenFileDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
			const firstPath = event.payload.paths?.[0];
			if (firstPath) {
				handleDropPath(firstPath);
			}
		});
	} catch (err) {
		error.value = t('views.appearanceWallpaper.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => {
	if (unlistenFileDrop) {
		unlistenFileDrop();
	}
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceWallpaper.title')"
			:description="t('views.appearanceWallpaper.description')"
		>
			<template #actions>
				<button
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveWallpaperConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceWallpaper.saveWallpaper') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceWallpaper.loading')" padding="lg" />

		<template v-else>
			<AlertMessage v-if="error" :message="error" tone="error" />

			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<div class="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
				<SectionCard>
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold">{{ t('views.appearanceWallpaper.officialTitle') }}</h2>
						<span class="text-sm text-tx-muted">{{ t('views.appearanceWallpaper.optionsCount').replace('{0}', String(officialWallpapers.length)) }}</span>
					</div>

					<div v-if="officialWallpapers.length === 0" class="mt-4">
						<EmptyStateBox :message="t('views.appearanceWallpaper.noWallpapers')" />
					</div>

					<div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<button
							v-for="wallpaperPath in officialWallpapers"
							:key="wallpaperPath"
							type="button"
							class="group overflow-hidden rounded-corner border text-left transition-all duration-200"
							:class="isSelected(wallpaperPath) ? 'border-primary bg-primary/10' : 'border-ui-border bg-ui-surface/30 hover:border-primary/50'"
							@click="applyWallpaperPath(wallpaperPath)"
						>
							<div class="aspect-video w-full overflow-hidden bg-ui-surface/40">
								<img :src="convertFileSrc(wallpaperPath)" :alt="getWallpaperLabel(wallpaperPath)" class="h-full w-full object-cover" loading="lazy" />
							</div>
							<div class="p-3">
								<p class="truncate text-sm font-medium">{{ getWallpaperLabel(wallpaperPath) }}</p>
								<p class="mt-1 truncate text-xs text-tx-muted">{{ wallpaperPath }}</p>
							</div>
						</button>
					</div>
				</SectionCard>

				<SectionCard>
					<h2 class="text-lg font-semibold">{{ t('views.appearanceWallpaper.customPathTitle') }}</h2>
					<p class="mt-1 text-sm text-tx-muted">{{ t('views.appearanceWallpaper.customPathHint') }}</p>

					<div class="mt-4">
						<label class="mb-1 block text-sm text-tx-muted" for="custom-wallpaper-path">{{ t('views.appearanceWallpaper.fullPath') }}</label>
						<input
							id="custom-wallpaper-path"
							type="text"
							v-model="selectedWallpaperPath"
							:placeholder="t('views.appearanceWallpaper.pathPlaceholder')"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2 text-sm outline-none focus:border-primary"
						/>
						<p class="mt-2 text-xs text-tx-muted">{{ t('views.appearanceWallpaper.dragHint') }}</p>
					</div>

					<div v-if="selectedWallpaperPath" class="mt-4 rounded-corner border border-ui-border bg-ui-surface/30 p-3">
						<p class="mb-2 text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.appearanceWallpaper.preview') }}</p>
						<div class="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-corner border-2 border-dashed border-[var(--primary-color,#0084ff)]/30 bg-ui-surface/80 transition-colors hover:border-[var(--primary-color,#0084ff)]/50 hover:bg-[var(--primary-color,#0084ff)]/5">
							<img :src="wallpaperPreviewUrl" :alt="t('views.appearanceWallpaper.selectedAlt')" class="pointer-events-none absolute inset-0 h-full w-full object-cover" />

							<div class="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20">
								<div class="pointer-events-none text-center">
									<span class="mb-2 block text-sm text-white">📂 {{ t('views.appearanceWallpaper.dropToChange') }}</span>
									<span class="text-xs text-white/70">{{ selectedWallpaperPath.split('/').pop() }}</span>
								</div>
							</div>
						</div>
						<p class="mt-2 break-all text-xs text-tx-muted">{{ selectedWallpaperPath }}</p>
					</div>
					<div v-else class="mt-4 rounded-corner border border-ui-border bg-ui-surface/30 p-3">
						<p class="mb-2 text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.appearanceWallpaper.preview') }}</p>
						<div class="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-corner border-2 border-dashed border-[var(--primary-color,#0084ff)]/30 bg-ui-surface/80 transition-colors hover:border-[var(--primary-color,#0084ff)]/50 hover:bg-[var(--primary-color,#0084ff)]/5">
							<div class="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20">
								<div class="pointer-events-none text-center">
									<span class="mb-2 block text-sm text-white">📂 {{ t('views.appearanceWallpaper.dropHere') }}</span>
								</div>
							</div>
						</div>
					</div>
				</SectionCard>
			</div>
		</template>
	</div>
</template>
