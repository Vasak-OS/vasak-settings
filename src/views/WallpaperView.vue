<script lang="ts" setup>
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
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
import ProgressBar from '@/components/ui/ProgressBar.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
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
let unlistenProgress: (() => void) | null = null;
let unlistenFileDrop: (() => void) | null = null;

const getWallpaperLabel = (path: string) => {
	const filename = path.split('/').pop() ?? path;
	return filename.replace(/\.[^.]+$/, '');
};

const isSelected = (path: string) => selectedWallpaperPath.value === path;

const applyWallpaperPath = (path: string) => {
	selectedWallpaperPath.value = path.trim();
	void loadThumbnail(selectedWallpaperPath.value);
};

const handleDropPath = (path: string) => {
	const lowered = path.toLowerCase();
	// Los fondos también pueden ser videos, en los formatos que el escritorio
	// sabe reproducir: mp4, webm y ogv. Un mkv o un mov quedan afuera a
	// propósito —WebKit no los abre— y es mejor decirlo al soltarlos que
	// dejar la pantalla negra después de guardar.
	const valid = [
		'.jpg',
		'.jpeg',
		'.png',
		'.webp',
		'.bmp',
		'.gif',
		'.avif',
		'.mp4',
		'.webm',
		'.ogv',
	];
	if (!valid.some((ext) => lowered.endsWith(ext))) {
		error.value = t('views.appearanceWallpaper.invalidFile');
		return;
	}

	applyWallpaperPath(path);
	error.value = '';
};

/**
 * Si el fondo es un video, pausarlo con batería.
 *
 * Un video de fondo mantiene la máquina trabajando todo el tiempo: medido,
 * pasa de 4 % a 20 % de un núcleo. Con batería eso se nota, así que se puede
 * congelar en un cuadro hasta que vuelva el cable. Por omisión sí, porque es
 * lo que menos sorprende a quien no sabía que su fondo consumía.
 */
const pauseVideoOnBattery = ref(true);

const selectedIsVideo = computed(() => {
	const lowered = selectedWallpaperPath.value.toLowerCase();
	return ['.mp4', '.webm', '.ogv'].some((ext) => lowered.endsWith(ext));
});

/** El avance de la optimización, para no dejar la ventana muda mientras recodifica. */
/**
 * Miniaturas: ruta original → URL de la copia chica.
 *
 * Los fondos que trae el sistema son de 4K y 5K. Entregarle esos archivos al
 * webview para dibujar recuadros de 200 píxeles hacía que la aplicación
 * creciera hasta que el kernel la mataba: diez imágenes de esas, decodificadas,
 * son más de medio giga, y WebKit guarda además copias escaladas.
 */
const thumbnails = ref<Record<string, string>>({});

async function loadThumbnail(path: string) {
	if (!path || thumbnails.value[path]) return;

	try {
		const miniatura = await invoke<string>('wallpaper_thumbnail', { path });
		thumbnails.value = { ...thumbnails.value, [path]: convertFileSrc(miniatura) };
	} catch {
		// Sin miniatura se muestra el original: peor para la memoria, pero es
		// mejor que un recuadro vacío.
		thumbnails.value = { ...thumbnails.value, [path]: convertFileSrc(path) };
	}
}

const thumbnailFor = (path: string) => thumbnails.value[path] ?? '';

const optimizing = ref(false);
const optimizeProgress = ref(0);
const optimizeDetail = ref('');

