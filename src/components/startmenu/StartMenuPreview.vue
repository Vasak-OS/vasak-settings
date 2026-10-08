<script lang="ts" setup>
/**
 * La vista previa del esqueleto del menú.
 *
 * Es una **ilustración**, no un menú en vivo: dibuja con cajas y barras la forma
 * que va a tener el menú del escritorio según la variante elegida y las opciones
 * encendidas, para que se vea el efecto de cada control sin levantar el menú de
 * verdad. Por eso no usa iconos del tema ni datos reales — son rectángulos que
 * representan apps, lugares y widgets.
 *
 * Se dibuja con los colores del esquema y los radios del sistema, como todo lo
 * demás, y se adapta al ancho que le toque con consultas de contenedor. Lo
 * decorativo lleva `aria-hidden`; el nombre de la variante lo anuncia el
 * `role="img"` de la raíz.
 */
import { computed } from 'vue';
import type {
	MenuDisplayMode,
	MenuSearchPosition,
	MenuVariant,
	MenuWidget,
} from '@/utils/config-values';

const props = withDefaults(
	defineProps<{
		/** El esqueleto a dibujar. */
		variant: MenuVariant;
		/** El widget del hueco, para dibujarlo (o no, si es `none`). */
		widget: MenuWidget;
		showUser: boolean;
		showSessionActions: boolean;
		searchPosition: MenuSearchPosition;
		showPlaces: boolean;
		showFavorites: boolean;
		/** `hero` dibuja la banda de encabezado. */
		hero: boolean;
		/** El nombre de la variante, ya traducido: es el nombre accesible del dibujo. */
		label: string;
		/** El tamaño con que abre el menú: cambia el ancho del marco del dibujo. */
		displayMode?: MenuDisplayMode;
	}>(),
	{ displayMode: 'normal' }
);

/** Un rango corto, para repetir filas o celdas en el dibujo. */
const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

/**
 * El ancho del marco según el modo: `compact` lo encoge y lo centra, `full` lo
 * lleva de borde a borde (el overlay a pantalla completa), `normal` deja el de
 * hoy. Es sólo una pista visual: el tamaño real lo fija el backend del applet.
 */
const frameClass = computed(() => {
	if (props.displayMode === 'compact') return 'mx-auto w-[62%] min-w-[9rem]';
	if (props.displayMode === 'full') return 'w-full';
	return 'mx-auto w-[88%]';
});
</script>

