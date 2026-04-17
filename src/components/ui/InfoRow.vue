<script setup lang="ts">
defineProps<{
	label: string;
	value: string;
}>();
</script>

<template>
	<div class="flex items-center justify-between gap-3">
		<span class="text-tx-muted">{{ label }}</span>
		<span class="truncate font-medium">{{ value }}</span>
	</div>
</template>
