/**
 * La pantalla «Asistente»: servicio, nombre, modelo, clave y estado del demonio.
 *
 * Las dependencias entran por parámetro para probarlo sin Tauri (como
 * `useScreenTimeSettings`) y los textos llegan ya traducidos. No se consulta
 * D-Bus (estado, capacidades, modelos, clave) si la unidad no está activa.
 * La clave del proveedor sólo vive en `keyDraft` hasta que se envía: se vacía
 * apenas termina el intento y no se escribe en ningún registro.
 */

import { readConfig, type VSKConfig, writeConfig } from '@vasakgroup/plugin-config-manager';
import { type Ref, ref } from 'vue';
import {
	type AssistantCapability,
	type AssistantStatus,
	type AssistantUnitState,
	assistantCapabilities,
	assistantHasProviderKey,
	assistantModels,
	assistantStatus,
	assistantUnitState,
	restartAssistantService,
	setAssistantProviderKey,
	setAssistantServiceEnabled,
} from '@/services/assistant.service';
import {
	type AssistantBackend,
	type AssistantConfig,
	canSaveKey as keyAllowed,
	type ModelDraft,
	normalizeAssistantName,
	readAssistantConfig,
	validateModelDraft,
	writeAssistantConfig,
} from '@/utils/assistant-config';

export interface AssistantDeps {
	read: () => Promise<VSKConfig | null>;
	write: (config: VSKConfig) => Promise<void>;
	unitState: () => Promise<AssistantUnitState>;
	setEnabled: (enabled: boolean) => Promise<AssistantUnitState>;
	restart: () => Promise<void>;
	status: () => Promise<AssistantStatus>;
	capabilities: () => Promise<AssistantCapability[]>;
	models: () => Promise<string[]>;
	hasKey: (url: string) => Promise<boolean | null>;
	setKey: (url: string, key: string) => Promise<void>;
}

const defaultDeps: AssistantDeps = {
	read: readConfig,
	write: writeConfig,
	unitState: assistantUnitState,
	setEnabled: setAssistantServiceEnabled,
	restart: restartAssistantService,
	status: assistantStatus,
	capabilities: assistantCapabilities,
	models: assistantModels,
	hasKey: assistantHasProviderKey,
	setKey: setAssistantProviderKey,
};

/** Los textos de los mensajes, ya traducidos. */
export interface AssistantMessages {
	saved: () => string;
	errorSaving: (reason: string) => string;
	errorService: (reason: string) => string;
	invalidName: () => string;
	emptyKey: () => string;
}

export interface AssistantSettings {
	unit: Ref<AssistantUnitState | null>;
	status: Ref<AssistantStatus | null>;
	capabilities: Ref<AssistantCapability[] | null>;
	/** Los modelos que ofrece el proveedor; `null` si no se pudo pedir (la vista cae a texto). */
	models: Ref<string[] | null>;
	/** `true`/`false`: hay o no clave; `null`: el demonio es viejo y no sabe contestar; `undefined`: no se preguntó. */
	hasKey: Ref<boolean | null | undefined>;
	config: Ref<AssistantConfig>;
	nameDraft: Ref<string>;
	draft: Ref<ModelDraft>;
	keyDraft: Ref<string>;
	/** Claves i18n de lo que está mal en el borrador del modelo. */
	modelErrors: Ref<string[]>;
	busy: Ref<boolean>;
	error: Ref<string>;
	successMessage: Ref<string>;
	refresh: () => Promise<void>;
	toggleService: (enabled: boolean) => Promise<void>;
	saveName: () => Promise<void>;
	saveModel: () => Promise<void>;
	saveKey: () => Promise<void>;
}

const SAVED_MS = 3000;

const draftOf = (config: AssistantConfig): ModelDraft => ({
	backend: config.backend,
	url: config.url,
	model: config.model,
	remote: config.allowRemote,
});

