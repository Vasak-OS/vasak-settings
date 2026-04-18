<script setup lang="ts">
interface Props {
	message: string;
	padding?: 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
	padding: 'md',
});
</script>

<template>
	<div
		class="grid place-items-center rounded-corner border border-dashed border-ui-border bg-ui-surface/20 text-sm text-tx-muted"
		:class="props.padding === 'lg' ? 'p-6' : 'py-6 px-4'"
	>
		{{ message }}
	</div>
</template>
