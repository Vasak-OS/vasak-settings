<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	ConfigSection,
	EmptyState,
	FormGroup,
	PageHeader,
	SelectField,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref } from 'vue';
import {
	applyCursor,
	type CursorThemePreview,
	getCursorState,
	getCursorThemePreview,
	getCursorThemes,
} from '@/services/style.service';

/** Los mismos que ofrece el backend: si no coinciden, `apply_cursor` los rechaza. */
const SIZES = [16, 24, 32, 48, 64, 96];

const { t } = useI18n();

const themes = ref<string[]>([]);
const previews = ref<Map<string, CursorThemePreview>>(new Map());
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const appliedTheme = ref('Adwaita');
const appliedSize = ref(24);
const selectedTheme = ref('Adwaita');
const selectedSize = ref(24);

const sizeOptions = computed(() =>
	SIZES.map((size) => ({ label: `${size} px`, value: String(size) }))
);

const isChanged = computed(
	() => selectedTheme.value !== appliedTheme.value || selectedSize.value !== appliedSize.value
);

const loadPreview = async (theme: string) => {
	if (previews.value.has(theme)) {
		return;
	}
	try {
		previews.value.set(theme, await getCursorThemePreview(theme));
	} catch (err) {
		console.warn(`No se pudo cargar la vista previa de ${theme}:`, err);
	}
};

onMounted(async () => {
	try {
		const [state, available] = await Promise.all([getCursorState(), getCursorThemes<string[]>()]);
		appliedTheme.value = selectedTheme.value = state.theme;
		appliedSize.value = selectedSize.value = state.size;

		themes.value = Array.isArray(available) && available.length ? [...available] : ['Adwaita'];
		if (!themes.value.includes(state.theme)) {
			themes.value.unshift(state.theme);
		}
		await Promise.all(themes.value.map(loadPreview));
	} catch (err) {
		error.value = t('views.appearanceCursor.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const apply = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';
	try {
		await applyCursor(selectedTheme.value, selectedSize.value);
		appliedTheme.value = selectedTheme.value;
		appliedSize.value = selectedSize.value;
		successMessage.value = t('views.appearanceCursor.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceCursor.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="@container flex min-h-full flex-col gap-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.appearance')"
			:title="t('views.appearanceCursor.title')"
			:description="t('views.appearanceCursor.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving || !isChanged"
					@click="apply"
				>
					{{ saving ? t('common.saving') : t('views.appearanceCursor.apply') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.appearanceCursor.loading')" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<ConfigSection :title="t('views.appearanceCursor.theme')">
				<div class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]" role="radiogroup" :aria-label="t('views.appearanceCursor.theme')">
					<button
						v-for="theme in themes"
						:key="theme"
						type="button"
						role="radio"
						:aria-checked="selectedTheme === theme"
						:data-theme-name="theme"
						class="flex flex-col gap-3 rounded-corner-m border-2 p-4 text-left transition-all duration-200 hover:bg-ui-surface/50"
						:class="selectedTheme === theme ? 'border-primary bg-primary/10' : 'border-ui-border bg-ui-surface/30'"
						@click="selectedTheme = theme"
					>
						<span class="flex min-h-8 items-center justify-center gap-2">
							<img
								v-for="(image, index) in previews.get(theme)?.images ?? []"
								:key="`${theme}-${index}`"
								:src="image"
								alt=""
								class="h-8 w-8 object-contain"
							/>
							<span
								v-if="!previews.get(theme)?.images.length"
								class="text-xs text-tx-muted"
							>
								{{ t('views.appearanceCursor.noPreview') }}
							</span>
						</span>
						<span class="truncate text-center text-sm font-medium text-tx-main">{{ theme }}</span>
						<span v-if="selectedTheme === theme" class="text-center text-xs font-medium text-primary">
							✓ {{ t('views.appearanceCursor.selected') }}
						</span>
					</button>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearanceCursor.size')">
				<FormGroup :label="t('views.appearanceCursor.size')" html-for="cursor-size">
					<SelectField
						v-bind="{ id: 'cursor-size' }"
						:model-value="String(selectedSize)"
						:options="sizeOptions"
						@update:model-value="selectedSize = Number($event)"
					/>
				</FormGroup>
			</ConfigSection>

			<ConfigSection :title="t('views.appearanceCursor.info')">
				<p class="text-sm text-tx-muted">{{ t('views.appearanceCursor.infoApply') }}</p>
				<p class="mt-2 text-sm text-tx-muted">
					{{ t('views.appearanceCursor.infoPaths') }} <code class="text-xs">/usr/share/icons</code>,
					<code class="text-xs">~/.local/share/icons</code> {{ t('views.appearanceCursor.infoPathsSeparator') }}
					<code class="text-xs">~/.icons</code>
				</p>
			</ConfigSection>
		</div>
	</div>
</template>
