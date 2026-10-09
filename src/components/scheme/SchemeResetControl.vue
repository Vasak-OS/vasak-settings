<script setup lang="ts">
/**
 * «Empezar de nuevo desde…»: reclonar el «Personalizado» a partir de otro
 * esquema.
 *
 * Pisa todo lo que el usuario editó, así que **no se hace sin confirmar**: el
 * botón abre un diálogo y `reset` sale recién cuando se acepta ahí.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	SelectField,
} from '@vasakgroup/vue-libvasak';
import { computed, ref, watch } from 'vue';

interface Props {
	/** Los esquemas que pueden servir de base; nunca el propio «Personalizado». */
	options: { label: string; value: string }[];
	disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ reset: [baseId: string] }>();

const { t } = useI18n();

const baseId = ref(props.options[0]?.value ?? '');
const confirming = ref(false);

watch(
	() => props.options,
	(options) => {
		if (!options.some((option) => option.value === baseId.value)) {
			baseId.value = options[0]?.value ?? '';
		}
	}
);

const baseName = computed(
	() => props.options.find((option) => option.value === baseId.value)?.label ?? ''
);

const confirm = () => {
	confirming.value = false;
	emit('reset', baseId.value);
};
</script>

<template>
	<div class="flex flex-wrap items-end gap-2">
		<div class="flex min-w-48 flex-col gap-1">
			<label for="scheme-reset-base" class="text-xs text-tx-muted">{{ t('views.appearanceTheme.custom.resetFrom') }}</label>
			<SelectField v-bind="{ id: 'scheme-reset-base', disabled: disabled || options.length === 0 }" v-model="baseId" :options="options" />
		</div>
		<button
			type="button"
			data-reset-open
			class="rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
			:disabled="disabled || !baseId"
			@click="confirming = true"
		>
			{{ t('views.appearanceTheme.custom.resetAction') }}
		</button>

		<Dialog :open="confirming" @update:open="(stillOpen: boolean) => { if (!stillOpen) confirming = false; }">
			<DialogContent size="md">
				<DialogHeader close-style="label" :close-label="t('common.close')">
					<DialogTitle>{{ t('views.appearanceTheme.custom.resetTitle') }}</DialogTitle>
					<DialogDescription>{{ t('views.appearanceTheme.custom.resetDescription').replace('{0}', baseName) }}</DialogDescription>
				</DialogHeader>
				<div class="mt-4">
					<div class="flex justify-end gap-2">
						<button
							type="button"
							data-reset-cancel
							class="rounded-corner-m border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							@click="confirming = false"
						>
							{{ t('common.cancel') }}
						</button>
						<button
							type="button"
							data-reset-confirm
							class="rounded-corner-m border border-primary bg-ui-surface/70 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							@click="confirm"
						>
							{{ t('views.appearanceTheme.custom.resetConfirm') }}
						</button>
					</div>
		
				</div>
			</DialogContent>
		</Dialog>
	</div>
</template>
