<script setup lang="ts">
defineProps<{
	label: string;
	value: string;
	hint?: string;
}>();
</script>

<template>
	<div class="rounded-corner border border-ui-border bg-ui-surface/40 p-4">
		<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ label }}</p>
		<p class="mt-2 text-2xl font-semibold">{{ value }}</p>
		<p v-if="hint" class="mt-1 truncate text-sm text-tx-muted">{{ hint }}</p>
	</div>
</template>
