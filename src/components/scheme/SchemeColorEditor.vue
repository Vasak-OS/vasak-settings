<script setup lang="ts">
/**
 * El editor de todos los colores del esquema «Personalizado».
 *
 * No guarda nada: emite cada cambio como un parche parcial sobre una variante,
 * y quien lo usa lo pasa a `updateColors` de `useCustomScheme`, que es el único
 * lugar que escribe el esquema.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, nextTick, ref } from 'vue';
import ColorSwatch from '@/components/scheme/ColorSwatch.vue';
import {
	ANSI_COLOR_NAMES,
	formatContrast,
	MINIMUM_TEXT_CONTRAST,
	measureContrast,
	SCHEME_VARIANTS,
} from '@/tools/custom-scheme';
import type {
	SchemeColorPatch,
	SchemeFile,
	SchemeVariantColors,
	SchemeVariantName,
} from '@/types/scheme';

interface Props {
	scheme: SchemeFile;
	/** La variante que se abre primero: la que está usando el escritorio. */
	initialVariant?: SchemeVariantName;
}

const props = withDefaults(defineProps<Props>(), { initialVariant: 'dark' });
const emit = defineEmits<{ update: [variant: SchemeVariantName, patch: SchemeColorPatch] }>();

const { t } = useI18n();

const activeVariant = ref<SchemeVariantName>(props.initialVariant);
const colors = computed<SchemeVariantColors>(() => props.scheme.colors[activeVariant.value]);

type ColorField = {
	key: string;
	label: string;
	value: string;
	patch: (value: string) => SchemeColorPatch;
};

const uiFields = computed<ColorField[]>(() => {
	const ui = colors.value.ui;
	const fields: ColorField[] = [
		{
			key: 'primary',
			label: t('views.appearanceTheme.colors.primary'),
			value: ui.color.primary,
			patch: (value) => ({ ui: { color: { primary: value } } }),
		},
		{
			key: 'secondary',
			label: t('views.appearanceTheme.colors.secondary'),
			value: ui.color.secondary,
			patch: (value) => ({ ui: { color: { secondary: value } } }),
		},
		{
			key: 'text-main',
			label: t('views.appearanceTheme.colors.text'),
			value: ui.text.main,
			patch: (value) => ({ ui: { text: { main: value } } }),
		},
		{
			key: 'text-muted',
			label: t('views.appearanceTheme.colors.textMuted'),
			value: ui.text.muted,
			patch: (value) => ({ ui: { text: { muted: value } } }),
		},
		{
			key: 'text-on-primary',
			label: t('views.appearanceTheme.colors.onPrimary'),
			value: ui.text['on-primary'],
			patch: (value) => ({ ui: { text: { 'on-primary': value } } }),
		},
	];

	// Sólo si el esquema lo trae: agregarlo a uno que no lo tiene sería
	// inventarle un color que su autor no eligió.
	const onSecondary = ui.text['on-secondary'];
	if (typeof onSecondary === 'string') {
		fields.push({
			key: 'text-on-secondary',
			label: t('views.appearanceTheme.colors.onSecondary'),
			value: onSecondary,
			patch: (value) => ({ ui: { text: { 'on-secondary': value } } }),
		});
	}

	fields.push(
		{
			key: 'background',
			label: t('views.appearanceTheme.colors.background'),
			value: ui.background,
			patch: (value) => ({ ui: { background: value } }),
		},
		{
			key: 'surface',
			label: t('views.appearanceTheme.colors.surface'),
			value: ui.surface,
			patch: (value) => ({ ui: { surface: value } }),
		},
		{
			key: 'border',
			label: t('views.appearanceTheme.colors.border'),
			value: ui.border,
			patch: (value) => ({ ui: { border: value } }),
		}
	);
	return fields;
});

const terminalFields = computed<ColorField[]>(() => {
	const terminal = colors.value.terminal;
	return [
		{
			key: 'terminal-foreground',
			label: t('views.appearanceTheme.colors.terminalForeground'),
			value: terminal.foreground,
			patch: (value) => ({ terminal: { foreground: value } }),
		},
		{
			key: 'terminal-background',
			label: t('views.appearanceTheme.colors.terminalBackground'),
			value: terminal.background,
			patch: (value) => ({ terminal: { background: value } }),
		},
		{
			key: 'terminal-cursor',
			label: t('views.appearanceTheme.colors.terminalCursor'),
			value: terminal.cursor,
			patch: (value) => ({ terminal: { cursor: value } }),
		},
	];
});

const ansiFields = computed<ColorField[]>(() =>
	ANSI_COLOR_NAMES.map((name) => ({
		key: `ansi-${name}`,
		label: t(`views.appearanceTheme.ansi.${name}`),
		value: colors.value.terminal.ansi[name],
		patch: (value: string) => ({ terminal: { ansi: { [name]: value } } }),
	}))
);

const contrast = computed(() =>
	measureContrast(colors.value).map((result) => ({
		...result,
		label: t(`views.appearanceTheme.contrast.${result.id}`),
		formatted: formatContrast(result.ratio),
	}))
);

const contrastPreview = (id: string) => {
	const ui = colors.value.ui;
	switch (id) {
		case 'mainOnBackground':
			return { color: ui.text.main, backgroundColor: ui.background };
		case 'mutedOnBackground':
			return { color: ui.text.muted, backgroundColor: ui.background };
		case 'mainOnSurface':
			return { color: ui.text.main, backgroundColor: ui.surface };
		case 'onPrimary':
			return { color: ui.text['on-primary'], backgroundColor: ui.color.primary };
		default:
			return { color: ui.text['on-secondary'] as string, backgroundColor: ui.color.secondary };
	}
};

