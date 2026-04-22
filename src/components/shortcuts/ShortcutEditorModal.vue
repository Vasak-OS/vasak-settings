<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';
import { normalizeShortcutKeys } from '@/services/shortcuts.service';
import type { ShortcutRule } from '@/types/shortcuts';

interface Props {
	open: boolean;
	shortcut?: ShortcutRule | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	'update:open': [boolean];
	submit: [ShortcutRule];
	cancel: [];
}>();

const keys = ref('');
const action = ref('launch');
const target = ref('');
const formError = ref('');

const isEditing = computed(() => Boolean(props.shortcut));

const dialogTitle = computed(() => (isEditing.value ? 'Editar shortcut' : 'Nuevo shortcut'));
const dialogDescription = computed(() =>
	isEditing.value
		? 'Ajusta la combinación, la acción o el comando asociado.'
		: 'Define la combinación de teclas y el comando que se ejecutará.'
);

const resetForm = () => {
	keys.value = props.shortcut?.keys || '';
	action.value = props.shortcut?.action || 'launch';
	target.value = props.shortcut?.target || '';
	formError.value = '';
};

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			resetForm();
		}
	}
);

watch(
	() => props.shortcut,
	() => {
		if (props.open) {
			resetForm();
		}
	}
);

const handleSubmit = () => {
	const normalizedKeys = normalizeShortcutKeys(keys.value);
	const normalizedAction = action.value.trim();
	const normalizedTarget = target.value.trim();

	if (!normalizedKeys) {
		formError.value = 'Debes indicar una combinación de teclas';
		return;
	}

	if (!normalizedAction) {
		formError.value = 'Debes indicar una acción';
		return;
	}

	if (!normalizedTarget) {
		formError.value = 'Debes indicar un target o comando';
		return;
	}

	emit('submit', {
		keys: normalizedKeys,
		action: normalizedAction,
		target: normalizedTarget,
	});
};

const handleCancel = () => {
	formError.value = '';
	emit('cancel');
	emit('update:open', false);
};
</script>

<template>
	<ModalDialog :open="open" :title="dialogTitle" :description="dialogDescription" @close="handleCancel">
		<div class="space-y-4">
			<div v-if="formError" class="rounded border border-status-danger/30 bg-status-danger/10 p-2 text-xs text-status-danger">
				{{ formError }}
			</div>

			<FormGroup label="Combinación" html-for="shortcut-keys">
				<input
					id="shortcut-keys"
					v-model="keys"
					type="text"
					placeholder="CTRL+ALT+T"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
				/>
			</FormGroup>

			<FormGroup label="Acción" html-for="shortcut-action">
				<input
					id="shortcut-action"
					v-model="action"
					type="text"
					placeholder="launch"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
				/>
			</FormGroup>

			<FormGroup label="Target / comando" html-for="shortcut-target">
				<textarea
					id="shortcut-target"
					v-model="target"
					rows="3"
					placeholder="firefox"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
				/>
			</FormGroup>

			<p class="text-xs text-tx-muted">
				La combinación se normaliza automáticamente para que el orden de las teclas no importe.
			</p>

			<div class="flex justify-end gap-2 pt-2">
				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-primary transition-colors hover:bg-ui-surface"
					@click="handleCancel"
				>
					Cancelar
				</button>
				<button
					type="button"
					class="rounded-corner border border-primary bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
					@click="handleSubmit"
				>
					{{ isEditing ? 'Guardar cambios' : 'Agregar shortcut' }}
				</button>
			</div>
		</div>
	</ModalDialog>
</template>
