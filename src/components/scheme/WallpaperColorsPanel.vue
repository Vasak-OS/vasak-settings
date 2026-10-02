<script setup lang="ts">
/**
 * «Seguir al fondo» en Apariencia: el interruptor, el recálculo a mano y la
 * vista previa del fondo con los colores que se sacaron de él marcados encima,
 * cada uno donde está en la imagen.
 *
 * No calcula ni guarda nada: emite, y la vista lo pasa a `useWallpaperColors`.
 *
 * Responsive por contenedor: angosto, la vista previa va arriba de la lista de
 * colores; con lugar, al lado.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, AlertMessage, SwitchRow } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { WallpaperColorsError } from '@/composables/useWallpaperColors';
import type { PaletteColor } from '@/utils/wallpaper-palette';

interface Props {
	follow: boolean;
	/** El fondo actual; sin fondo no hay de dónde sacar colores. */
	wallpaperPath: string;
	/** La miniatura del fondo, ya convertida a una dirección que el WebView carga. */
	thumbnail: string;
	palette: readonly PaletteColor[];
	accentSource: PaletteColor | null;
	busy?: boolean;
	error?: WallpaperColorsError;
}

const props = withDefaults(defineProps<Props>(), { busy: false, error: null });
const emit = defineEmits<{ 'update:follow': [value: boolean]; regenerate: [] }>();

const { t } = useI18n();

/** El tamaño de cada punto sigue a cuánto ocupa el color en la imagen. */
const dotSize = (color: PaletteColor) =>
	`${Math.round(14 + Math.min(color.population, 0.6) * 20)}px`;

const dots = computed(() =>
	props.palette.map((color) => ({
		color,
		isAccent: props.accentSource?.hex === color.hex,
		style: {
			left: inside(color.x),
			top: inside(color.y),
			width: dotSize(color),
			height: dotSize(color),
			backgroundColor: color.hex,
		},
	}))
);

/**
 * Un color que está pegado al borde de la imagen —un cielo arriba de todo—
 * tendría medio punto afuera del recuadro: se lo acerca un poco al centro.
 */
const inside = (value: number) => `${(Math.min(0.92, Math.max(0.08, value)) * 100).toFixed(1)}%`;

const percent = (value: number) => `${Math.round(value * 100)} %`;

const errorText = computed(() => {
	if (props.error === 'unreadable') return t('views.appearanceTheme.wallpaperColors.unreadable');
	if (props.error === 'save') return t('views.appearanceTheme.wallpaperColors.saveError');
	return '';
});
</script>

<template>
	<section class="@container flex flex-col gap-3" aria-labelledby="wallpaper-colors-title" data-wallpaper-colors>
		<h5 id="wallpaper-colors-title" class="text-sm font-medium text-tx-main">
			{{ t('views.appearanceTheme.wallpaperColors.title') }}
		</h5>

		<SwitchRow
			:model-value="follow"
			:label="t('views.appearanceTheme.wallpaperColors.follow')"
			:description="t('views.appearanceTheme.wallpaperColors.followHint')"
			:disabled="!wallpaperPath"
			@update:model-value="emit('update:follow', $event)"
		/>

		<AlertMessage v-if="errorText" tone="warning">{{ errorText }}</AlertMessage>
		<AlertMessage v-else-if="!wallpaperPath" tone="info">{{ t('views.appearanceTheme.wallpaperColors.noWallpaper') }}</AlertMessage>

		<div v-if="wallpaperPath" class="grid gap-3 @lg:grid-cols-[minmax(0,14rem)_1fr]">
			<div
				class="relative aspect-video w-full max-w-sm overflow-hidden rounded-corner-m border border-ui-border bg-ui-surface/70"
				data-wallpaper-preview
			>
				<img
					v-if="thumbnail"
					:src="thumbnail"
					:alt="t('views.appearanceTheme.wallpaperColors.previewAlt')"
					class="pointer-events-none absolute inset-0 h-full w-full object-cover"
				/>
				<span
					v-for="dot in dots"
					:key="dot.color.hex"
					:class="[
						'absolute -translate-x-1/2 -translate-y-1/2 rounded-corner-full border-2 border-ui-bg shadow-surface-s',
						dot.isAccent ? 'ring-2 ring-primary' : '',
					]"
					:style="dot.style"
					:data-palette-dot="dot.color.hex"
					aria-hidden="true"
				/>
			</div>

			<div class="flex min-w-0 flex-col gap-2">
				<ul v-if="palette.length" class="flex flex-col gap-1" :aria-label="t('views.appearanceTheme.wallpaperColors.paletteLabel')">
					<li v-for="dot in dots" :key="`row-${dot.color.hex}`" class="flex min-w-0 items-center gap-2 text-xs">
						<span class="h-4 w-4 shrink-0 rounded-corner-full border border-ui-border" :style="{ backgroundColor: dot.color.hex }" aria-hidden="true" />
						<span class="font-mono tabular-nums text-tx-main">{{ dot.color.hex }}</span>
						<span class="tabular-nums text-tx-muted">{{ percent(dot.color.population) }}</span>
						<span v-if="dot.isAccent" class="truncate text-tx-muted">· {{ t('views.appearanceTheme.wallpaperColors.accentFrom') }}</span>
					</li>
				</ul>
				<ActionButton
					v-bind="{ 'data-regenerate': '' }"
					size="sm"
					variant="secondary"
					icon="view-refresh"
					icon-type="symbol"
					:label="t('views.appearanceTheme.wallpaperColors.regenerate')"
					:loading="busy"
					:disabled="busy"
					custom-class="self-start"
					@click="emit('regenerate')"
				/>
			</div>
		</div>
	</section>
</template>
