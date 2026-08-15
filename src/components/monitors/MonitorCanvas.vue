<script setup lang="ts">
import { computed, type Ref, ref } from 'vue';

export interface CanvasMonitor {
	name: string;
	/** Logical size — what the screen occupies in the layout, scale already applied. */
	width: number;
	height: number;
	x: number;
	y: number;
	label: string;
}

interface Props {
	monitors: CanvasMonitor[];
	primaryName?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
	positionChange: [name: string, x: number, y: number];
}>();

const PADDING = 30;
const MAX_RECT = 200;
/** In logical pixels: how close an edge has to come before it clicks into place. */
const SNAP = 120;

const dragging: Ref<{
	name: string;
	startMX: number;
	startMY: number;
	origX: number;
	origY: number;
} | null> = ref(null);

const snapLines: Ref<{ x1: number; y1: number; x2: number; y2: number }[]> = ref([]);

const bbox = computed(() => {
	if (props.monitors.length === 0) return { minX: 0, minY: 0, w: 1920, h: 1080 };
	const minX = Math.min(...props.monitors.map((m) => m.x));
	const minY = Math.min(...props.monitors.map((m) => m.y));
	const maxX = Math.max(...props.monitors.map((m) => m.x + m.width));
	const maxY = Math.max(...props.monitors.map((m) => m.y + m.height));
	return { minX, minY, w: maxX - minX, h: maxY - minY };
});

/** One scale for the whole layout, so the rectangles keep their real proportions. */
const viewScale = computed(() => {
	const { w, h } = bbox.value;
	if (w <= 0 || h <= 0) return 0.1;
	return Math.min((MAX_RECT * 2.4) / w, (MAX_RECT * 1.2) / h);
});

function toCanvas(m: { x: number; y: number; width: number; height: number }) {
	const s = viewScale.value;
	return {
		x: PADDING + (m.x - bbox.value.minX) * s,
		y: PADDING + (m.y - bbox.value.minY) * s,
		w: m.width * s,
		h: m.height * s,
	};
}

function monitorStyle(m: CanvasMonitor) {
	const c = toCanvas(m);
	return {
		width: `${c.w}px`,
		height: `${c.h}px`,
		transform: `translate(${c.x}px, ${c.y}px)`,
		zIndex: dragging.value?.name === m.name ? 10 : 1,
	};
}

const canvasDim = computed(() => {
	const s = viewScale.value;
	return {
		w: Math.max(300, bbox.value.w * s + PADDING * 2),
		h: Math.max(200, bbox.value.h * s + PADDING * 2),
	};
});

/**
 * Sticks the dragged screen to an edge of another one.
 *
 * Snapping is not decoration here: two screens that do not share an edge are
 * two screens the pointer cannot travel between. The snap targets are the
 * neighbours' edges *and* their aligned starts, so the usual arrangements —
 * side by side, stacked, tops flush — all land exactly adjacent.
 */
