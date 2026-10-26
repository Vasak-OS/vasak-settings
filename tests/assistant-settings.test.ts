/**
 * `useAssistantSettings`: la lógica de la pantalla «Asistente».
 *
 * Las dependencias entran por parámetro (como en `screen-time-settings.test.ts`):
 * dobles que anotan lo que reciben, sin Tauri.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import {
	type AssistantDeps,
	type AssistantMessages,
	useAssistantSettings,
} from '../src/composables/useAssistantSettings';
import type {
	AssistantMemoryStatus,
	AssistantStatus,
	AssistantUnitState,
} from '../src/services/assistant.service';

const MESSAGES: AssistantMessages = {
	saved: () => 'guardado',
	errorSaving: (reason) => `no se guardó: ${reason}`,
	errorService: (reason) => `servicio: ${reason}`,
	invalidName: () => 'nombre inválido',
	emptyKey: () => 'falta la clave',
	errorMemory: (reason) => `memoria: ${reason}`,
};

const ACTIVE: AssistantUnitState = { installed: true, enabled: true, active: true, masked: false };
const INACTIVE: AssistantUnitState = { ...ACTIVE, active: false, enabled: false };

const STATUS: AssistantStatus = {
	backendAvailable: true,
	reason: '',
	model: { provider: 'ollama', name: 'llama3', local: true, host: '127.0.0.1' },
	conversations: 1,
};

const MEMORY: AssistantMemoryStatus = { enabled: false, available: true, reason: '', bytes: 4096 };

interface Fake {
	deps: AssistantDeps;
	/** Todo lo llamado, en orden, con sus argumentos. */
	log: string[];
	file: () => Record<string, unknown>;
}

function fake(
	initial: Record<string, unknown>,
	unit: AssistantUnitState,
	overrides: Partial<AssistantDeps> = {}
): Fake {
	let file = initial;
	let memory = MEMORY;
	const log: string[] = [];
	const deps: AssistantDeps = {
		read: async () => {
			log.push('read');
			return structuredClone(file) as unknown as VSKConfig;
		},
		write: async (config) => {
			log.push('write');
			file = structuredClone(config) as unknown as Record<string, unknown>;
		},
		unitState: async () => {
			log.push('unitState');
			return unit;
		},
		setEnabled: async (enabled) => {
			log.push(`setEnabled:${enabled}`);
			unit = { ...unit, enabled, active: enabled };
			return unit;
		},
		restart: async () => {
			log.push('restart');
		},
		status: async () => {
			log.push('status');
			return STATUS;
		},
		capabilities: async () => {
			log.push('capabilities');
			return [{ domain: 'web', available: true, reason: '' }];
		},
		models: async () => {
			log.push('models');
			return ['llama3'];
		},
		hasKey: async (url) => {
			log.push(`hasKey:${url}`);
			return false;
		},
		setKey: async (url) => {
			log.push(`setKey:${url}`);
		},
		memoryStatus: async () => {
			log.push('memoryStatus');
			return memory;
		},
		setMemoryEnabled: async (enabled) => {
			log.push(`setMemoryEnabled:${enabled}`);
			memory = { ...memory, enabled };
		},
		clearMemory: async () => {
			log.push('clearMemory');
			memory = { ...memory, bytes: 0 };
		},
		...overrides,
	};
	return { deps, log, file: () => file };
}

const DBUS = ['status', 'capabilities', 'models', 'memoryStatus'];
const dbusCalls = (log: string[]) => log.filter((c) => DBUS.includes(c) || c.startsWith('hasKey'));

// `succeed` deja un temporizador de 3 s; se anula para que no cuelgue la corrida.
const realSetTimeout = globalThis.setTimeout;
beforeEach(() => {
	globalThis.setTimeout = ((fn: () => void) => {
		void fn;
		return 0;
	}) as unknown as typeof setTimeout;
});
afterEach(() => {
	globalThis.setTimeout = realSetTimeout;
});

