/** La sección `assistant` de `vasak.conf` y la validación del borrador del modelo. */

import { describe, expect, test } from 'bun:test';
import {
	ASSISTANT_NAME_MAX,
	DEFAULT_ASSISTANT_NAME,
	DEFAULT_URLS,
	isLoopbackHost,
	type ModelDraft,
	normalizeAssistantName,
	readAssistantConfig,
	validateModelDraft,
	writeAssistantConfig,
} from '../src/utils/assistant-config';

describe('normalizeAssistantName', () => {
	test('recorta los espacios', () => {
		expect(normalizeAssistantName('  Ada  ')).toBe('Ada');
	});

	test('un nombre vacío vuelve vacío: vale el de fábrica', () => {
		expect(normalizeAssistantName('')).toBe('');
		expect(normalizeAssistantName('   ')).toBe('');
	});

	test('32 caracteres entran y 33 no', () => {
		expect(normalizeAssistantName('a'.repeat(ASSISTANT_NAME_MAX))).toBe('a'.repeat(32));
		expect(normalizeAssistantName('a'.repeat(ASSISTANT_NAME_MAX + 1))).toBeNull();
	});

	test('el largo se cuenta en caracteres, no en unidades UTF-16', () => {
		expect(normalizeAssistantName('😀'.repeat(32))).toBe('😀'.repeat(32));
		expect(normalizeAssistantName('😀'.repeat(33))).toBeNull();
	});

	test('los caracteres de control se rechazan', () => {
		for (const raw of ['Li\nnce', 'Li\u0000nce', 'Li\tnce', 'Li\u007fnce', 'Li\u0085nce']) {
			expect(normalizeAssistantName(raw)).toBeNull();
		}
	});
});

describe('readAssistantConfig', () => {
	test('sin archivo o sin sección quedan los valores de fábrica', () => {
		for (const config of [null, undefined, {}, { assistant: null }, { assistant: 'x' }, 3]) {
			expect(readAssistantConfig(config)).toEqual({
				name: DEFAULT_ASSISTANT_NAME,
				backend: 'ollama',
				url: DEFAULT_URLS.ollama,
				model: '',
				allowRemote: false,
			});
		}
	});

	test('lee todas las claves de la sección', () => {
		const config = {
			assistant: {
				name: 'Ada',
				backend: 'openai',
				url: ' https://api.ejemplo.com/v1 ',
				model: ' gpt-x ',
				allow_remote: true,
			},
		};
		expect(readAssistantConfig(config)).toEqual({
			name: 'Ada',
			backend: 'openai',
			url: 'https://api.ejemplo.com/v1',
			model: 'gpt-x',
			allowRemote: true,
		});
	});

	test('la URL por omisión sigue al proveedor', () => {
		expect(readAssistantConfig({ assistant: { backend: 'openai' } }).url).toBe(DEFAULT_URLS.openai);
	});

	test('un archivo escrito a mano con tipos equivocados no rompe nada', () => {
		const config = readAssistantConfig({
			assistant: { name: 5, backend: 'otro', url: 7, model: {}, allow_remote: 'yes' },
		});
		expect(config.name).toBe(DEFAULT_ASSISTANT_NAME);
		expect(config.backend).toBe('ollama');
		expect(config.url).toBe(DEFAULT_URLS.ollama);
		expect(config.model).toBe('');
		expect(typeof config.allowRemote).toBe('boolean');
	});

	test('un nombre inválido en el archivo cae al de fábrica', () => {
		expect(readAssistantConfig({ assistant: { name: 'x'.repeat(40) } }).name).toBe('Lince');
		expect(readAssistantConfig({ assistant: { name: '   ' } }).name).toBe('Lince');
	});
});

