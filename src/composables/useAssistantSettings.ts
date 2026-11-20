/**
 * La pantalla «Asistente»: servicio, nombre, modelo, clave y estado del demonio.
 *
 * Las dependencias entran por parámetro para probarlo sin Tauri (como
 * `useScreenTimeSettings`) y los textos llegan ya traducidos. No se consulta
 * D-Bus (estado, capacidades, modelos, clave) si la unidad no está activa.
 * La clave del proveedor sólo vive en `keyDraft` hasta que se envía: se vacía
 * apenas termina el intento y no se escribe en ningún registro.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readConfig, type VSKConfig, writeConfig } from '@vasakgroup/plugin-config-manager';
import { type Ref, ref } from 'vue';
import {
	ASSISTANT_BINARY,
	type AssistantCapability,
	type AssistantMemoryStatus,
	type AssistantStatus,
	type AssistantUnitState,
	assistantCapabilities,
	assistantHasProviderKey,
	assistantMemoryStatus,
	assistantModels,
	assistantStatus,
	assistantUnitState,
	clearAssistantMemory,
	restartAssistantService,
	setAssistantMemoryEnabled,
	setAssistantProviderKey,
	setAssistantServiceEnabled,
} from '@/services/assistant.service';
import { type Decision, listPermissions, setPermission } from '@/services/permissions.service';
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
import { CONSENT_RESOURCE } from '@/utils/assistant-state';

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
	memoryStatus: () => Promise<AssistantMemoryStatus | null>;
	setMemoryEnabled: (enabled: boolean) => Promise<void>;
	clearMemory: () => Promise<void>;
	/** Las decisiones de `vasak-permissions` del asistente, por recurso. */
	decisions: () => Promise<Record<string, Decision>>;
	/** Concede o revoca un recurso del asistente; pasa por polkit y puede rechazarse. */
	setConsent: (resource: string, allowed: boolean) => Promise<void>;
	/** Abre el selector de carpetas; `null` si la persona lo cancela. */
	pickFolder: () => Promise<string | null>;
}

/** El selector de carpetas de Tauri, una sola carpeta. */
const pickFolderDialog = async (): Promise<string | null> => {
	const picked = await open({ directory: true, multiple: false });
	return typeof picked === 'string' ? picked : null;
};

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
	memoryStatus: assistantMemoryStatus,
	setMemoryEnabled: setAssistantMemoryEnabled,
	clearMemory: clearAssistantMemory,
	decisions: async () => {
		const entry = (await listPermissions()).find(
			(e) => e.application.binary_path === ASSISTANT_BINARY
		);
		return entry?.decisions ?? {};
	},
	setConsent: (resource, allowed) => setPermission(ASSISTANT_BINARY, resource, allowed),
	pickFolder: pickFolderDialog,
};

/** Los textos de los mensajes, ya traducidos. */
export interface AssistantMessages {
	saved: () => string;
	errorSaving: (reason: string) => string;
	errorService: (reason: string) => string;
	invalidName: () => string;
	emptyKey: () => string;
	errorMemory: (reason: string) => string;
	errorConsent: (reason: string) => string;
	errorConsentRead: (reason: string) => string;
}

