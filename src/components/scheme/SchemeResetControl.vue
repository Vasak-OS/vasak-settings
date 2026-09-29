<script setup lang="ts">
/**
 * «Empezar de nuevo desde…»: reclonar el «Personalizado» a partir de otro
 * esquema.
 *
 * Pisa todo lo que el usuario editó, así que **no se hace sin confirmar**: el
 * botón abre un diálogo y `reset` sale recién cuando se acepta ahí.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, ref, watch } from 'vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';
import SelectInput from '@/components/ui/SelectInput.vue';

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
			<SelectInput id="scheme-reset-base" v-model="baseId" :options="options" :disabled="disabled || options.length === 0" />
		</div>
		<button
			type="button"
			data-reset-open
			class="rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
			:disabled="disabled || !baseId"
			@click="confirming = true"
		>
			{{ t('views.appearanceTheme.custom.resetAction') }}
		</button>

		<ModalDialog
			:open="confirming"
			:title="t('views.appearanceTheme.custom.resetTitle')"
			:description="t('views.appearanceTheme.custom.resetDescription').replace('{0}', baseName)"
			max-width-class="max-w-lg"
			@close="confirming = false"
		>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					data-reset-cancel
					class="rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					@click="confirming = false"
				>
					{{ t('common.cancel') }}
				</button>
				<button
					type="button"
					data-reset-confirm
					class="rounded-corner border border-primary bg-ui-surface/70 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					@click="confirm"
				>
					{{ t('views.appearanceTheme.custom.resetConfirm') }}
				</button>
			</div>
		</ModalDialog>
	</div>
</template>