export function useAssistantSettings(
	messages: AssistantMessages,
	deps: AssistantDeps = defaultDeps
): AssistantSettings {
	const unit = ref<AssistantUnitState | null>(null);
	const status = ref<AssistantStatus | null>(null);
	const capabilities = ref<AssistantCapability[] | null>(null);
	const models = ref<string[] | null>(null);
	const hasKey = ref<boolean | null | undefined>(undefined);
	const config = ref<AssistantConfig>(readAssistantConfig(null));
	const nameDraft = ref(config.value.name);
	const draft = ref<ModelDraft>(draftOf(config.value));
	const keyDraft = ref('');
	const modelErrors = ref<string[]>([]);
	const busy = ref(false);
	const error = ref('');
	const successMessage = ref('');

	const succeed = () => {
		successMessage.value = messages.saved();
		setTimeout(() => {
			successMessage.value = '';
		}, SAVED_MS);
	};

	const loadConfig = async () => {
		try {
			config.value = readAssistantConfig(await deps.read());
			nameDraft.value = config.value.name;
			draft.value = draftOf(config.value);
		} catch {
			// Sin archivo legible quedan los valores de fábrica.
		}
	};

	const loadDaemon = async () => {
		status.value = null;
		capabilities.value = null;
		models.value = null;
		hasKey.value = undefined;
		if (!unit.value?.active) return;
		const url = config.value.url;
		const [st, caps, list, key] = await Promise.allSettled([
			deps.status(),
			deps.capabilities(),
			deps.models(),
			deps.hasKey(url),
		]);
		if (st.status === 'fulfilled') status.value = st.value;
		if (caps.status === 'fulfilled') capabilities.value = caps.value;
		if (list.status === 'fulfilled') models.value = list.value;
		if (key.status === 'fulfilled') hasKey.value = key.value;
	};

	const refresh = async () => {
		await loadConfig();
		try {
			unit.value = await deps.unitState();
		} catch (err) {
			unit.value = null;
			error.value = messages.errorService(String(err));
		}
		await loadDaemon();
	};

	/** Corre una acción con el aviso de ocupado y el error ya traducido. */
	const run = async (fail: (reason: string) => string, action: () => Promise<void>) => {
		busy.value = true;
		error.value = '';
		successMessage.value = '';
		try {
			await action();
		} catch (err) {
			error.value = fail(String(err));
		} finally {
			busy.value = false;
		}
	};

	const toggleService = (enabled: boolean) =>
		run(messages.errorService, async () => {
			unit.value = await deps.setEnabled(enabled);
			await loadDaemon();
		});

	const persist = async (patch: Parameters<typeof writeAssistantConfig>[1]) => {
		const current = await deps.read();
		if (!current) throw new Error('config');
		writeAssistantConfig(current as unknown as Record<string, unknown>, patch);
		await deps.write(current);
	};

	const saveName = async () => {
		const name = normalizeAssistantName(nameDraft.value);
		if (name === null) {
			error.value = messages.invalidName();
			return;
		}
		await run(messages.errorSaving, async () => {
			await persist({ name });
			await loadConfig();
			succeed();
		});
	};

	const saveModel = async () => {
		modelErrors.value = validateModelDraft(draft.value);
		if (modelErrors.value.length) return;
		const { backend, url, model, remote } = draft.value;
		await run(messages.errorSaving, async () => {
			await persist({
				backend: backend as AssistantBackend,
				url,
				model,
				allowRemote: remote,
			});
			// El demonio lee la config al arrancar; sólo se reinicia si corre.
			if (unit.value?.active) await deps.restart();
			await refresh();
			succeed();
		});
	};

	const saveKey = async () => {
		// Con la unidad inactiva o la URL sin guardar la clave iría a otro lado: no sale.
		if (!keyAllowed(unit.value, config.value, draft.value)) return;
		const key = keyDraft.value.trim();
		if (!key) {
			error.value = messages.emptyKey();
			return;
		}
		await run(messages.errorSaving, async () => {
			try {
				await deps.setKey(config.value.url, key);
			} finally {
				keyDraft.value = '';
			}
			hasKey.value = await deps.hasKey(config.value.url).catch(() => hasKey.value);
			succeed();
		});
	};

	return {
		unit,
		status,
		capabilities,
		models,
		hasKey,
		config,
		nameDraft,
		draft,
		keyDraft,
		modelErrors,
		busy,
		error,
		successMessage,
		refresh,
		toggleService,
		saveName,
		saveModel,
		saveKey,
	};
}
