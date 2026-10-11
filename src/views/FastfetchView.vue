<script lang="ts" setup>
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	AlertMessage,
	ConfigSection,
	FormGroup,
	NumberField,
	PageHeader,
	SegmentedControl,
	type SegmentedOption,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref } from 'vue';
import ModulesManager from '@/components/fastfetch/ModulesManager.vue';
import SchemaField from '@/components/fastfetch/SchemaField.vue';
import {
	type FastfetchLogo,
	type LogoKind,
	normalizeLogo,
	usesSize,
	usesSource,
} from '@/utils/fastfetch-logo';
import { type ModuleEntry, parseModules, serializeModules } from '@/utils/fastfetch-modules';
import { displayFields, moduleVariants } from '@/utils/fastfetch-schema';
import { loadFastfetchSchema } from '@/utils/fastfetch-schema-data';

interface FastfetchState {
	available: boolean;
	user_config_exists: boolean;
	logo: FastfetchLogo;
	config: Record<string, unknown>;
	preview: string;
}

const { t } = useI18n();

// El schema es constante: se lee una vez para armar el formulario.
const schema = loadFastfetchSchema();
const variants = moduleVariants(schema);
const dispFields = displayFields(schema);

const LOGO_KINDS: LogoKind[] = ['image', 'builtin', 'ascii', 'none'];

const loading = ref(true);
const saving = ref(false);
const available = ref(true);
const userConfigExists = ref(false);
const preview = ref('');
const error = ref('');
const saved = ref(false);

// Emblema (como en #168): el tamaño va como número con 0 = automático.
const kind = ref<LogoKind>('builtin');
const source = ref('');
const width = ref(0);
const height = ref(0);
const padding = ref(0);

// El resto de la config: módulos (lista editable) y el bloque display.
const moduleEntries = ref<ModuleEntry[]>([]);
const displayValue = ref<Record<string, unknown>>({});

const kindOptions = computed<SegmentedOption<LogoKind>[]>(() =>
	LOGO_KINDS.map((value) => ({ value, label: t(`views.fastfetch.kinds.${value}`) }))
);

const showSource = computed(() => usesSource(kind.value));
const showSize = computed(() => usesSize(kind.value));
const sourceLabel = computed(() =>
	kind.value === 'builtin' ? t('views.fastfetch.builtinName') : t('views.fastfetch.filePath')
);
const sourcePlaceholder = computed(() =>
	kind.value === 'builtin'
		? t('views.fastfetch.builtinPlaceholder')
		: t('views.fastfetch.filePlaceholder')
);

function apply(state: FastfetchState) {
	available.value = state.available;
	userConfigExists.value = state.user_config_exists;
	preview.value = state.preview;
	kind.value = (state.logo.kind as LogoKind) ?? 'builtin';
	// fastfetch usa `file` para una imagen; la pantalla lo muestra como `image`.
	if ((kind.value as string) === 'file') kind.value = 'image';
	source.value = state.logo.source ?? '';
	width.value = state.logo.width ?? 0;
	height.value = state.logo.height ?? 0;
	padding.value = state.logo.padding ?? 0;

	const config = state.config ?? {};
	moduleEntries.value = parseModules(config.modules);
	displayValue.value =
		config.display && typeof config.display === 'object'
			? (config.display as Record<string, unknown>)
			: {};
}

async function load() {
	loading.value = true;
	error.value = '';
	try {
		apply(await invoke<FastfetchState>('get_fastfetch_config'));
	} catch (err) {
		error.value = String(err);
	} finally {
		loading.value = false;
	}
}

function currentLogo(): FastfetchLogo {
	// `image` se escribe como `file`, que es el tipo real de fastfetch.
	const realKind = kind.value === 'image' ? 'file' : kind.value;
	return normalizeLogo({
		kind: realKind as LogoKind,
		source: source.value,
		width: width.value,
		height: height.value,
		padding: padding.value,
	});
}

function setDisplayKey(key: string, value: unknown) {
	const next = { ...displayValue.value };
	if (value === undefined || value === null || value === '') delete next[key];
	else next[key] = value;
	displayValue.value = next;
}

