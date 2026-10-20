/**
 * La sección `assistant` de `vasak.conf`, que lee `vasak-assistant` al arrancar.
 *
 * El archivo se puede editar a mano, así que cada clave se comprueba por tipo
 * (como en `config-values`). Escribir conserva las claves ajenas, de la raíz y
 * de la sección: la comparten con el demonio.
 */

import { configBoolean } from '@/utils/config-values';

export const DEFAULT_ASSISTANT_NAME = 'Lince';
export const ASSISTANT_NAME_MAX = 32;

export const ASSISTANT_PROVIDERS = ['ollama', 'openai'] as const;
export type AssistantBackend = (typeof ASSISTANT_PROVIDERS)[number];

/** Las URL que el demonio usa si la clave falta. */
export const DEFAULT_URLS: Record<AssistantBackend, string> = {
	ollama: 'http://127.0.0.1:11434',
	openai: 'http://127.0.0.1:8080/v1',
};

export interface AssistantConfig {
	name: string;
	backend: AssistantBackend;
	url: string;
	model: string;
	allowRemote: boolean;
}

/** Lo que el formulario del modelo edita; `remote` es «Proveedor remoto» (allow_remote). */
export interface ModelDraft {
	backend: string;
	url: string;
	model: string;
	remote: boolean;
}

const isBackend = (value: unknown): value is AssistantBackend =>
	(ASSISTANT_PROVIDERS as readonly unknown[]).includes(value);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sectionOf = (config: unknown): Record<string, unknown> => {
	const section =
		config && typeof config === 'object'
			? (config as Record<string, unknown>).assistant
			: undefined;
	return section && typeof section === 'object' ? (section as Record<string, unknown>) : {};
};

/**
 * El nombre listo para guardar, `''` si quedó vacío (vale «Lince») o `null` si no
 * sirve: más de 32 caracteres o caracteres de control.
 */
export function normalizeAssistantName(raw: string): string | null {
	const name = raw.trim();
	if (Array.from(name).length > ASSISTANT_NAME_MAX) return null;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: justamente lo que se rechaza
	if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
	return name;
}

export function readAssistantConfig(config: unknown): AssistantConfig {
	const section = sectionOf(config);
	const backend = isBackend(section.backend) ? section.backend : 'ollama';
	const name = typeof section.name === 'string' ? normalizeAssistantName(section.name) : null;
	return {
		name: name || DEFAULT_ASSISTANT_NAME,
		backend,
		url: text(section.url) || DEFAULT_URLS[backend],
		model: text(section.model),
		allowRemote: configBoolean(section.allow_remote, false),
	};
}

export interface AssistantPatch {
	name?: string;
	backend?: AssistantBackend;
	url?: string;
	model?: string;
	allowRemote?: boolean;
}

/**
 * Aplica `patch` sobre `config.assistant`. Lo que no viene en el parche no se toca;
 * una cadena vacía borra la clave (el demonio usa su valor por omisión).
 */
export function writeAssistantConfig(
	config: Record<string, unknown>,
	patch: AssistantPatch
): Record<string, unknown> {
	const section = { ...sectionOf(config) };
	const strings: [keyof AssistantPatch, string][] = [
		['name', 'name'],
		['backend', 'backend'],
		['url', 'url'],
		['model', 'model'],
	];
	for (const [from, key] of strings) {
		const value = patch[from];
		if (value === undefined) continue;
		const clean = String(value).trim();
		if (clean) section[key] = clean;
		else delete section[key];
	}
	if (patch.allowRemote !== undefined) section.allow_remote = patch.allowRemote;
	config.assistant = section;
	return config;
}

/** `localhost` o loopback (127/8, `::1`). Una URL ilegible no es local. */
export function isLoopbackHost(url: string): boolean {
	let host: string;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	if (host === 'localhost' || host.endsWith('.localhost')) return true;
	if (host === '[::1]') return true;
	const octets = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	return !!octets && Number(octets[1]) === 127 && octets.slice(1).every((o) => Number(o) <= 255);
}

/** Claves i18n de lo que está mal en el borrador; vacío si se puede guardar. */
export function validateModelDraft(draft: ModelDraft): string[] {
	const errors: string[] = [];
	const key = (name: string) => `views.assistant.errors.${name}`;
	if (!isBackend(draft.backend)) errors.push(key('backend'));
	let parsed: URL | null = null;
	try {
		parsed = new URL(draft.url.trim());
	} catch {
		parsed = null;
	}
	if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
		errors.push(key('url'));
		return errors;
	}
	if (parsed.username || parsed.password) errors.push(key('urlUser'));
	const loopback = isLoopbackHost(parsed.href);
	if (draft.remote && !loopback) {
		if (parsed.protocol !== 'https:') errors.push(key('remoteHttps'));
		if (!draft.model.trim()) errors.push(key('remoteModel'));
	}
	if (!draft.remote && !loopback) errors.push(key('localHost'));
	return errors;
}
