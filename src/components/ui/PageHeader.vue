<script setup lang="ts">
interface Props {
	section: string;
	title: string;
	description: string;
}

defineProps<Props>();
</script>

<template>
	<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">{{ section }}</p>
			<h1 class="text-2xl font-semibold">{{ title }}</h1>
			<p class="text-sm text-tx-muted">{{ description }}</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<slot name="actions" />
		</div>
	</header>
</template>
