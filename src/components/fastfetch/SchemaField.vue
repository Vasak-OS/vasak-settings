<script lang="ts" setup>
/**
 * Un campo del editor de fastfetch, dibujado desde el JSON schema.
 *
 * Es recursivo: un objeto dibuja un `SchemaField` por cada propiedad, un arreglo
 * uno por cada elemento, y una unión (`oneOf`/`anyOf`) deja elegir la variante y
 * dibuja la elegida. Cada opción es una fila Once UI (`SettingRow`): la etiqueta
 * legible y la ayuda a un lado, el control al otro. Las etiquetas salen de la
 * clave del schema, humanizada; la ayuda, de su `description`.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	NumberField,
	SegmentedControl,
	type SegmentedOption,
	SelectField,
	SettingRow,
	SwitchToggle,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { deref, type RootSchema, type SchemaNode } from '@/utils/fastfetch-schema';
import {
	blankFor,
	branchLabel,
	humanizeKey,
	isNullSchema,
	matchingBranch,
	schemaKind,
} from '@/utils/schema-field';

const props = defineProps<{
	root: RootSchema;
	schema: SchemaNode;
	modelValue: unknown;
	label: string;
	description?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();

const { t } = useI18n();

// Las ramas de una unión, ya resueltas y sin la rama `null`: una unión `[T, null]`
// es «T o nada», así que `null` no es una variante que elegir. Con una sola rama
// útil no hay unión —se dibuja esa rama directamente, vacía = sin definir—.
const rawBranches = computed(() => props.schema.oneOf ?? props.schema.anyOf ?? []);
const branches = computed(() =>
	rawBranches.value.map((b) => deref(props.root, b)).filter((b) => !isNullSchema(b))
);
const isUnion = computed(() => branches.value.length >= 2);
const effSchema = computed(() =>
	rawBranches.value.length > 0 && branches.value.length === 1 ? branches.value[0] : props.schema
);

const kind = computed(() => (isUnion.value ? 'union' : schemaKind(effSchema.value)));
const displayLabel = computed(() => humanizeKey(props.label));
const help = computed(
	() => props.description || props.schema.description || effSchema.value.description || ''
);

const enumOptions = computed(() => (effSchema.value.enum ?? []).map(String));

const objectFields = computed(() =>
	Object.entries(effSchema.value.properties ?? {})
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

const arrayValue = computed<unknown[]>(() =>
	Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : []
);
const itemSchema = computed(() =>
	effSchema.value.items ? deref(props.root, effSchema.value.items) : {}
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

// `branches` ya viene resuelto y sin `null` (arriba).
const branchOptions = computed<SegmentedOption<number>[]>(() =>
	branches.value.map((branch, index) => ({ value: index, label: branchLabel(branch, t) }))
);
const activeBranch = computed(() => matchingBranch(branches.value, props.modelValue));
function pickBranch(index: number) {
	emit('update:modelValue', blankFor(branches.value[index]));
}

function setString(value: string) {
	emit('update:modelValue', value === '' ? undefined : value);
}

const stringValue = computed(() => (props.modelValue == null ? '' : String(props.modelValue)));
const numberValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : 0));
const boolValue = computed(() => props.modelValue === true);
</script>

<template>
	<!-- Unión: elegir la variante y dibujarla debajo -->
	<SettingRow v-if="kind === 'union'" :label="displayLabel" :description="help">
		<SegmentedControl
			:model-value="activeBranch"
			variant="chips"
			:label="displayLabel"
			:options="branchOptions"
			@update:model-value="(value) => { if (value != null) pickBranch(value); }"
		/>
		<template #footer>
			<!-- La rama elegida: lleva su propia etiqueta (la de la variante) y su
			     propia ayuda, para no repetir el título ni la ayuda de la unión. -->
			<SchemaField
				:root="root"
				:schema="branches[activeBranch] ?? {}"
				:model-value="modelValue"
				:label="branchOptions[activeBranch]?.label ?? displayLabel"
				@update:model-value="(value) => emit('update:modelValue', value)"
			/>
		</template>
	</SettingRow>

	<!-- Enum -->
	<SettingRow v-else-if="effSchema.enum" :label="displayLabel" :description="help">
		<SelectField :model-value="stringValue" @update:model-value="(value) => setString(value)">
			<option v-for="opt in enumOptions" :key="opt" :value="opt">{{ opt }}</option>
		</SelectField>
	</SettingRow>

	<!-- Booleano -->
	<SettingRow v-else-if="kind === 'boolean'" :label="displayLabel" :description="help">
		<SwitchToggle
			:model-value="boolValue"
			:label="displayLabel"
			@update:model-value="(value) => emit('update:modelValue', value)"
		/>
	</SettingRow>

	<!-- Número -->
	<SettingRow v-else-if="kind === 'number'" :label="displayLabel" :description="help">
		<NumberField
			:model-value="numberValue"
			:min="effSchema.minimum"
			:max="effSchema.maximum"
			narrow
			@update:model-value="(value) => emit('update:modelValue', value)"
		/>
	</SettingRow>

	<!-- Objeto: un grupo con una fila por propiedad -->
	<div v-else-if="kind === 'object'" class="flex flex-col gap-2 rounded-corner-m bg-ui-surface/50 p-3">
		<div>
			<h5 class="text-sm font-medium">{{ displayLabel }}</h5>
			<p v-if="help" class="text-xs text-tx-muted">{{ help }}</p>
		</div>
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
		<div class="flex items-center justify-between gap-2">
			<div>
				<h5 class="text-sm font-medium">{{ displayLabel }}</h5>
				<p v-if="help" class="text-xs text-tx-muted">{{ help }}</p>
			</div>
			<ActionButton
				variant="secondary"
				icon="list-add"
				size="sm"
				:label="t('views.fastfetch.schema.addItem')"
				@click="addItem"
			/>
		</div>
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
	<SettingRow v-else :label="displayLabel" :description="help">
		<TextInput :model-value="stringValue" @update:model-value="(value) => setString(value)" />
	</SettingRow>
</template>
