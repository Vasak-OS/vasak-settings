<script setup lang="ts">
defineProps<{
	label: string;
	value: number;
}>();

const progressWidth = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
</script>

<template>
	<div>
		<div class="mb-2 flex items-center justify-between text-xs text-tx-muted">
			<span>{{ label }}</span>
			<span>{{ Math.max(0, Math.min(100, value)).toFixed(1) }}%</span>
		</div>
		<div class="h-2 overflow-hidden rounded-corner bg-ui-surface">
			<div
				class="h-full rounded-corner transition-[width] duration-300 bg-linear-to-r from-secondary to-primary"
				:style="{ width: progressWidth(value) }"
			/>
		</div>
	</div>
</template>
