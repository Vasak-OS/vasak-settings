<script lang="ts" setup>
/**
 * Un campo del editor de fastfetch, dibujado desde el JSON schema.
 *
 * Es recursivo: un objeto dibuja un `SchemaField` por cada propiedad, un arreglo
 * uno por cada elemento, y una unión (`oneOf`/`anyOf`) deja elegir la variante y
 * dibuja la elegida. Así una opción nueva en el schema aparece sola, sin tocar
 * esto. Las etiquetas y ayudas salen del schema (el vocabulario de fastfetch, en
 * inglés): son datos, no texto de la aplicación.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	FormGroup,
	NumberField,
	SegmentedControl,
	type SegmentedOption,
	SelectField,
	SwitchToggle,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { deref, type RootSchema, type SchemaNode } from '@/utils/fastfetch-schema';
import { blankFor, branchLabel, matchingBranch, schemaKind } from '@/utils/schema-field';

const props = defineProps<{
	root: RootSchema;
	schema: SchemaNode;
	modelValue: unknown;
	label: string;
	description?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();

const { t } = useI18n();

const kind = computed(() => schemaKind(props.schema));
const help = computed(() => props.description || props.schema.description || '');

// --- enum / select ---
const enumOptions = computed<SegmentedOption<string>[]>(() =>
	(props.schema.enum ?? []).map((value) => ({ value: String(value), label: String(value) }))
);

// --- object ---
const objectFields = computed(() =>
	Object.entries(props.schema.properties ?? {})
		.filter(([key]) => key !== 'type')
		.map(([key, child]) => ({ key, schema: deref(props.root, child) }))
);
function objectValue(): Record<string, unknown> {
	return (props.modelValue as Record<string, unknown>) ?? {};
}
function setObjectKey(key: string, value: unknown) {
	const next = { ...objectValue() };
	if (value === undefined || value === null || value === '') delete next[key];
	else next[key] = value;
	emit('update:modelValue', next);
}

// --- array ---
const arrayValue = computed<unknown[]>(() =>
	Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : []
);
const itemSchema = computed(() =>
	props.schema.items ? deref(props.root, props.schema.items) : {}
);
function setItem(index: number, value: unknown) {
	const next = [...arrayValue.value];
	next[index] = value;
	emit('update:modelValue', next);
}
function addItem() {
	emit('update:modelValue', [...arrayValue.value, blankFor(itemSchema.value)]);
}
function removeItem(index: number) {
	const next = [...arrayValue.value];
	next.splice(index, 1);
	emit('update:modelValue', next);
}

// --- union (oneOf / anyOf) ---
const branches = computed(() => props.schema.oneOf ?? props.schema.anyOf ?? []);
const branchOptions = computed<SegmentedOption<number>[]>(() =>
	branches.value.map((branch, index) => ({ value: index, label: branchLabel(branch, t) }))
);
const activeBranch = computed(() => matchingBranch(branches.value, props.modelValue));
function pickBranch(index: number) {
	emit('update:modelValue', blankFor(deref(props.root, branches.value[index])));
}

// --- typed setters ---
function setString(value: string) {
	emit('update:modelValue', value === '' ? undefined : value);
}
function setNumber(value: number) {
	emit('update:modelValue', value);
}
function setBool(value: boolean) {
	emit('update:modelValue', value);
}

const stringValue = computed(() => (props.modelValue == null ? '' : String(props.modelValue)));
const numberValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : 0));
const boolValue = computed(() => props.modelValue === true);
</script>

<template>
	<div class="flex flex-col gap-1">
		<!-- Unión: elegir la variante y dibujarla -->
		<template v-if="kind === 'union'">
			<FormGroup :label="label">
				<SegmentedControl
					:model-value="activeBranch"
					variant="chips"
					:label="label"
					:options="branchOptions"
					@update:model-value="(value) => { if (value != null) pickBranch(value); }"
				/>
			</FormGroup>
			<SchemaField
				:root="root"
				:schema="deref(root, branches[activeBranch] ?? {})"
				:model-value="modelValue"
				:label="label"
				:description="help"
				@update:model-value="(value) => emit('update:modelValue', value)"
			/>
		</template>

		<!-- Enum -->
		<FormGroup v-else-if="schema.enum" :label="label">
			<SelectField :model-value="stringValue" @update:model-value="(value) => setString(value)">
				<option v-for="opt in enumOptions" :key="opt.value" :value="opt.value">
					{{ opt.label }}
				</option>
			</SelectField>
		</FormGroup>

		<!-- Booleano -->
		<div v-else-if="kind === 'boolean'" class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<h4 class="text-sm font-medium">{{ label }}</h4>
				<p v-if="help" class="text-xs text-tx-muted">{{ help }}</p>
			</div>
			<SwitchToggle
				:model-value="boolValue"
				:label="label"
				@update:model-value="(value) => setBool(value)"
			/>
		</div>

		<!-- Número -->
		<FormGroup v-else-if="kind === 'number'" :label="label">
			<NumberField
				:model-value="numberValue"
				:min="schema.minimum"
				:max="schema.maximum"
				narrow
				@update:model-value="(value) => setNumber(value)"
			/>
		</FormGroup>

		<!-- Objeto: un campo por propiedad -->
		<div v-else-if="kind === 'object'" class="flex flex-col gap-3 rounded-corner-m bg-ui-surface/50 p-3">
			<h4 class="text-sm font-medium">{{ label }}</h4>
			<p v-if="help" class="text-xs text-tx-muted">{{ help }}</p>
			<SchemaField
				v-for="field in objectFields"
				:key="field.key"
				:root="root"
				:schema="field.schema"
				:model-value="objectValue()[field.key]"
				:label="field.key"
				@update:model-value="(value) => setObjectKey(field.key, value)"
			/>
		</div>

		<!-- Arreglo: lista de elementos -->
		<div v-else-if="kind === 'array'" class="flex flex-col gap-2 rounded-corner-m bg-ui-surface/50 p-3">
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium">{{ label }}</h4>
				<ActionButton
					variant="secondary"
					icon="list-add"
					size="sm"
					:label="t('views.fastfetch.schema.addItem')"
					@click="addItem"
				/>
			</div>
			<p v-if="help" class="text-xs text-tx-muted">{{ help }}</p>
			<div v-for="(_, index) in arrayValue" :key="index" class="flex items-start gap-2">
				<div class="min-w-0 flex-1">
					<SchemaField
						:root="root"
						:schema="itemSchema"
						:model-value="arrayValue[index]"
						:label="`#${index + 1}`"
						@update:model-value="(value) => setItem(index, value)"
					/>
				</div>
				<ActionButton
					variant="ghost"
					icon="list-remove"
					size="sm"
					:label="t('views.fastfetch.schema.removeItem')"
					@click="removeItem(index)"
				/>
			</div>
		</div>

		<!-- Texto (por defecto) -->
		<FormGroup v-else :label="label">
			<TextInput :model-value="stringValue" @update:model-value="(value) => setString(value)" />
		</FormGroup>
	</div>
</template>
