<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';

const { t } = useI18n();

interface Props {
	open: boolean;
	title: string;
	description?: string;
	maxWidthClass?: string;
}

withDefaults(defineProps<Props>(), {
	description: '',
	maxWidthClass: 'max-w-2xl',
});

defineEmits<{
	close: [];
}>();
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" @click.self="$emit('close')">
		<div class="w-full rounded-corner border border-ui-border bg-ui-bg p-4 shadow-xl" :class="maxWidthClass">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-tx-primary">{{ title }}</h2>
					<p v-if="description" class="mt-1 text-sm text-tx-muted">{{ description }}</p>
				</div>

				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface hover:text-tx-primary"
					@click="$emit('close')"
				>
					{{ t('common.close') }}
				</button>
			</div>

			<div class="mt-4">
				<slot />
			</div>
		</div>
	</div>
</template>
