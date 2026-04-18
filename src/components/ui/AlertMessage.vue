<script setup lang="ts">
interface Props {
	message: string;
	tone?: 'error' | 'success' | 'warning' | 'info';
}

const props = withDefaults(defineProps<Props>(), {
	tone: 'info',
});

const toneClasses = {
	error: 'border-status-error/40 bg-status-error/10 text-status-error',
	success: 'border-status-success/40 bg-status-success/10 text-status-success',
	warning: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
	info: 'border-ui-border bg-ui-surface/40 text-tx-primary',
};
</script>

<template>
	<div class="rounded-corner border p-4 text-sm" :class="toneClasses[props.tone]">
		{{ message }}
	</div>
</template>