export interface AssistantSettings {
	unit: Ref<AssistantUnitState | null>;
	status: Ref<AssistantStatus | null>;
	capabilities: Ref<AssistantCapability[] | null>;
	/** Las decisiones de consentimiento del asistente, por recurso de `vasak-permissions`. */
	consent: Ref<Record<string, Decision>>;
	/** Si ya hubo una lectura buena del consentimiento; hasta entonces es desconocido. */
	consentLoaded: Ref<boolean>;
	/** Por qué no se pudo leer el consentimiento; vacío si se pudo. */
	consentError: Ref<string>;
	/** Los modelos que ofrece el proveedor; `null` si no se pudo pedir (la vista cae a texto). */
	models: Ref<string[] | null>;
	/** `null`: el demonio es viejo y no tiene memoria; `undefined`: no se preguntó. */
	memoryStatus: Ref<AssistantMemoryStatus | null | undefined>;
	/** Por qué no se pudo leer el estado de la memoria (la llamada se rechazó); vacío si se pudo. */
	memoryError: Ref<string>;
	/** La confirmación de borrar la memoria está abierta. */
	confirmingClear: Ref<boolean>;
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
	/** Concede o revoca el dominio en `vasak-permissions`; no hace nada si no es tocable. */
	toggleConsent: (domain: string, allowed: boolean) => Promise<void>;
	saveName: () => Promise<void>;
	saveModel: () => Promise<void>;
	saveKey: () => Promise<void>;
	/** Abre el selector y agrega la carpeta al alcance de Lince (si no estaba). */
	addFilesRoot: () => Promise<void>;
	/** Saca una carpeta del alcance de Lince. */
	removeFilesRoot: (path: string) => Promise<void>;
	toggleMemory: (enabled: boolean) => Promise<void>;
	/** Pide confirmación; no borra. */
	clearMemory: () => void;
	cancelClear: () => void;
	/** Borra de verdad, tras la confirmación. */
	confirmClear: () => Promise<void>;
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
	const consent = ref<Record<string, Decision>>({});
	// Hasta la primera lectura buena el consentimiento es desconocido, no «negado»:
	// mostrarlo apagado y tocable dejaría revocar algo que en realidad está concedido.
	const consentLoaded = ref(false);
	// Error propio de la lectura del consentimiento, como `memoryError`: no pisa el
	// error general (p. ej. el del servicio) ni se disfraza de él.
	const consentError = ref('');
	const models = ref<string[] | null>(null);
	const hasKey = ref<boolean | null | undefined>(undefined);
	const memoryStatus = ref<AssistantMemoryStatus | null | undefined>(undefined);
	const memoryError = ref('');
	const confirmingClear = ref(false);
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
		memoryStatus.value = undefined;
		memoryError.value = '';
		if (!unit.value?.active) return;
		const url = config.value.url;
		const [st, caps, list, key, mem] = await Promise.allSettled([
			deps.status(),
			deps.capabilities(),
			deps.models(),
			deps.hasKey(url),
			Promise.resolve().then(() => deps.memoryStatus()),
		]);
		if (st.status === 'fulfilled') status.value = st.value;
		if (caps.status === 'fulfilled') capabilities.value = caps.value;
		if (list.status === 'fulfilled') models.value = list.value;
		if (key.status === 'fulfilled') hasKey.value = key.value;
		// `null` es un demonio viejo; un rechazo es otra cosa y no se disfraza de eso.
		if (mem.status === 'fulfilled') memoryStatus.value = mem.value;
		else memoryError.value = String(mem.reason);
	};

	// El consentimiento vive en `vasak-permissions` (bus del sistema), no en el
	// demonio: se puede leer y cambiar aunque el servicio esté apagado.
	//
	// `loadConsent` corre desde el montaje, desde `refresh` y desde el recargo al
	// final de `toggleConsent`, sin orden entre sí. Se numera cada lectura y sólo
	// se aplica la última: una lectura vieja que termina después no pisa a una
	// nueva. Un fallo no borra lo último bueno; sólo avisa.
	let consentRequest = 0;
	const loadConsent = async () => {
		const seq = ++consentRequest;
		try {
			const decisions = await deps.decisions();
			if (seq !== consentRequest) return;
			consent.value = decisions;
			consentLoaded.value = true;
			consentError.value = '';
		} catch (err) {
			// Fallo de lectura, no de cambio: su propio mensaje, no «no se pudo cambiar».
			if (seq === consentRequest) consentError.value = messages.errorConsentRead(String(err));
		}
	};

	const refresh = async () => {
		await loadConfig();
		try {
			unit.value = await deps.unitState();
		} catch (err) {
			unit.value = null;
			error.value = messages.errorService(String(err));
		}
		await Promise.all([loadConsent(), loadDaemon()]);
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

	const toggleConsent = (domain: string, allowed: boolean) => {
		const resource = CONSENT_RESOURCE[domain as keyof typeof CONSENT_RESOURCE];
		if (!resource) return Promise.resolve();
		return run(messages.errorConsent, async () => {
			await deps.setConsent(resource, allowed);
			await loadConsent();
			// La disponibilidad del dominio depende del permiso: que el demonio la recalcule.
			if (unit.value?.active) {
				try {
					capabilities.value = await deps.capabilities();
				} catch {
					// Deja la última lectura; el consentimiento ya quedó bien.
				}
			}
		});
	};

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

	// El demonio lee `lince_files_roots` al arrancar, así que un cambio de
	// carpetas reinicia el servicio si corre, como el del modelo.
	const saveFilesRoots = (roots: string[]) =>
		run(messages.errorSaving, async () => {
			await persist({ filesRoots: roots });
			try {
				if (unit.value?.active) await deps.restart();
			} catch (err) {
				// El archivo ya tiene las carpetas nuevas; que `config` no quede atrás
				// o la próxima edición restauraría lo recién sacado.
				await loadConfig();
				throw err;
			}
			await refresh();
			succeed();
		});

	const addFilesRoot = async () => {
		let dir: string | null;
		try {
			dir = await deps.pickFolder();
		} catch (err) {
			error.value = messages.errorSaving(String(err));
			return;
		}
		if (!dir || config.value.filesRoots.includes(dir)) return;
		await saveFilesRoots([...config.value.filesRoots, dir]);
	};

	const removeFilesRoot = (path: string) =>
		saveFilesRoots(config.value.filesRoots.filter((root) => root !== path));

	const refreshMemory = async () => {
		try {
			memoryStatus.value = await deps.memoryStatus();
			memoryError.value = '';
		} catch (err) {
			// Sin pisar `error`: puede ser el de la operación que acaba de fallar.
			memoryStatus.value = undefined;
			memoryError.value = String(err);
		}
	};

	const toggleMemory = async (enabled: boolean) => {
		if (busy.value) return;
		await run(messages.errorMemory, async () => {
			try {
				await deps.setMemoryEnabled(enabled);
			} finally {
				await refreshMemory();
			}
		});
	};

	const clearMemory = () => {
		confirmingClear.value = true;
	};
	const cancelClear = () => {
		confirmingClear.value = false;
	};
	const confirmClear = async () => {
		if (busy.value || !confirmingClear.value) return;
		confirmingClear.value = false;
		await run(messages.errorMemory, async () => {
			try {
				await deps.clearMemory();
			} finally {
				await refreshMemory();
			}
		});
	};

	return {
		unit,
		status,
		capabilities,
		consent,
		consentLoaded,
		consentError,
		models,
		hasKey,
		memoryStatus,
		memoryError,
		confirmingClear,
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
		toggleConsent,
		saveName,
		saveModel,
		saveKey,
		addFilesRoot,
		removeFilesRoot,
		toggleMemory,
		clearMemory,
		cancelClear,
		confirmClear,
	};
}