describe('useAssistantSettings: refresh', () => {
	test('con la unidad activa pide estado, capacidades, modelos y clave con la URL guardada', async () => {
		const f = fake({ assistant: { backend: 'openai', url: 'https://api.ejemplo.com/v1' } }, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(f.log).toContain('status');
		expect(f.log).toContain('capabilities');
		expect(f.log).toContain('models');
		expect(f.log).toContain('hasKey:https://api.ejemplo.com/v1');
		expect(s.status.value).toEqual(STATUS);
		expect(s.models.value).toEqual(['llama3']);
		expect(s.hasKey.value).toBe(false);
		expect(s.config.value.backend).toBe('openai');
	});

	test('con la unidad inactiva no se llama a D-Bus', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(dbusCalls(f.log)).toEqual([]);
		expect(s.status.value).toBeNull();
		expect(s.capabilities.value).toBeNull();
		expect(s.models.value).toBeNull();
		expect(s.hasKey.value).toBeUndefined();
		expect(s.unit.value).toEqual(INACTIVE);
	});

	test('si la unidad no se puede leer, queda el error del servicio y no se llama a D-Bus', async () => {
		const f = fake({}, ACTIVE, {
			unitState: async () => {
				throw new Error('sin systemctl');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.unit.value).toBeNull();
		expect(s.error.value).toContain('servicio: ');
		expect(s.error.value).toContain('sin systemctl');
		expect(dbusCalls(f.log)).toEqual([]);
	});

	test('un comando de D-Bus que falla no tira a los demás', async () => {
		const f = fake({}, ACTIVE, {
			status: async () => {
				throw new Error('no contesta');
			},
			hasKey: async () => null,
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.status.value).toBeNull();
		expect(s.capabilities.value).not.toBeNull();
		expect(s.models.value).toEqual(['llama3']);
		expect(s.hasKey.value).toBeNull();
	});

	test('un vasak.conf ilegible deja los valores de fábrica', async () => {
		const f = fake({}, INACTIVE, {
			read: async () => {
				throw new Error('roto');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.config.value.name).toBe('Lince');
		expect(s.nameDraft.value).toBe('Lince');
	});
});

describe('useAssistantSettings: toggleService', () => {
	test('encender actualiza la unidad y consulta al demonio', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(dbusCalls(f.log)).toEqual([]);
		await s.toggleService(true);
		expect(f.log).toContain('setEnabled:true');
		expect(s.unit.value?.active).toBe(true);
		expect(s.status.value).toEqual(STATUS);
		expect(s.busy.value).toBe(false);
	});

	test('apagar vacía lo que el demonio había contestado y no lo consulta', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.status.value).not.toBeNull();
		const antes = dbusCalls(f.log).length;
		await s.toggleService(false);
		expect(s.status.value).toBeNull();
		expect(s.models.value).toBeNull();
		expect(dbusCalls(f.log)).toHaveLength(antes);
	});

	test('si systemctl falla, el error es del servicio y se suelta el ocupado', async () => {
		const f = fake({}, INACTIVE, {
			setEnabled: async () => {
				throw new Error('Access denied');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		await s.toggleService(true);
		expect(s.error.value).toContain('servicio: ');
		expect(s.error.value).toContain('Access denied');
		expect(s.busy.value).toBe(false);
	});
});

describe('useAssistantSettings: saveName', () => {
	test('un nombre inválido no escribe nada', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		s.nameDraft.value = 'x'.repeat(40);
		await s.saveName();
		expect(s.error.value).toBe('nombre inválido');
		expect(f.log).not.toContain('write');
	});

	test('guarda el nombre recortado sin tocar el resto y avisa', async () => {
		const f = fake({ style: { radius: 8 }, assistant: { model: 'm', otra: 1 } }, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		s.nameDraft.value = '  Ada ';
		await s.saveName();
		expect(f.file()).toEqual({
			style: { radius: 8 },
			assistant: { model: 'm', otra: 1, name: 'Ada' },
		});
		expect(s.successMessage.value).toBe('guardado');
		expect(s.config.value.name).toBe('Ada');
	});

	test('un nombre vacío borra la clave y vuelve al de fábrica', async () => {
		const f = fake({ assistant: { name: 'Ada' } }, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		s.nameDraft.value = '  ';
		await s.saveName();
		expect(f.file()).toEqual({ assistant: {} });
		expect(s.config.value.name).toBe('Lince');
	});

	test('si no hay vasak.conf para escribir, avisa del error', async () => {
		const f = fake({}, INACTIVE, { read: async () => null });
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.saveName();
		expect(s.error.value).toContain('no se guardó');
		expect(s.successMessage.value).toBe('');
	});
});

describe('useAssistantSettings: saveModel', () => {
	test('un borrador inválido señala los errores y no escribe ni reinicia', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		s.draft.value = { backend: 'openai', url: 'http://api.ejemplo.com', model: '', remote: true };
		await s.saveModel();
		expect(s.modelErrors.value).toEqual([
			'views.assistant.errors.remoteHttps',
			'views.assistant.errors.remoteModel',
		]);
		expect(f.log).toEqual([]);
	});

	test('escribe el modelo, conserva las claves ajenas y reinicia si el servicio corre', async () => {
		const f = fake({ style: { radius: 8 }, assistant: { name: 'Ada', futura: true } }, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		s.draft.value = {
			backend: 'openai',
			url: 'https://api.ejemplo.com/v1',
			model: 'gpt-x',
			remote: true,
		};
		await s.saveModel();
		expect(f.file()).toEqual({
			style: { radius: 8 },
			assistant: {
				name: 'Ada',
				futura: true,
				backend: 'openai',
				url: 'https://api.ejemplo.com/v1',
				model: 'gpt-x',
				allow_remote: true,
			},
		});
		expect(s.modelErrors.value).toEqual([]);
		expect(f.log.indexOf('write')).toBeLessThan(f.log.indexOf('restart'));
		expect(f.log).toContain('restart');
		expect(s.successMessage.value).toBe('guardado');
	});

	test('con el servicio apagado escribe pero no reinicia', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.draft.value = { ...s.draft.value, model: 'llama3' };
		await s.saveModel();
		expect(f.log).toContain('write');
		expect(f.log).not.toContain('restart');
		expect(s.config.value.model).toBe('llama3');
	});

	test('si el reinicio falla, el error es de guardado y no hay aviso de éxito', async () => {
		const f = fake({}, ACTIVE, {
			restart: async () => {
				throw new Error('no reinicia');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		await s.saveModel();
		expect(s.error.value).toContain('no se guardó');
		expect(s.successMessage.value).toBe('');
		expect(s.busy.value).toBe(false);
	});
});

describe('useAssistantSettings: saveKey', () => {
	const SECRET = 'sk-SECRETISIMA';

	test('una clave vacía no llama al servicio', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.keyDraft.value = '   ';
		await s.saveKey();
		expect(s.error.value).toBe('falta la clave');
		expect(f.log.some((c) => c.startsWith('setKey'))).toBe(false);
	});

	test('envía la clave con la URL guardada, no la del borrador, y vacía el campo', async () => {
		let enviada: [string, string] | null = null;
		const f = fake({ assistant: { backend: 'openai', url: 'https://guardada.com/v1' } }, ACTIVE, {
			setKey: async (url, key) => {
				enviada = [url, key];
			},
			hasKey: async () => true,
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		// Con el borrador de la URL sin guardar la clave no sale (ver canSaveKey).
		s.draft.value = { ...s.draft.value, url: 'https://sin-guardar.com/v1' };
		s.keyDraft.value = `  ${SECRET} `;
		await s.saveKey();
		expect(enviada).toBeNull();
		s.draft.value = { ...s.draft.value, url: 'https://guardada.com/v1' };
		await s.saveKey();
		expect(enviada).toEqual(['https://guardada.com/v1', SECRET]);
		expect(s.keyDraft.value).toBe('');
		expect(s.hasKey.value).toBe(true);
		expect(s.successMessage.value).toBe('guardado');
	});

	test('si el servicio la rechaza, el campo se vacía igual y el error no repite la clave', async () => {
		const f = fake({}, ACTIVE, {
			setKey: async () => {
				throw new Error('El servicio rechazó la clave');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.keyDraft.value = SECRET;
		await s.saveKey();
		expect(s.keyDraft.value).toBe('');
		expect(s.error.value).toContain('no se guardó');
		expect(s.error.value).not.toContain('SECRETISIMA');
		expect(s.successMessage.value).toBe('');
	});

	test('la clave no se escribe en ningún registro ni en vasak.conf', async () => {
		const f = fake({ assistant: { backend: 'openai' } }, ACTIVE);
		const consola: string[] = [];
		const originales = { log: console.log, error: console.error, warn: console.warn };
		for (const k of ['log', 'error', 'warn'] as const) {
			console[k] = (...args: unknown[]) => {
				consola.push(args.map(String).join(' '));
			};
		}
		try {
			const s = useAssistantSettings(MESSAGES, f.deps);
			await s.refresh();
			s.keyDraft.value = SECRET;
			await s.saveKey();
		} finally {
			Object.assign(console, originales);
		}
		expect(consola.join('\n')).not.toContain('SECRETISIMA');
		expect(JSON.stringify(f.file())).not.toContain('SECRETISIMA');
		expect(f.log.join('\n')).not.toContain('SECRETISIMA');
	});

	test('con el servicio apagado la clave no sale y el campo queda como estaba', async () => {
		let llamadas = 0;
		const f = fake({ assistant: { backend: 'openai' } }, INACTIVE, {
			setKey: async () => {
				llamadas++;
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.keyDraft.value = SECRET;
		await s.saveKey();
		expect(llamadas).toBe(0);
		expect(s.error.value).toBe('');
		expect(s.keyDraft.value).toBe(SECRET);
	});

	test('con la URL del borrador sin guardar la clave no sale', async () => {
		let llamadas = 0;
		const f = fake({ assistant: { backend: 'openai', url: 'https://guardada.com/v1' } }, ACTIVE, {
			setKey: async () => {
				llamadas++;
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.draft.value = { ...s.draft.value, url: 'https://otra.com/v1' };
		s.keyDraft.value = SECRET;
		await s.saveKey();
		expect(llamadas).toBe(0);
	});

	test('si la consulta posterior falla, queda lo que se sabía y el guardado cuenta como hecho', async () => {
		const f = fake({}, ACTIVE, {
			hasKey: async () => {
				if (f.log.some((c) => c.startsWith('setKey'))) throw new Error('sin respuesta');
				return false;
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.keyDraft.value = SECRET;
		await s.saveKey();
		expect(s.hasKey.value).toBe(false);
		expect(s.successMessage.value).toBe('guardado');
	});
});

describe('useAssistantSettings: memoria', () => {
	test('con la unidad activa pide el estado de la memoria al refrescar', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(f.log).toContain('memoryStatus');
		expect(s.memoryStatus.value).toEqual(MEMORY);
	});

	test('con la unidad inactiva no se pide y queda sin preguntar', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(f.log).not.toContain('memoryStatus');
		expect(s.memoryStatus.value).toBeUndefined();
	});

	test('un demonio viejo (null) deja la fila en «no soportado», sin error', async () => {
		const f = fake({}, ACTIVE, { memoryStatus: async () => null });
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.memoryStatus.value).toBeNull();
		expect(s.memoryError.value).toBe('');
	});

	test('una llamada rechazada guarda el motivo y no se disfraza de demonio viejo', async () => {
		const f = fake({}, ACTIVE, {
			memoryStatus: () => {
				throw new Error('llavero bloqueado');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.memoryStatus.value).toBeUndefined();
		expect(s.memoryError.value).toContain('llavero bloqueado');
		// Lo demás se cargó igual.
		expect(s.status.value).toEqual(STATUS);
	});

	test('el motivo se limpia con una lectura exitosa', async () => {
		let falla = true;
		const f = fake({}, ACTIVE, {
			memoryStatus: async () => {
				if (falla) throw new Error('sin respuesta');
				return MEMORY;
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.memoryError.value).toContain('sin respuesta');
		falla = false;
		await s.refresh();
		expect(s.memoryError.value).toBe('');
		expect(s.memoryStatus.value).toEqual(MEMORY);
	});

	test('con la unidad inactiva no queda ningún error de lectura', async () => {
		const f = fake({}, INACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		expect(s.memoryError.value).toBe('');
	});

	test('encender la memoria la pide, refresca el estado y no borra nada', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		await s.toggleMemory(true);
		expect(f.log).toEqual(['setMemoryEnabled:true', 'memoryStatus']);
		expect(s.memoryStatus.value?.enabled).toBe(true);
		expect(s.busy.value).toBe(false);
	});

	test('apagar la memoria conserva lo aprendido: no llama a borrar', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		await s.toggleMemory(true);
		f.log.length = 0;
		await s.toggleMemory(false);
		expect(f.log).toEqual(['setMemoryEnabled:false', 'memoryStatus']);
		expect(f.log).not.toContain('clearMemory');
		expect(s.memoryStatus.value?.bytes).toBe(4096);
	});

	test('si el servicio rechaza el cambio, avisa y vuelve a leer el estado real', async () => {
		const f = fake({}, ACTIVE, {
			setMemoryEnabled: async () => {
				throw new Error('llavero bloqueado');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		await s.toggleMemory(true);
		expect(s.error.value).toContain('memoria: ');
		expect(s.error.value).toContain('llavero bloqueado');
		expect(f.log).toContain('memoryStatus');
		expect(s.busy.value).toBe(false);
	});

	test('«borrar» sólo abre la confirmación: no llama al demonio', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		s.clearMemory();
		expect(s.confirmingClear.value).toBe(true);
		expect(f.log).toEqual([]);
	});

	test('cancelar cierra la confirmación y no borra', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		s.cancelClear();
		expect(s.confirmingClear.value).toBe(false);
		expect(f.log).not.toContain('clearMemory');
	});

	test('confirmar cierra el diálogo, borra y refresca el tamaño', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		f.log.length = 0;
		await s.confirmClear();
		expect(s.confirmingClear.value).toBe(false);
		expect(f.log).toEqual(['clearMemory', 'memoryStatus']);
		expect(s.memoryStatus.value?.bytes).toBe(0);
	});

	test('si borrar falla, el diálogo se cierra, avisa y vuelve a leer el estado', async () => {
		const f = fake({}, ACTIVE, {
			clearMemory: async () => {
				throw new Error('AccessDenied');
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		f.log.length = 0;
		await s.confirmClear();
		expect(s.confirmingClear.value).toBe(false);
		expect(s.error.value).toContain('memoria: ');
		expect(f.log).toContain('memoryStatus');
		expect(s.busy.value).toBe(false);
	});

	test('si la lectura posterior falla, queda el motivo y no «demonio viejo»', async () => {
		let borrada = false;
		const f = fake({}, ACTIVE, {
			clearMemory: async () => {
				borrada = true;
			},
			memoryStatus: async () => {
				if (borrada) throw new Error('sin respuesta');
				return MEMORY;
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		await s.confirmClear();
		expect(s.memoryStatus.value).toBeUndefined();
		expect(s.memoryError.value).toContain('sin respuesta');
	});

	test('confirmar sin haber abierto la confirmación no borra', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		f.log.length = 0;
		await s.confirmClear();
		expect(f.log).toEqual([]);
		expect(s.busy.value).toBe(false);
	});

	test('confirmar después de cancelar no borra', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		s.cancelClear();
		f.log.length = 0;
		await s.confirmClear();
		expect(f.log).not.toContain('clearMemory');
	});

	test('con la confirmación abierta borra una sola vez, y una segunda confirmación ya no borra', async () => {
		const f = fake({}, ACTIVE);
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		f.log.length = 0;
		await s.confirmClear();
		await s.confirmClear();
		expect(f.log.filter((c) => c === 'clearMemory')).toHaveLength(1);
	});

	test('dos «confirmar borrar» seguidos, sin esperar, borran una sola vez', async () => {
		const pendientes: Array<() => void> = [];
		let llamadas = 0;
		const f = fake({}, ACTIVE, {
			clearMemory: () => {
				llamadas++;
				return new Promise<void>((ok) => {
					pendientes.push(ok);
				});
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		s.clearMemory();
		const primera = s.confirmClear();
		const segunda = s.confirmClear();
		for (const ok of pendientes) ok();
		await Promise.all([primera, segunda]);
		expect(llamadas).toBe(1);
		expect(s.busy.value).toBe(false);
	});

	test('dos cambios de la memoria seguidos, sin esperar, se piden una sola vez', async () => {
		const pendientes: Array<() => void> = [];
		let llamadas = 0;
		const f = fake({}, ACTIVE, {
			setMemoryEnabled: () => {
				llamadas++;
				return new Promise<void>((ok) => {
					pendientes.push(ok);
				});
			},
		});
		const s = useAssistantSettings(MESSAGES, f.deps);
		await s.refresh();
		const primera = s.toggleMemory(true);
		const segunda = s.toggleMemory(true);
		for (const ok of pendientes) ok();
		await Promise.all([primera, segunda]);
		expect(llamadas).toBe(1);
		expect(s.busy.value).toBe(false);
	});
});
