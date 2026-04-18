<script setup lang="ts">
interface Props {
	text: string;
	tone?: 'success' | 'error' | 'neutral';
}

const props = withDefaults(defineProps<Props>(), {
	tone: 'neutral',
});

const toneClasses = {
	success: 'border-status-success/40 bg-status-success/10 text-status-success',
	error: 'border-status-error/40 bg-status-error/10 text-status-error',
	neutral: 'border-ui-border bg-ui-surface/40 text-tx-primary',
};
</script>

<template>
	<span class="rounded-corner border px-3 py-1 text-xs font-semibold" :class="toneClasses[props.tone]">
		{{ text }}
	</span>
</template>