const saveWallpaperConfig = async () => {
	if (!vskConfig.value) return;

	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		let finalPath = selectedWallpaperPath.value.trim();

		// Un video se prepara una vez, acá, y no en cada cuadro después: se
		// baja a la resolución de la pantalla, se limita a 30 fps y se le saca
		// el audio, que en un fondo no suena pero se decodifica igual. Si no
		// hay nada que mejorar devuelve el original sin copiar nada.
		if (finalPath && selectedIsVideo.value) {
			optimizing.value = true;
			optimizeProgress.value = 0;
			optimizeDetail.value = '';

			try {
				const preparado = await invoke<{ path: string; optimized: boolean; detail: string }>(
					'prepare_wallpaper_video',
					{ path: finalPath }
				);
				finalPath = preparado.path;
				optimizeDetail.value = preparado.detail;
			} catch (err) {
				// Que no se pueda optimizar no es motivo para no poder poner el
				// fondo: se guarda el original y el escritorio lo reproduce igual.
				optimizeDetail.value = String(err);
			} finally {
				optimizing.value = false;
			}
		}
		vskConfig.value.desktop = {
			...vskConfig.value.desktop,
			wallpaper: finalPath ? [finalPath] : [],
			pausevideoonbattery: pauseVideoOnBattery.value,
		} as typeof vskConfig.value.desktop;

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
		pauseVideoOnBattery.value = (vskConfig.value?.desktop as any)?.pausevideoonbattery ?? true;

		officialWallpapers.value = await getOfficialWallpapers<string[]>();

		// De a una y en orden, para no lanzar diez ffmpeg a la vez.
		for (const ruta of officialWallpapers.value) {
			await loadThumbnail(ruta);
		}

		await loadThumbnail(selectedWallpaperPath.value);

		unlistenProgress = await listen<number>('wallpaper-video-progress', (event) => {
			optimizeProgress.value = event.payload ?? 0;
		});

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
	if (unlistenProgress) {
		unlistenProgress();
	}

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

			<!-- Sólo aparece cuando hace falta: con una imagen de fondo, esto no
			     significa nada y sería una opción más para leer y descartar. -->
			<SectionCard v-if="selectedIsVideo">
				<h2 class="text-lg font-semibold">{{ t('views.appearanceWallpaper.videoTitle') }}</h2>
				<p class="mt-1 text-sm text-tx-muted">{{ t('views.appearanceWallpaper.videoPowerNote') }}</p>

				<div v-if="optimizing" class="mt-4">
					<p class="mb-2 text-sm text-tx-muted">
						{{ t('views.appearanceWallpaper.optimizing') }}
					</p>
					<ProgressBar :value="optimizeProgress" :label="`${optimizeProgress}%`" />
				</div>

				<p v-else-if="optimizeDetail" class="mt-4 text-sm text-tx-muted">
					{{ t('views.appearanceWallpaper.optimized').replace('{0}', optimizeDetail) }}
				</p>

				<div class="mt-4 flex items-center justify-between">
					<label class="text-sm font-medium text-tx-primary">
						{{ t('views.appearanceWallpaper.pauseOnBattery') }}
					</label>
					<SwitchToggle
						:is-on="pauseVideoOnBattery"
						@toggle="(val: boolean) => (pauseVideoOnBattery = val)"
					/>
				</div>
			</SectionCard>

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
								<img v-if="thumbnailFor(wallpaperPath)" :src="thumbnailFor(wallpaperPath)" :alt="getWallpaperLabel(wallpaperPath)" class="h-full w-full object-cover" loading="lazy" />
							<!-- Mientras se genera: un recuadro, no un icono de imagen rota. -->
							<div v-else class="h-full w-full animate-pulse bg-ui-surface/60"></div>
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
							class="w-full rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2 text-sm focus:border-primary"
						/>
						<p class="mt-2 text-xs text-tx-muted">{{ t('views.appearanceWallpaper.dragHint') }}</p>
					</div>

					<div v-if="selectedWallpaperPath" class="mt-4 rounded-corner border border-ui-border bg-ui-surface/30 p-3">
						<p class="mb-2 text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.appearanceWallpaper.preview') }}</p>
						<div class="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-corner border-2 border-dashed border-primary/30 bg-ui-surface/80 transition-colors hover:border-primary/50 hover:bg-primary/5">
							<!-- También la previsualización va por miniatura, y de un video
							     muestra un cuadro. Un elemento multimedia apuntando al
							     protocolo interno falla y reintenta, y cada intento entrega el
							     archivo entero otra vez. -->
							<img v-if="thumbnailFor(selectedWallpaperPath)" :src="thumbnailFor(selectedWallpaperPath)" :alt="t('views.appearanceWallpaper.selectedAlt')" class="pointer-events-none absolute inset-0 h-full w-full object-cover" />
							<div v-else class="absolute inset-0 animate-pulse bg-ui-surface/60"></div>

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
						<div class="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-corner border-2 border-dashed border-primary/30 bg-ui-surface/80 transition-colors hover:border-primary/50 hover:bg-primary/5">
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