async function save() {
	saving.value = true;
	error.value = '';
	saved.value = false;
	try {
		const partial = {
			logo: currentLogo(),
			modules: serializeModules(moduleEntries.value),
			display: displayValue.value,
		};
		apply(await invoke<FastfetchState>('set_fastfetch_config', { config: partial }));
		saved.value = true;
	} catch (err) {
		error.value = String(err);
	} finally {
		saving.value = false;
	}
}

async function reset() {
	saving.value = true;
	error.value = '';
	saved.value = false;
	try {
		apply(await invoke<FastfetchState>('reset_fastfetch_config'));
	} catch (err) {
		error.value = String(err);
	} finally {
		saving.value = false;
	}
}

onMounted(load);
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.system')"
			:title="t('views.fastfetch.title')"
			:description="t('views.fastfetch.description')"
		/>

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
		<AlertMessage v-else-if="saved" tone="success">
			{{ t('views.fastfetch.saved') }}
		</AlertMessage>
		<AlertMessage v-if="!loading && !available" tone="warning">
			{{ t('views.fastfetch.notInstalled') }}
		</AlertMessage>

		<ConfigSection :title="t('views.fastfetch.previewTitle')">
			<pre
				v-if="preview"
				class="overflow-x-auto rounded-corner-m bg-ui-surface/70 p-3 font-mono text-xs leading-relaxed text-tx-main"
			>{{ preview }}</pre>
			<p v-else class="text-xs text-tx-muted">{{ t('views.fastfetch.previewEmpty') }}</p>
			<p class="mt-2 text-xs text-tx-muted">{{ t('views.fastfetch.previewNote') }}</p>
		</ConfigSection>

		<ConfigSection :title="t('views.fastfetch.emblemTitle')" :description="t('views.fastfetch.emblemHelp')">
			<div class="flex flex-col gap-5">
				<SegmentedControl
					:model-value="kind"
					variant="chips"
					:label="t('views.fastfetch.kind')"
					:options="kindOptions"
					:disabled="saving"
					@update:model-value="(value) => { if (value) kind = value; }"
				/>

				<FormGroup v-if="showSource" :label="sourceLabel">
					<TextInput v-model="source" :placeholder="sourcePlaceholder" :disabled="saving" />
				</FormGroup>

				<div v-if="showSize" class="flex flex-wrap gap-4">
					<FormGroup :label="t('views.fastfetch.width')">
						<NumberField v-model="width" :min="0" :max="200" narrow :disabled="saving" />
					</FormGroup>
					<FormGroup :label="t('views.fastfetch.height')">
						<NumberField v-model="height" :min="0" :max="200" narrow :disabled="saving" />
					</FormGroup>
					<FormGroup :label="t('views.fastfetch.padding')">
						<NumberField v-model="padding" :min="0" :max="80" narrow :disabled="saving" />
					</FormGroup>
				</div>
				<p v-if="showSize" class="text-xs text-tx-muted">{{ t('views.fastfetch.sizeNote') }}</p>
			</div>
		</ConfigSection>

		<ModulesManager
			v-model="moduleEntries"
			:root="schema"
			:variants="variants"
			:disabled="saving"
		/>

		<ConfigSection :title="t('views.fastfetch.display.title')" :description="t('views.fastfetch.display.help')">
			<div class="flex flex-col gap-3">
				<SchemaField
					v-for="field in dispFields"
					:key="field.key"
					:root="schema"
					:schema="field.schema"
					:model-value="displayValue[field.key]"
					:label="field.key"
					@update:model-value="(value) => setDisplayKey(field.key, value)"
				/>
			</div>
		</ConfigSection>

		<div class="flex flex-wrap items-center gap-3">
			<ActionButton
				variant="primary"
				icon="document-save"
				:label="saving ? t('common.saving') : t('views.fastfetch.save')"
				:disabled="saving || loading"
				@click="save"
			/>
			<ActionButton
				variant="secondary"
				icon="edit-undo"
				:label="t('views.fastfetch.reset')"
				:disabled="saving || loading || !userConfigExists"
				@click="reset"
			/>
		</div>
	</div>
</template>
