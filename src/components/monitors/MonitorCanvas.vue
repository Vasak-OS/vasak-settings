<script setup lang="ts">
import { computed, type Ref, ref } from 'vue';

export interface CanvasMonitor {
	name: string;
	width: number;
	height: number;
	x: number;
	y: number;
}

interface Props {
	monitors: CanvasMonitor[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
	positionChange: [name: string, x: number, y: number];
}>();

const PADDING = 30;
const MAX_RECT = 160;
const SNAP = 10;

const dragging: Ref<{
	name: string;
	startMX: number;
	startMY: number;
	origX: number;
	origY: number;
} | null> = ref(null);

const snapLines: Ref<{ x1: number; y1: number; x2: number; y2: number }[]> = ref([]);
const zoom = ref(1);

const viewScale = computed(() => {
	if (props.monitors.length === 0) return 1;
	let maxDim = 0;
	for (const m of props.monitors) {
		maxDim = Math.max(maxDim, m.width, m.height);
	}
	return (MAX_RECT / maxDim) * zoom.value;
});

const bbox = computed(() => {
	if (props.monitors.length === 0) return { minX: 0, minY: 0, w: 100, h: 100 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const m of props.monitors) {
		if (m.x < minX) minX = m.x;
		if (m.y < minY) minY = m.y;
		const rx = m.x + m.width;
		const ry = m.y + m.height;
		if (rx > maxX) maxX = rx;
		if (ry > maxY) maxY = ry;
	}
	return { minX, minY, w: maxX - minX, h: maxY - minY };
});

function toCanvas(m: CanvasMonitor) {
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

function snapValue(val: number, targets: number[], threshold: number): number | null {
	for (const t of targets) {
		if (Math.abs(val - t) <= threshold) return t;
	}
	return null;
}

function computeSnap(
	dragName: string,
	origX: number,
	origY: number,
	dx: number,
	dy: number
): { x: number; y: number; lines: { x1: number; y1: number; x2: number; y2: number }[] } {
	let newX = Math.round(origX + dx);
	let newY = Math.round(origY + dy);

	const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

	const myMonitor = props.monitors.find((m) => m.name === dragName);
	if (!myMonitor) return { x: newX, y: newY, lines };
	const myW = myMonitor.width;
	const myH = myMonitor.height;

	const others = props.monitors.filter((m) => m.name !== dragName);
	if (others.length === 0) return { x: newX, y: newY, lines };

	const edgesX: number[] = [];
	const edgesY: number[] = [];
	const centersX: number[] = [];
	const centersY: number[] = [];
	for (const o of others) {
		edgesX.push(o.x, o.x + o.width);
		edgesY.push(o.y, o.y + o.height);
		centersX.push(o.x + o.width / 2);
		centersY.push(o.y + o.height / 2);
	}

	const cw = canvasDim.value.w;
	const ch = canvasDim.value.h;

	const vLine = (vx: number) => lines.push({ x1: vx, y1: 0, x2: vx, y2: ch });
	const hLine = (hy: number) => lines.push({ x1: 0, y1: hy, x2: cw, y2: hy });

	let snapped = false;

	const snapL = snapValue(newX, edgesX, SNAP);
	if (snapL !== null) {
		newX = snapL;
		snapped = true;
		vLine(toCanvas({ ...myMonitor, x: snapL, y: 0 }).x);
	}

	const snapR = snapValue(newX + myW, edgesX, SNAP);
	if (snapR !== null) {
		newX = snapR - myW;
		snapped = true;
		vLine(toCanvas({ ...myMonitor, x: newX + myW, y: 0 }).x);
	}

	const snapT = snapValue(newY, edgesY, SNAP);
	if (snapT !== null) {
		newY = snapT;
		snapped = true;
		hLine(toCanvas({ ...myMonitor, x: 0, y: snapT }).y);
	}

	const snapB = snapValue(newY + myH, edgesY, SNAP);
	if (snapB !== null) {
		newY = snapB - myH;
		snapped = true;
		hLine(toCanvas({ ...myMonitor, x: 0, y: newY + myH }).y);
	}

	if (!snapped) {
		const cx = snapValue(newX + myW / 2, centersX, SNAP);
		if (cx !== null) {
			newX = Math.round(cx - myW / 2);
			vLine(toCanvas({ ...myMonitor, x: newX + myW / 2, y: 0 }).x);
		}

		const cy = snapValue(newY + myH / 2, centersY, SNAP);
		if (cy !== null) {
			newY = Math.round(cy - myH / 2);
			hLine(toCanvas({ ...myMonitor, x: 0, y: newY + myH / 2 }).y);
		}
	}

	return { x: newX, y: newY, lines };
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
	const dx = (e.clientX - dragging.value.startMX) / s;
	const dy = (e.clientY - dragging.value.startMY) / s;

	const result = computeSnap(
		dragging.value.name,
		dragging.value.origX,
		dragging.value.origY,
		dx,
		dy
	);

	snapLines.value = result.lines;
	emit('positionChange', dragging.value.name, result.x, result.y);
}

function onPointerUp() {
	dragging.value = null;
	snapLines.value = [];
}

function onWheel(e: WheelEvent) {
	e.preventDefault();
	zoom.value = Math.max(0.2, Math.min(3, zoom.value + (e.deltaY > 0 ? -0.1 : 0.1)));
}
</script>

<template>
	<div
		class="relative overflow-auto rounded-corner border border-ui-border bg-ui-bg/50"
		style="width: 100%; height: 320px; touch-action: none"
		@wheel.prevent="onWheel"
		@pointermove="onPointerMove"
		@pointerup="onPointerUp"
		@pointercancel="onPointerUp"
	>
		<div
			class="relative"
			:style="{ width: canvasDim.w + 'px', height: canvasDim.h + 'px' }"
		>
			<svg class="pointer-events-none absolute inset-0 h-full w-full" style="opacity: 0.1">
				<defs>
					<pattern id="canvas-grid" :width="20 * zoom" :height="20 * zoom" patternUnits="userSpaceOnUse">
						<path d="M 0 0 L 0 20 M 0 0 L 20 0" fill="none" stroke="currentColor" stroke-width="0.5" />
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#canvas-grid)" />
			</svg>

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
					style="opacity: 0.7"
				/>
			</svg>

			<div
				v-for="m in props.monitors"
				:key="m.name"
				class="absolute flex cursor-grab select-none flex-col items-center justify-center rounded-lg border-2 text-center transition-shadow active:cursor-grabbing"
				:class="dragging?.name === m.name ? 'border-primary shadow-lg shadow-primary/20' : 'border-ui-border hover:border-primary/50'"
				:style="{ ...monitorStyle(m), background: 'var(--color-ui-surface)' }"
				@pointerdown="(e) => onPointerDown(e, m)"
			>
				<span class="text-xs font-semibold leading-tight">{{ m.name }}</span>
				<span class="mt-0.5 text-[10px] leading-tight text-tx-muted">{{ m.width }}x{{ m.height }}</span>
			</div>
		</div>

		<div
			class="pointer-events-none absolute bottom-2 right-2 rounded bg-ui-bg/80 px-2 py-1 text-[10px] text-tx-muted"
		>
			{{ Math.round(zoom * 100) }}%
		</div>
	</div>
</template>
