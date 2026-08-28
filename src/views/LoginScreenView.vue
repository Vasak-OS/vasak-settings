<script lang="ts" setup>
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';
import { type GreeterConfig, getGreeterConfig, setGreeterConfig } from '@/services/greeter.service';
import { getOfficialWallpapers, getSchemes } from '@/services/style.service';

/**
 * Un esquema, con la ruta de su archivo.
 *
 * La ruta importa acá más que el id: el greeter corre antes de que haya sesión,
 * así que no puede leer los esquemas del home del usuario. Lo que se guarda es
 * el documento entero, copiado, y para copiarlo hay que saber de dónde.
 */
interface SchemeItem {
	path: string;
	scheme: {
		id: string;
		name: string;
	};
}

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const current = ref<GreeterConfig | null>(null);
const schemes = ref<SchemeItem[]>([]);
const officialWallpapers = ref<string[]>([]);
const thumbnails = ref<Record<string, string>>({});

const darkMode = ref(true);
const selectedSchemeId = ref('');
const selectedBackground = ref('');

let unlistenFileDrop: (() => void) | null = null;

/** Lo que la pantalla de inicio de sesión puede dibujar, y nada más. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv'];

const schemeOptions = computed(() => [
	{ label: t('views.loginScreen.schemeNone'), value: '' },
	...schemes.value
		.slice()
		.sort((first, second) => first.scheme.name.localeCompare(second.scheme.name))
		.map((item) => ({ label: `${item.scheme.name} · ${item.scheme.id}`, value: item.scheme.id })),
]);

const selectedIsVideo = computed(() =>
	VIDEO_EXTENSIONS.some((ext) => selectedBackground.value.toLowerCase().endsWith(ext))
);

const usingSystemBackground = computed(() => selectedBackground.value.trim() === '');

const getWallpaperLabel = (path: string) => {
	const filename = path.split('/').pop() ?? path;
	return filename.replace(/\.[^.]+$/, '');
};

const isSelected = (path: string) => selectedBackground.value === path;

const thumbnailFor = (path: string) => thumbnails.value[path] ?? '';

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

const applyBackgroundPath = (path: string) => {
	selectedBackground.value = path.trim();
	void loadThumbnail(selectedBackground.value);
};

const useSystemBackground = () => {
	selectedBackground.value = '';
};

const handleDropPath = (path: string) => {
	const lowered = path.toLowerCase();

	if (![...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].some((ext) => lowered.endsWith(ext))) {
		error.value = t('views.loginScreen.invalidFile');
		return;
	}

	applyBackgroundPath(path);
	error.value = '';
};

const applyLoaded = (config: GreeterConfig) => {
	current.value = config;
	darkMode.value = config.theme === 'dark';
	selectedBackground.value = config.background ?? '';
	selectedSchemeId.value = config.scheme_id ?? '';
};

onMounted(async () => {
	try {
		const [config, loadedSchemes, wallpapers] = await Promise.all([
			getGreeterConfig(),
			getSchemes(),
			getOfficialWallpapers<string[]>(),
		]);

		applyLoaded(config);
		schemes.value = Array.isArray(loadedSchemes) ? loadedSchemes : [];
		officialWallpapers.value = Array.isArray(wallpapers) ? wallpapers : [];

		// El esquema guardado puede no estar más entre los instalados; se
		// muestra igual para no dar a entender que no hay ninguno puesto.
		if (
			selectedSchemeId.value &&
			!schemes.value.some((item) => item.scheme.id === selectedSchemeId.value)
		) {
			schemes.value = [
				{ path: '', scheme: { id: selectedSchemeId.value, name: selectedSchemeId.value } },
				...schemes.value,
			];
		}

		// De a una y en orden, para no lanzar diez ffmpeg a la vez.
		for (const ruta of officialWallpapers.value) {
			await loadThumbnail(ruta);
		}

		await loadThumbnail(selectedBackground.value);

		unlistenFileDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
			const firstPath = event.payload.paths?.[0];
			if (firstPath) {
				handleDropPath(firstPath);
			}
		});
	} catch (err) {
		error.value = t('views.loginScreen.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => {
	if (unlistenFileDrop) {
		unlistenFileDrop();
	}
});

const save = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		const scheme = schemes.value.find((item) => item.scheme.id === selectedSchemeId.value);

		applyLoaded(
			await setGreeterConfig({
				background: usingSystemBackground.value ? null : selectedBackground.value.trim(),
				theme: darkMode.value ? 'dark' : 'light',
				schemePath: scheme?.path ? scheme.path : null,
			})
		);

		successMessage.value = t('views.loginScreen.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.loginScreen.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.loginScreen.title')"
			:description="t('views.loginScreen.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="save"
				>
					{{ saving ? t('common.saving') : t('views.loginScreen.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.loginScreen.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />
			<AlertMessage :message="t('views.loginScreen.needsAdmin')" tone="info" />

			<div class="grid gap-4 xl:grid-cols-2">
				<SectionCard>
					<h3 class="mb-1 text-lg font-medium">{{ t('views.loginScreen.appearanceSection') }}</h3>
					<p class="mb-4 text-sm text-tx-muted">{{ t('views.loginScreen.appearanceHint') }}</p>

					<div class="flex flex-col gap-5">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium">{{ t('views.loginScreen.darkMode') }}</label>
							<div class="flex items-center gap-3">
								<SwitchToggle :label="t('views.loginScreen.darkMode')" :is-on="darkMode" @toggle="(val: boolean) => (darkMode = val)" />
								<span class="w-16 text-xs text-tx-muted">
									{{ darkMode ? t('views.loginScreen.dark') : t('views.loginScreen.light') }}
								</span>
							</div>
						</div>

						<FormGroup :label="t('views.loginScreen.scheme')" html-for="greeter-scheme">
							<SelectInput
								id="greeter-scheme"
								v-model="selectedSchemeId"
								:options="schemeOptions"
							/>
						</FormGroup>

						<p class="text-sm text-tx-muted">{{ t('views.loginScreen.schemeHint') }}</p>
					</div>
				</SectionCard>

				<SectionCard>
					<h3 class="mb-1 text-lg font-medium">{{ t('views.loginScreen.currentSection') }}</h3>
					<p class="mb-4 text-sm text-tx-muted">{{ t('views.loginScreen.currentHint') }}</p>

					<div class="flex flex-col gap-3 text-sm">
						<div class="rounded-corner border border-ui-border bg-ui-surface/30 p-3">
							<p class="text-xs uppercase tracking-wider text-tx-muted">
								{{ t('views.loginScreen.currentImage') }}
							</p>
							<p class="mt-1 break-all font-mono text-xs">
								{{ current?.effective_image || t('views.loginScreen.nothing') }}
							</p>
						</div>

						<div class="rounded-corner border border-ui-border bg-ui-surface/30 p-3">
							<p class="text-xs uppercase tracking-wider text-tx-muted">
								{{ t('views.loginScreen.currentVideo') }}
							</p>
							<p class="mt-1 break-all font-mono text-xs">
								{{ current?.effective_video || t('views.loginScreen.nothing') }}
							</p>
						</div>

						<p v-if="!current?.background" class="text-sm text-tx-muted">
							{{ t('views.loginScreen.usingSystemBackground') }}
						</p>
					</div>
				</SectionCard>
			</div>

			<SectionCard v-if="selectedIsVideo">
				<h3 class="text-lg font-medium">{{ t('views.loginScreen.videoTitle') }}</h3>
				<p class="mt-1 text-sm text-tx-muted">{{ t('views.loginScreen.videoNote') }}</p>
			</SectionCard>

			<div class="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
				<SectionCard>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-medium">{{ t('views.loginScreen.officialTitle') }}</h3>
						<button
							type="button"
							class="rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-xs font-medium hover:bg-ui-surface disabled:opacity-50"
							:disabled="usingSystemBackground"
							@click="useSystemBackground"
						>
							{{ t('views.loginScreen.useSystemBackground') }}
						</button>
					</div>

					<div v-if="officialWallpapers.length === 0" class="mt-4">
						<EmptyStateBox :message="t('views.loginScreen.noWallpapers')" />
					</div>

					<div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<button
							v-for="wallpaperPath in officialWallpapers"
							:key="wallpaperPath"
							type="button"
							class="group overflow-hidden rounded-corner border text-left transition-all duration-200"
							:class="
								isSelected(wallpaperPath)
									? 'border-primary bg-primary/10'
									: 'border-ui-border bg-ui-surface/30 hover:border-primary/50'
							"
							@click="applyBackgroundPath(wallpaperPath)"
						>
							<div class="aspect-video w-full overflow-hidden bg-ui-surface/40">
								<img
									v-if="thumbnailFor(wallpaperPath)"
									:src="thumbnailFor(wallpaperPath)"
									:alt="getWallpaperLabel(wallpaperPath)"
									class="h-full w-full object-cover"
									loading="lazy"
								/>
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
					<h3 class="text-lg font-medium">{{ t('views.loginScreen.customPathTitle') }}</h3>
					<p class="mt-1 text-sm text-tx-muted">{{ t('views.loginScreen.customPathHint') }}</p>

					<div class="mt-4 flex flex-col gap-3">
						<FormGroup :label="t('views.loginScreen.fullPath')" html-for="greeter-background-path">
							<TextInput
								id="greeter-background-path"
								mono
								v-model="selectedBackground"
								:placeholder="t('views.loginScreen.pathPlaceholder')"
							/>
						</FormGroup>

						<p class="text-xs text-tx-muted">{{ t('views.loginScreen.dragHint') }}</p>
						<p class="text-xs text-tx-muted">{{ t('views.loginScreen.copyNote') }}</p>
					</div>
				</SectionCard>
			</div>
		</div>
	</div>
</template>
