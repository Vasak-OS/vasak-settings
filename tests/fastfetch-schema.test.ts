import { describe, expect, test } from 'bun:test';
import {
	defaultModuleNames,
	deref,
	displayFields,
	moduleVariants,
	optionFields,
	type RootSchema,
	resolveRef,
} from '../src/utils/fastfetch-schema';

/** Un schema chico con la misma forma que el de fastfetch: módulos por `anyOf`
 *  (cadena o objeto), `$defs` compartidos y un bloque `display`. */
const fake: RootSchema = {
	$defs: {
		key: { type: 'string', description: 'La clave del módulo' },
		temperature: { oneOf: [{ type: 'boolean' }, { type: 'object' }] },
	},
	properties: {
		display: {
			type: 'object',
			properties: {
				separator: { type: 'string', description: 'Separador' },
				key: { $ref: '#/$defs/key' },
			},
		},
		modules: {
			type: 'array',
			items: {
				anyOf: [
					{ type: 'string', enum: ['title', 'os', 'cpu'] },
					{
						type: 'object',
						oneOf: [
							{
								title: 'CPU',
								properties: {
									type: { const: 'cpu', description: 'Imprime la CPU' },
									temp: { $ref: '#/$defs/temperature' },
									key: { $ref: '#/$defs/key' },
								},
							},
							{
								title: 'Title',
								properties: { type: { const: 'title' } },
							},
						],
					},
				],
			},
		},
	},
};

describe('resolveRef / deref', () => {
	test('sigue un $ref a $defs', () => {
		expect(resolveRef(fake, { $ref: '#/$defs/key' }).description).toBe('La clave del módulo');
	});

	test('un nodo sin $ref vuelve igual', () => {
		const node = { type: 'string' as const };
		expect(resolveRef(fake, node)).toBe(node);
	});

	test('un $ref que no existe no revienta', () => {
		expect(resolveRef(fake, { $ref: '#/$defs/noexiste' })).toEqual({ $ref: '#/$defs/noexiste' });
	});

	test('deref corta si hubiera un ciclo', () => {
		const ciclico: RootSchema = { $defs: { a: { $ref: '#/$defs/a' } } };
		expect(() => deref(ciclico, { $ref: '#/$defs/a' })).not.toThrow();
	});
});

describe('moduleVariants', () => {
	test('saca cada módulo con nombre, título, ayuda y schema', () => {
		const variants = moduleVariants(fake);
		expect(variants.map((v) => v.name).sort()).toEqual(['cpu', 'title']);
		const cpu = variants.find((v) => v.name === 'cpu');
		expect(cpu?.title).toBe('CPU');
		expect(cpu?.description).toBe('Imprime la CPU');
	});

	test('el conjunto coincide con los nombres sueltos del otro camino', () => {
		const porObjeto = moduleVariants(fake)
			.map((v) => v.name)
			.sort();
		const porCadena = defaultModuleNames(fake)
			.filter((n) => porObjeto.includes(n))
			.sort();
		expect(porCadena).toEqual(porObjeto);
	});
});

describe('optionFields', () => {
	test('lista las opciones menos `type`, con los $ref resueltos', () => {
		const cpu = moduleVariants(fake).find((v) => v.name === 'cpu');
		if (!cpu) throw new Error('falta cpu');
		const fields = optionFields(fake, cpu.schema);
		expect(fields.map((f) => f.key).sort()).toEqual(['key', 'temp']);
		const key = fields.find((f) => f.key === 'key');
		// `key` era un $ref; tiene que venir resuelto a la definición.
		expect(key?.schema.description).toBe('La clave del módulo');
	});
});

describe('displayFields', () => {
	test('lista el bloque display con los $ref resueltos', () => {
		const fields = displayFields(fake);
		expect(fields.map((f) => f.key).sort()).toEqual(['key', 'separator']);
		expect(fields.find((f) => f.key === 'key')?.schema.type).toBe('string');
	});
});