<template>
	<div
		class="@container flex w-full flex-col gap-2"
		role="img"
		:aria-label="label"
		data-testid="start-menu-preview"
		:data-variant="props.variant"
		:data-display-mode="props.displayMode"
	>
		<div
			class="flex flex-col gap-2 rounded-corner-l border border-ui-line bg-ui-shell p-3"
			:class="frameClass"
			aria-hidden="true"
		>
			<!-- Encabezado hero: una banda con el acento, el saludo y el clima. -->
			<div
				v-if="props.hero"
				class="flex items-center justify-between rounded-corner-m bg-primary/15 px-3 py-2"
				data-testid="preview-hero"
			>
				<div class="flex flex-col gap-1">
					<div class="h-2 w-16 rounded-corner-full bg-primary/70"></div>
					<div class="h-1.5 w-10 rounded-corner-full bg-tx-muted/50"></div>
				</div>
				<div class="h-6 w-6 rounded-corner-full bg-primary/40"></div>
			</div>

			<!-- El buscador, arriba del contenido cuando así se pide. -->
			<div
				v-if="props.searchPosition === 'top'"
				class="h-6 rounded-corner-full border border-ui-line bg-ui-surface/70"
				data-testid="preview-search"
			></div>

			<!-- Favoritos como tira, en las variantes que no son la de favoritos. -->
			<div
				v-if="props.showFavorites && props.variant !== 'favorites'"
				class="flex gap-2"
				data-testid="preview-favorites"
			>
				<div
					v-for="i in range(4)"
					:key="`fav-${i}`"
					class="h-6 w-6 rounded-corner-m bg-ui-surface/70 border border-ui-line"
				></div>
			</div>

			<!-- ───────── compacto ───────── -->
			<div v-if="props.variant === 'compact'" class="flex gap-2">
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<div v-for="i in range(5)" :key="`c-${i}`" class="flex items-center gap-2">
						<div class="h-4 w-4 shrink-0 rounded-corner-s bg-ui-surface"></div>
						<div class="h-2 min-w-0 flex-1 rounded-corner-full bg-ui-line"></div>
					</div>
				</div>
				<div class="flex w-20 shrink-0 flex-col gap-2 @2xs:w-24">
					<div
						v-if="props.widget !== 'none'"
						class="flex flex-1 flex-col justify-between rounded-corner-m border border-ui-line bg-ui-surface/70 p-2"
						data-testid="preview-widget"
					>
						<div class="h-2 w-10 rounded-corner-full bg-tx-muted/50"></div>
						<div class="h-4 w-12 rounded-corner-full bg-primary/60"></div>
					</div>
					<div
						v-if="props.showUser"
						class="flex items-center gap-2 rounded-corner-m border border-ui-line bg-ui-surface/70 p-2"
						data-testid="preview-user"
					>
						<div class="h-5 w-5 rounded-corner-full bg-primary/40"></div>
						<div class="h-2 min-w-0 flex-1 rounded-corner-full bg-ui-line"></div>
					</div>
				</div>
			</div>

			<!-- ───────── clásico ───────── -->
			<div v-else-if="props.variant === 'classic'" class="flex gap-2">
				<div
					class="flex w-16 shrink-0 flex-col gap-1.5 rounded-corner-m border border-ui-line bg-ui-surface/70 p-2"
					data-testid="preview-sidebar"
				>
					<template v-if="props.showPlaces">
						<div
							v-for="i in range(3)"
							:key="`p-${i}`"
							class="h-2.5 rounded-corner-full bg-ui-line"
							data-testid="preview-places"
						></div>
					</template>
					<div class="mt-auto h-2.5 rounded-corner-full bg-primary/50"></div>
				</div>
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<div v-for="i in range(5)" :key="`cl-${i}`" class="flex items-center gap-2">
						<div class="h-3.5 w-3.5 shrink-0 rounded-corner-s bg-ui-surface"></div>
						<div class="h-2 min-w-0 flex-1 rounded-corner-full bg-ui-line"></div>
					</div>
				</div>
			</div>

			<!-- ───────── grilla ───────── -->
			<div
				v-else-if="props.variant === 'grid'"
				class="flex flex-col items-center gap-2"
			>
				<div class="grid w-full grid-cols-4 gap-2">
					<div
						v-for="i in range(8)"
						:key="`g-${i}`"
						class="flex aspect-square flex-col items-center justify-center gap-1 rounded-corner-m border border-ui-line bg-ui-surface/70"
						data-testid="preview-tile"
					>
						<div class="h-4 w-4 rounded-corner-s bg-primary/40"></div>
						<div class="h-1.5 w-6 rounded-corner-full bg-tx-muted/40"></div>
					</div>
				</div>
				<div class="flex gap-1.5" data-testid="preview-dots">
					<div
						v-for="i in range(3)"
						:key="`d-${i}`"
						class="h-1.5 w-1.5 rounded-corner-full"
						:class="i === 0 ? 'bg-primary' : 'bg-ui-line'"
					></div>
				</div>
			</div>

			<!-- ───────── favoritos ───────── -->
			<div v-else-if="props.variant === 'favorites'" class="flex gap-2">
				<div class="grid min-w-0 flex-1 grid-cols-3 gap-2">
					<div
						v-for="i in range(6)"
						:key="`f-${i}`"
						class="flex aspect-square flex-col items-center justify-center gap-1 rounded-corner-m border border-ui-line bg-ui-surface/70"
						data-testid="preview-tile"
					>
						<div class="h-4 w-4 rounded-corner-s bg-primary/40"></div>
					</div>
				</div>
				<div
					v-if="props.showPlaces"
					class="flex w-12 shrink-0 flex-col gap-1.5 rounded-corner-m border border-ui-line bg-ui-surface/70 p-2"
					data-testid="preview-places"
				>
					<div v-for="i in range(4)" :key="`fp-${i}`" class="h-2.5 rounded-corner-full bg-ui-line"></div>
				</div>
			</div>

			<!-- ───────── mosaicos ───────── -->
			<div v-else class="grid grid-cols-4 grid-rows-2 gap-2">
				<div
					class="col-span-2 row-span-2 flex flex-col justify-between rounded-corner-m border border-ui-line bg-ui-surface/70 p-2"
					data-testid="preview-tile"
				>
					<div class="h-5 w-5 rounded-corner-s bg-primary/40"></div>
					<div class="h-2 w-16 rounded-corner-full bg-ui-line"></div>
				</div>
				<div
					v-for="i in range(4)"
					:key="`t-${i}`"
					class="flex items-center justify-center rounded-corner-m border border-ui-line bg-ui-surface/70"
					data-testid="preview-tile"
				>
					<div class="h-4 w-4 rounded-corner-s bg-primary/40"></div>
				</div>
			</div>

			<!-- Acciones de sesión: unos pocos botones redondos al pie. -->
			<div
				v-if="props.showSessionActions"
				class="flex justify-end gap-2"
				data-testid="preview-session"
			>
				<div v-for="i in range(3)" :key="`s-${i}`" class="h-4 w-4 rounded-corner-full bg-ui-surface border border-ui-line"></div>
			</div>

			<!-- El buscador abajo, cuando así se pide. -->
			<div
				v-if="props.searchPosition === 'bottom'"
				class="h-6 rounded-corner-full border border-ui-line bg-ui-surface/70"
				data-testid="preview-search"
			></div>
		</div>
	</div>
</template>
