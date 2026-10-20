<script setup lang="ts">
/**
 * «Asistente»: el servicio de Lince, su nombre, el modelo, el consentimiento por
 * dominio y la memoria. Sólo maqueta; la lógica está en `useAssistantSettings`
 * y en `utils/assistant-*`.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	AlertMessage,
	Badge,
	ConfigSection,
	FormGroup,
	PageHeader,
	PasswordField,
	SearchSelect,
	SegmentedControl,
	SettingRow,
	SwitchRow,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted } from 'vue';
import { useAssistantSettings } from '@/composables/useAssistantSettings';
import { ASSISTANT_PROVIDERS, DEFAULT_URLS } from '@/utils/assistant-config';
import { consentRows, memoryRow, remoteNotice, serviceView } from '@/utils/assistant-state';

const { t } = useI18n();

const settings = useAssistantSettings({
	saved: () => t('views.assistant.saved'),
	errorSaving: (reason) => t('views.assistant.errorSaving').replace('{0}', reason),
	errorService: (reason) => t('views.assistant.errorService').replace('{0}', reason),
	invalidName: () => t('views.assistant.name.invalid'),
	emptyKey: () => t('views.assistant.key.empty'),
});
const { unit, status, capabilities, models, hasKey, config, draft, busy } = settings;

const view = computed(() => serviceView(unit.value, status.value));
const installed = computed(() => !!unit.value?.installed);
const notice = computed(() => remoteNotice(status.value?.model ?? null));
const rows = computed(() => consentRows(capabilities.value));
const memory = computed(() => memoryRow(capabilities.value));

const modeOptions = computed(() => [
	{ value: 'local', label: t('views.assistant.model.local') },
	{ value: 'remote', label: t('views.assistant.model.remote') },
]);
const backendOptions = ASSISTANT_PROVIDERS.map((value) => ({
	value,
	label: value === 'ollama' ? 'Ollama' : 'OpenAI',
}));

/** Los modelos del proveedor, más el elegido si todavía no figura en la lista. */
const modelOptions = computed(() => {
	const names = [...(models.value ?? [])];
	if (draft.value.model && !names.includes(draft.value.model)) names.unshift(draft.value.model);
	return names.map((name) => ({ valor: name, etiqueta: name }));
});

const changeBackend = (backend: string | null) => {
	if (!backend) return;
	const previous = draft.value.backend as keyof typeof DEFAULT_URLS;
	// Si la dirección era la de fábrica del proveedor anterior, acompaña al cambio.
	if (draft.value.url === DEFAULT_URLS[previous]) {
		draft.value.url = DEFAULT_URLS[backend as keyof typeof DEFAULT_URLS];
	}
	draft.value.backend = backend;
};

const keyState = computed(() => {
	if (hasKey.value === null) return t('views.assistant.key.unavailable');
	if (hasKey.value === undefined) return '';
	return hasKey.value ? t('views.assistant.key.stored') : t('views.assistant.key.missing');
});

onMounted(settings.refresh);
</script>