const fieldId = (key: string) => `scheme-${activeVariant.value}-${key}`;

const onField = (field: ColorField, value: string) => {
	emit('update', activeVariant.value, field.patch(value));
};

// Pestañas con el patrón de WAI-ARIA: Tab entra a la elegida, las flechas
// cambian de una a otra.
const tabRefs = ref<HTMLButtonElement[]>([]);

const onTabKeydown = async (event: KeyboardEvent, index: number) => {
	let next = index;
	if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1;
	else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1;
	else if (event.key === 'Home') next = 0;
	else if (event.key === 'End') next = SCHEME_VARIANTS.length - 1;
	else return;

	event.preventDefault();
	const count = SCHEME_VARIANTS.length;
	const wrapped = (next + count) % count;
	activeVariant.value = SCHEME_VARIANTS[wrapped];
	await nextTick();
	tabRefs.value[wrapped]?.focus();
};
</script>

<template>
	<div class="flex flex-col gap-4">
		<div
			role="tablist"
			:aria-label="t('views.appearanceTheme.custom.variants')"
			class="flex w-fit gap-1 rounded-corner border border-ui-border bg-ui-surface/70 p-1"
		>
			<button
				v-for="(variant, index) in SCHEME_VARIANTS"
				:id="`scheme-tab-${variant}`"
				:key="variant"
				ref="tabRefs"
				type="button"
				role="tab"
				:aria-selected="activeVariant === variant ? 'true' : 'false'"
				:aria-controls="`scheme-panel-${variant}`"
				:tabindex="activeVariant === variant ? 0 : -1"
				:class="[
					'rounded-corner px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
					activeVariant === variant ? 'bg-ui-bg/80 text-tx-main ring-2 ring-inset ring-primary' : 'text-tx-muted hover:bg-ui-surface',
				]"
				@click="activeVariant = variant"
				@keydown="onTabKeydown($event, index)"
			>
				{{ t(`views.appearanceTheme.${variant}`) }}
			</button>
		</div>

		<div
			:id="`scheme-panel-${activeVariant}`"
			role="tabpanel"
			:aria-labelledby="`scheme-tab-${activeVariant}`"
			class="flex flex-col gap-4"
		>
			<div class="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
				<fieldset class="min-w-0">
					<legend class="mb-2 text-sm font-medium text-tx-main">{{ t('views.appearanceTheme.custom.interface') }}</legend>
					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						<ColorSwatch
							v-for="field in uiFields"
							:id="fieldId(field.key)"
							:key="field.key"
							:label="field.label"
							:model-value="field.value"
							:invalid-message="t('views.appearanceTheme.custom.invalidHex')"
							@update:model-value="onField(field, $event)"
						/>
					</div>
				</fieldset>

				<section class="min-w-0" aria-labelledby="scheme-contrast-title">
					<h5 id="scheme-contrast-title" class="mb-2 text-sm font-medium text-tx-main">
						{{ t('views.appearanceTheme.custom.contrastTitle') }}
					</h5>
					<ul class="flex flex-col gap-2">
						<li
							v-for="item in contrast"
							:key="item.id"
							class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-2"
							:data-contrast="item.id"
						>
							<span
								class="flex h-8 w-10 shrink-0 items-center justify-center rounded-corner border border-ui-border text-sm font-semibold"
								:style="contrastPreview(item.id)"
								aria-hidden="true"
							>Aa</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-xs text-tx-muted">{{ item.label }}</p>
								<p class="font-mono text-sm tabular-nums text-tx-main">{{ item.formatted }}</p>
							</div>
							<span
								v-if="!item.passes"
								class="rounded-full border border-status-warning px-2 py-0.5 text-[11px] text-status-warning"
								data-contrast-warning
							>
								{{ t('views.appearanceTheme.custom.lowContrast').replace('{0}', String(MINIMUM_TEXT_CONTRAST)) }}
							</span>
						</li>
					</ul>
				</section>
			</div>

			<details class="rounded-corner border border-ui-border bg-ui-surface/70 p-3">
				<summary class="cursor-pointer rounded-corner text-sm font-medium text-tx-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
					{{ t('views.appearanceTheme.custom.terminal') }}
				</summary>
				<div class="mt-3 flex flex-col gap-3">
					<div class="grid gap-2 sm:grid-cols-3">
						<ColorSwatch
							v-for="field in terminalFields"
							:id="fieldId(field.key)"
							:key="field.key"
							:label="field.label"
							:model-value="field.value"
							:invalid-message="t('views.appearanceTheme.custom.invalidHex')"
							@update:model-value="onField(field, $event)"
						/>
					</div>
					<fieldset>
						<legend class="mb-2 text-xs text-tx-muted">{{ t('views.appearanceTheme.custom.ansi') }}</legend>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
							<ColorSwatch
								v-for="field in ansiFields"
								:id="fieldId(field.key)"
								:key="field.key"
								:label="field.label"
								:model-value="field.value"
								:invalid-message="t('views.appearanceTheme.custom.invalidHex')"
								@update:model-value="onField(field, $event)"
							/>
						</div>
					</fieldset>
				</div>
			</details>
		</div>
	</div>
</template>