function computeSnap(dragName: string, rawX: number, rawY: number) {
	const me = props.monitors.find((m) => m.name === dragName);
	const others = props.monitors.filter((m) => m.name !== dragName);
	const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

	if (!me || others.length === 0) return { x: rawX, y: rawY, lines };

	let x = rawX;
	let y = rawY;
	let bestX: { value: number; distance: number } | null = null;
	let bestY: { value: number; distance: number } | null = null;

	const consider = (
		best: { value: number; distance: number } | null,
		candidate: number,
		from: number
	) => {
		const distance = Math.abs(candidate - from);
		if (distance > SNAP) return best;
		return !best || distance < best.distance ? { value: candidate, distance } : best;
	};

	for (const o of others) {
		// Sitting against the left or right edge, or lined up with it.
		bestX = consider(bestX, o.x + o.width, x);
		bestX = consider(bestX, o.x - me.width, x);
		bestX = consider(bestX, o.x, x);
		bestX = consider(bestX, o.x + o.width - me.width, x);

		bestY = consider(bestY, o.y + o.height, y);
		bestY = consider(bestY, o.y - me.height, y);
		bestY = consider(bestY, o.y, y);
		bestY = consider(bestY, o.y + o.height - me.height, y);
	}

	if (bestX) x = bestX.value;
	if (bestY) y = bestY.value;

	// Never leave it floating diagonally: one axis has to be a real edge join.
	const joinsHorizontally = others.some((o) => x === o.x + o.width || x + me.width === o.x);
	const joinsVertically = others.some((o) => y === o.y + o.height || y + me.height === o.y);

	if (!joinsHorizontally && !joinsVertically) {
		const nearest = others.reduce((closest, o) =>
			Math.hypot(o.x - x, o.y - y) < Math.hypot(closest.x - x, closest.y - y) ? o : closest
		);
		// Put it on whichever side of the nearest screen it is already leaning.
		x =
			x + me.width / 2 < nearest.x + nearest.width / 2
				? nearest.x - me.width
				: nearest.x + nearest.width;
		y = nearest.y;
	}

	const c = toCanvas({ x, y, width: me.width, height: me.height });
	lines.push({ x1: c.x, y1: 0, x2: c.x, y2: canvasDim.value.h });
	lines.push({ x1: 0, y1: c.y, x2: canvasDim.value.w, y2: c.y });

	return { x: Math.round(x), y: Math.round(y), lines };
}

function onPointerDown(e: PointerEvent, m: CanvasMonitor) {
	dragging.value = {
		name: m.name,
		startMX: e.clientX,
		startMY: e.clientY,
		origX: m.x,
		origY: m.y,
	};
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
	if (!dragging.value) return;
	const s = viewScale.value;
	const x = dragging.value.origX + (e.clientX - dragging.value.startMX) / s;
	const y = dragging.value.origY + (e.clientY - dragging.value.startMY) / s;

	const result = computeSnap(dragging.value.name, x, y);
	snapLines.value = result.lines;
	emit('positionChange', dragging.value.name, result.x, result.y);
}

function onPointerUp() {
	dragging.value = null;
	snapLines.value = [];
}
</script>

<template>
	<div
		class="relative overflow-auto rounded-corner border border-ui-border bg-ui-bg/50"
		style="width: 100%; height: 320px; touch-action: none"
		@pointermove="onPointerMove"
		@pointerup="onPointerUp"
		@pointercancel="onPointerUp"
	>
		<div class="relative" :style="{ width: canvasDim.w + 'px', height: canvasDim.h + 'px' }">
			<svg class="pointer-events-none absolute inset-0 h-full w-full" style="overflow: visible">
				<line
					v-for="(l, i) in snapLines"
					:key="i"
					:x1="l.x1"
					:y1="l.y1"
					:x2="l.x2"
					:y2="l.y2"
					stroke="var(--color-primary, #0084ff)"
					stroke-width="2"
					stroke-dasharray="6 3"
					style="opacity: 0.6"
				/>
			</svg>

			<div
				v-for="m in props.monitors"
				:key="m.name"
				class="absolute flex cursor-grab select-none flex-col items-center justify-center overflow-hidden rounded-lg border-2 text-center transition-shadow active:cursor-grabbing"
				:class="
					dragging?.name === m.name
						? 'border-primary shadow-lg shadow-primary/20'
						: m.name === props.primaryName
							? 'border-accent'
							: 'border-ui-border hover:border-primary/50'
				"
				:style="{ ...monitorStyle(m), background: 'var(--color-ui-surface)' }"
				@pointerdown="(e) => onPointerDown(e, m)"
			>
				<span class="px-1 text-xs font-semibold leading-tight">{{ m.name }}</span>
				<span class="mt-0.5 px-1 text-[10px] leading-tight text-tx-muted">{{ m.label }}</span>
			</div>
		</div>
	</div>
</template>
