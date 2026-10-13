<script lang="ts" setup>
/**
 * Los módulos de fastfetch: cuáles se muestran, en qué orden y con qué opciones.
 *
 * Trabaja con la lista uniforme `{ name, options }` (ver `fastfetch-modules`). Las
 * opciones de cada módulo salen del schema, dibujadas por `SchemaField`.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, ConfigSection, SelectField, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { computed, ref } from 'vue';
import {
	availableModules,
	type ModuleEntry,
	moveEntry,
	REPEATABLE_MODULES,
} from '@/utils/fastfetch-modules';
import { type ModuleVariant, optionFields, type RootSchema } from '@/utils/fastfetch-schema';
import SchemaField from './SchemaField.vue';

const props = defineProps<{
	root: RootSchema;
	variants: ModuleVariant[];
	modelValue: ModuleEntry[];
	disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: ModuleEntry[]] }>();

const { t } = useI18n();

const expanded = ref<number | null>(null);
const toAdd = ref('');

const variantByName = computed(() => {
	const map = new Map<string, ModuleVariant>();
	for (const variant of props.variants) map.set(variant.name, variant);
	return map;
});

const enabledNames = computed(() => new Set(props.modelValue.map((entry) => entry.name)));
const available = computed(() => availableModules(props.variants, enabledNames.value));

function titleOf(name: string): string {
	return variantByName.value.get(name)?.title ?? name;
}

function fieldsOf(name: string) {
	const variant = variantByName.value.get(name);
	return variant ? optionFields(props.root, variant.schema) : [];
}

function update(next: ModuleEntry[]) {
	emit('update:modelValue', next);
}

function remove(index: number) {
	const next = [...props.modelValue];
	next.splice(index, 1);
	if (expanded.value === index) expanded.value = null;
	update(next);
}

function move(index: number, delta: number) {
	update(moveEntry(props.modelValue, index, index + delta));
}

function addSelected() {
	// Un repetible (separator/break/…) se puede agregar aunque ya esté; el resto,
	// sólo si no está.
	const repeatable = REPEATABLE_MODULES.has(toAdd.value);
	if (!toAdd.value || (enabledNames.value.has(toAdd.value) && !repeatable)) return;
	update([...props.modelValue, { name: toAdd.value, options: {} }]);
	toAdd.value = '';
}

function setOption(index: number, key: string, value: unknown) {
	const next = props.modelValue.map((entry) => ({ ...entry, options: { ...entry.options } }));
	if (value === undefined || value === null || value === '') delete next[index].options[key];
	else next[index].options[key] = value;
	update(next);
}

function toggleExpand(index: number) {
	expanded.value = expanded.value === index ? null : index;
}
</script>

<template>
	<ConfigSection :title="t('views.fastfetch.modules.title')" :description="t('views.fastfetch.modules.help')">
		<div class="flex flex-col gap-2">
			<div
				v-for="(entry, index) in modelValue"
				:key="`${entry.name}-${index}`"
				class="rounded-corner-m bg-ui-surface/70 p-2"
			>
				<div class="flex items-center gap-2">
					<SwitchToggle
						:model-value="true"
						:label="titleOf(entry.name)"
						:disabled="disabled"
						@update:model-value="() => remove(index)"
					/>
					<span class="min-w-0 flex-1 truncate text-sm font-medium">{{ titleOf(entry.name) }}</span>
					<ActionButton
						variant="ghost"
						size="sm"
						icon="go-up"
						:label="t('views.fastfetch.modules.moveUp')"
						:disabled="disabled || index === 0"
						@click="move(index, -1)"
					/>
					<ActionButton
						variant="ghost"
						size="sm"
						icon="go-down"
						:label="t('views.fastfetch.modules.moveDown')"
						:disabled="disabled || index === modelValue.length - 1"
						@click="move(index, 1)"
					/>
					<ActionButton
						v-if="fieldsOf(entry.name).length"
						variant="secondary"
						size="sm"
						:icon="expanded === index ? 'pan-up' : 'pan-down'"
						:label="t('views.fastfetch.modules.options')"
						:disabled="disabled"
						@click="toggleExpand(index)"
					/>
				</div>

				<div v-if="expanded === index" class="mt-3 flex flex-col gap-3 border-t border-ui-line pt-3">
					<SchemaField
						v-for="field in fieldsOf(entry.name)"
						:key="field.key"
						:root="root"
						:schema="field.schema"
						:model-value="entry.options[field.key]"
						:label="field.key"
						@update:model-value="(value) => setOption(index, field.key, value)"
					/>
				</div>
			</div>

			<p v-if="!modelValue.length" class="text-xs text-tx-muted">
				{{ t('views.fastfetch.modules.empty') }}
			</p>

			<div class="mt-2 flex items-end gap-2">
				<SelectField
					v-model="toAdd"
					class="min-w-0 flex-1"
					:label="t('views.fastfetch.modules.add')"
					:disabled="disabled || !available.length"
				>
					<option value="">{{ t('views.fastfetch.modules.addPlaceholder') }}</option>
					<option v-for="variant in available" :key="variant.name" :value="variant.name">
						{{ variant.title }}
					</option>
				</SelectField>
				<ActionButton
					variant="primary"
					icon="list-add"
					:label="t('views.fastfetch.modules.addButton')"
					:disabled="disabled || !toAdd"
					@click="addSelected"
				/>
			</div>
		</div>
	</ConfigSection>
</template>
