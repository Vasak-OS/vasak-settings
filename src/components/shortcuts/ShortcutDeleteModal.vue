<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import ModalDialog from '@/components/ui/ModalDialog.vue';
import { formatShortcutLabel } from '@/services/shortcuts.service';
import type { ShortcutRule } from '@/types/shortcuts';

interface Props {
	open: boolean;
	shortcut: ShortcutRule | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	'update:open': [boolean];
	confirm: [];
	cancel: [];
}>();

const { t } = useI18n();

const handleCancel = () => {
	emit('cancel');
	emit('update:open', false);
};
</script>

<template>
	<ModalDialog
		:open="open"
		:title="t('views.shortcuts.deleteModal.title')"
		:description="t('views.shortcuts.deleteModal.description')"
		max-width-class="max-w-xl"
		@close="handleCancel"
	>
		<div class="space-y-4">
			<div class="rounded-corner border border-status-danger/20 bg-status-danger/10 p-3 text-sm text-tx-primary">
				<p class="font-medium">{{ t('views.shortcuts.deleteModal.question') }}</p>
				<p class="mt-1 text-tx-muted">
					{{ t('views.shortcuts.deleteModal.hint') }}
				</p>
			</div>

			<div v-if="props.shortcut" class="rounded-corner border border-ui-border bg-ui-surface/50 p-3 text-sm">
				<p class="font-medium text-tx-primary">{{ formatShortcutLabel(props.shortcut) }}</p>
				<p class="mt-1 text-tx-muted">{{ t('views.shortcuts.deleteModal.actionLabel') }} {{ props.shortcut.action }}</p>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-primary transition-colors hover:bg-ui-surface"
					@click="handleCancel"
				>
					{{ t('common.cancel') }}
				</button>
				<button
					type="button"
					class="rounded-corner border border-status-danger/30 bg-status-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
					@click="emit('confirm')"
				>
					{{ t('common.delete') }}
				</button>
			</div>
		</div>
	</ModalDialog>
</template>