<template>
	<div class="@container flex min-h-full flex-col gap-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.system')"
			:title="t('views.assistant.title')"
			:description="t('views.assistant.description')"
			icon="internet-chat"
		/>

		<AlertMessage v-if="settings.error.value" tone="error">{{ settings.error.value }}</AlertMessage>
		<AlertMessage v-if="settings.successMessage.value" tone="success">
			{{ settings.successMessage.value }}
		</AlertMessage>
		<AlertMessage v-if="notice" tone="warning">
			{{ t('views.assistant.remoteNotice').replace('{0}', notice.host) }}
		</AlertMessage>

		<div class="grid grid-cols-1 items-start gap-4 @lg:grid-cols-2">
			<ConfigSection :title="t('views.assistant.service.title')">
				<SwitchRow
					:label="t('views.assistant.service.label')"
					:description="installed ? t('views.assistant.service.hint') : t('views.assistant.service.notInstalledHint')"
					:model-value="!!unit?.enabled"
					:disabled="busy || !installed || !!unit?.masked"
					@update:model-value="(value) => settings.toggleService(value)"
				/>
				<div class="mt-3 flex min-w-0 flex-wrap items-center gap-2">
					<Badge
						dot
						:tone="view === 'ready' ? 'success' : view === 'unavailable' ? 'error' : 'neutral'"
						:label="t(`views.assistant.service.state.${view}`)"
					/>
					<span v-if="view === 'unavailable' && status?.reason" class="min-w-0 text-sm text-tx-muted">
						{{ status.reason }}
					</span>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.assistant.name.title')">
				<FormGroup
					:label="t('views.assistant.name.label')"
					:help="t('views.assistant.name.hint')"
					v-slot="{ id, describedBy }"
				>
					<TextInput
						:id="id"
						v-model="settings.nameDraft.value"
						:described-by="describedBy"
						:disabled="busy"
					/>
				</FormGroup>
				<div class="mt-3">
					<ActionButton :label="t('views.assistant.name.save')" :disabled="busy" @click="settings.saveName()" />
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.assistant.model.title')" class="@lg:col-span-2">
				<div class="flex flex-col gap-4">
					<SettingRow :label="t('views.assistant.model.mode')">
						<SegmentedControl
							:model-value="draft.remote ? 'remote' : 'local'"
							:options="modeOptions"
							:label="t('views.assistant.model.mode')"
							:disabled="busy"
							@update:model-value="(value: string | null) => { if (value) draft.remote = value === 'remote'; }"
						/>
					</SettingRow>
					<SettingRow :label="t('views.assistant.model.backend')">
						<SegmentedControl
							:model-value="draft.backend"
							:options="backendOptions"
							:label="t('views.assistant.model.backend')"
							:disabled="busy"
							@update:model-value="changeBackend"
						/>
					</SettingRow>
					<FormGroup :label="t('views.assistant.model.url')" v-slot="{ id, describedBy }">
						<TextInput :id="id" v-model="draft.url" type="url" :described-by="describedBy" :disabled="busy" />
					</FormGroup>
					<FormGroup :label="t('views.assistant.model.name')" v-slot="{ id, describedBy }">
						<SearchSelect
							v-if="models"
							v-model="draft.model"
							:options="modelOptions"
							:label="t('views.assistant.model.name')"
							:button-id="id"
							:disabled="busy"
						/>
						<template v-else>
							<TextInput :id="id" v-model="draft.model" :described-by="describedBy" :disabled="busy" />
							<p v-if="unit?.active" class="mt-1 text-sm text-tx-muted">
								{{ t('views.assistant.model.noModelList') }}
							</p>
						</template>
					</FormGroup>

					<FormGroup
						v-if="config.backend === 'openai'"
						:label="t('views.assistant.key.label')"
						:help="keyState"
						v-slot="{ id, describedBy }"
					>
						<PasswordField
							:id="id"
							v-model="settings.keyDraft.value"
							:described-by="describedBy"
							:placeholder="t('views.assistant.key.placeholder')"
							autocomplete="new-password"
							:disabled="busy || hasKey === null"
						/>
						<div class="mt-2">
							<ActionButton
								:label="t('views.assistant.key.save')"
								variant="secondary"
								:disabled="busy || hasKey === null"
								@click="settings.saveKey()"
							/>
						</div>
					</FormGroup>

					<AlertMessage v-for="key in settings.modelErrors.value" :key="key" tone="error">
						{{ t(key) }}
					</AlertMessage>
					<AlertMessage tone="info">{{ t('views.assistant.model.restartNotice') }}</AlertMessage>
					<div>
						<ActionButton :label="t('views.assistant.model.save')" :disabled="busy" @click="settings.saveModel()" />
					</div>
				</div>
			</ConfigSection>

			<ConfigSection
				:title="t('views.assistant.consent.title')"
				:description="t('views.assistant.consent.description')"
			>
				<div class="flex flex-col gap-2">
					<SwitchRow
						v-for="row in rows"
						:key="row.domain"
						:label="t(`views.assistant.consent.domains.${row.domain}`)"
						:description="row.reason || t('views.assistant.consent.disabledNote')"
						:model-value="row.available"
						disabled
					/>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.assistant.memory.title')">
				<SwitchRow
					:label="t('views.assistant.memory.label')"
					:description="memory.reason || t('views.assistant.memory.hint')"
					:model-value="false"
					disabled
				/>
				<div class="mt-3">
					<ActionButton :label="t('views.assistant.memory.clear')" variant="danger" disabled />
				</div>
			</ConfigSection>
		</div>
	</div>
</template>