describe('writeAssistantConfig', () => {
	test('conserva las claves ajenas, de la raíz y de la sección', () => {
		const config = {
			style: { radius: 8 },
			assistant: { name: 'Ada', futura: 'clave del demonio' },
		};
		writeAssistantConfig(config, { model: 'llama3' });
		expect(config).toEqual({
			style: { radius: 8 },
			assistant: { name: 'Ada', futura: 'clave del demonio', model: 'llama3' },
		});
	});

	test('lo que no viene en el parche no se toca', () => {
		const config = { assistant: { name: 'Ada', backend: 'openai', allow_remote: true } };
		writeAssistantConfig(config, { url: 'https://x.com' });
		expect(config.assistant).toEqual({
			name: 'Ada',
			backend: 'openai',
			allow_remote: true,
			url: 'https://x.com',
		});
	});

	test('una cadena vacía borra la clave', () => {
		const config = { assistant: { name: 'Ada', model: 'llama3' } };
		writeAssistantConfig(config, { name: '', model: '   ' });
		expect(config.assistant).toEqual({});
	});

	test('allowRemote falso se escribe: no cuenta como «sin valor»', () => {
		const config = { assistant: { allow_remote: true } };
		writeAssistantConfig(config, { allowRemote: false });
		expect(config.assistant).toEqual({ allow_remote: false });
	});

	test('crea la sección si no estaba y recorta los valores', () => {
		const config: Record<string, unknown> = {};
		writeAssistantConfig(config, { name: ' Ada ', backend: 'ollama', allowRemote: true });
		expect(config).toEqual({
			assistant: { name: 'Ada', backend: 'ollama', allow_remote: true },
		});
	});
});

describe('isLoopbackHost', () => {
	test('localhost, 127/8 y ::1 son locales', () => {
		for (const url of [
			'http://localhost:11434',
			'http://LOCALHOST',
			'http://127.0.0.1:8080/v1',
			'http://127.9.8.7',
			'http://[::1]:11434',
		]) {
			expect(isLoopbackHost(url)).toBe(true);
		}
	});

	test('lo demás no lo es, aunque lo parezca', () => {
		for (const url of [
			'https://api.openai.com',
			'http://10.0.0.5',
			'http://192.168.1.2',
			'http://128.0.0.1',
			'http://ia.localhost/v1',
			'http://localhost.evil.com',
			'http://127.0.0.1.evil.com',
			'http://notlocalhost',
			'http://[::2]',
		]) {
			expect(isLoopbackHost(url)).toBe(false);
		}
	});

	test('una URL ilegible no es local', () => {
		expect(isLoopbackHost('')).toBe(false);
		expect(isLoopbackHost('no es url')).toBe(false);
		expect(isLoopbackHost('localhost')).toBe(false);
	});
});

describe('validateModelDraft', () => {
	const ok: ModelDraft = {
		backend: 'ollama',
		url: 'http://127.0.0.1:11434',
		model: '',
		remote: false,
	};
	const key = (name: string) => `views.assistant.errors.${name}`;

	test('un borrador local sobre loopback es válido', () => {
		expect(validateModelDraft(ok)).toEqual([]);
	});

	test('un proveedor desconocido se señala', () => {
		expect(validateModelDraft({ ...ok, backend: 'otro' })).toEqual([key('backend')]);
	});

	test('una URL ilegible o de otro esquema es un solo error de url', () => {
		for (const url of ['', 'no es url', 'ftp://x.com', 'file:///etc/passwd']) {
			expect(validateModelDraft({ ...ok, url })).toEqual([key('url')]);
		}
	});

	test('la URL no puede llevar usuario ni contraseña', () => {
		expect(validateModelDraft({ ...ok, url: 'http://u:p@127.0.0.1:1' })).toContain(key('urlUser'));
		expect(validateModelDraft({ ...ok, url: 'http://u@127.0.0.1:1' })).toContain(key('urlUser'));
	});

	test('modo local con un host que no es loopback se rechaza', () => {
		expect(validateModelDraft({ ...ok, url: 'https://api.openai.com/v1' })).toEqual([
			key('localHost'),
		]);
	});

	test('modo remoto exige https y modelo', () => {
		const remote = { ...ok, backend: 'openai', remote: true };
		expect(validateModelDraft({ ...remote, url: 'http://api.ejemplo.com', model: 'm' })).toEqual([
			key('remoteHttps'),
		]);
		expect(validateModelDraft({ ...remote, url: 'https://api.ejemplo.com', model: '  ' })).toEqual([
			key('remoteModel'),
		]);
		expect(validateModelDraft({ ...remote, url: 'http://api.ejemplo.com' })).toEqual([
			key('remoteHttps'),
			key('remoteModel'),
		]);
		expect(validateModelDraft({ ...remote, url: 'https://api.ejemplo.com', model: 'm' })).toEqual(
			[]
		);
	});

	test('modo remoto sobre loopback no exige https ni modelo', () => {
		expect(validateModelDraft({ ...ok, remote: true })).toEqual([]);
	});
});
