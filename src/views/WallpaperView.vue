<script lang="ts" setup>
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
	readConfig,
	writeConfig,
	useConfigStore,
	type VSKConfig,
} from '@vasakgroup/plugin-config-manager';
import type { Store } from 'pinia';
import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { getOfficialWallpapers } from '@/services/style.service';

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
		error.value = 'El archivo arrastrado no es una imagen valida';
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
		successMessage.value = 'Wallpaper guardado correctamente';
		setTimeout(() => {
			successMessage.value = '';
		}, 2500);
	} catch (err) {
		error.value = `Error guardando wallpaper: ${err}`;
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
		error.value = `Error cargando wallpapers: ${err}`;
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
		<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">Apariencia</p>
				<h1 class="text-2xl font-semibold">Wallpaper</h1>
				<p class="text-sm text-tx-muted">Selecciona un fondo oficial o define una ruta completa personalizada.</p>
			</div>

			<button
				type="button"
				class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
				:disabled="saving"
				@click="saveWallpaperConfig"
			>
				{{ saving ? 'Guardando...' : 'Guardar Wallpaper' }}
			</button>
		</header>

		<div v-if="loading" class="grid place-items-center rounded-corner border border-dashed border-ui-border bg-ui-surface/20 p-6 text-sm text-tx-muted">
			Cargando wallpapers...
		</div>

		<template v-else>
			<div v-if="error" class="rounded-corner border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
				{{ error }}
			</div>

			<div v-if="successMessage" class="rounded-corner border border-status-success/40 bg-status-success/10 p-4 text-sm text-status-success">
				{{ successMessage }}
			</div>

			<div class="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
				<SectionCard>
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold">Wallpapers Oficiales</h2>
						<span class="text-sm text-tx-muted">{{ officialWallpapers.length }} opciones</span>
					</div>

					<div v-if="officialWallpapers.length === 0" class="mt-4 rounded-corner border border-dashed border-ui-border bg-ui-surface/20 p-4 text-sm text-tx-muted">
						No se encontraron wallpapers en /usr/share/backgrounds/vasakos.
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
					<h2 class="text-lg font-semibold">Ruta Personalizada</h2>
					<p class="mt-1 text-sm text-tx-muted">Define un path absoluto. Siempre se guarda el path completo.</p>

					<div class="mt-4">
						<label class="mb-1 block text-sm text-tx-muted" for="custom-wallpaper-path">Path completo</label>
						<input
							id="custom-wallpaper-path"
							type="text"
							v-model="selectedWallpaperPath"
							placeholder="/home/usuario/Imagenes/mi-wallpaper.jpg"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2 text-sm outline-none focus:border-primary"
						/>
						<p class="mt-2 text-xs text-tx-muted">Tambien puedes arrastrar una imagen al window para cargar su path.</p>
					</div>

					<div v-if="selectedWallpaperPath" class="mt-4 rounded-corner border border-ui-border bg-ui-surface/30 p-3">
						<p class="mb-2 text-xs uppercase tracking-[0.16em] text-tx-muted">Preview</p>
						<div class="overflow-hidden rounded-corner border border-ui-border bg-ui-surface/30">
							<img :src="wallpaperPreviewUrl" alt="Wallpaper seleccionado" class="h-40 w-full object-cover" />
						</div>
						<p class="mt-2 break-all text-xs text-tx-muted">{{ selectedWallpaperPath }}</p>
					</div>
				</SectionCard>
			</div>
		</template>
	</div>
</template>
