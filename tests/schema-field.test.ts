import { describe, expect, test } from 'bun:test';
import type { SchemaNode } from '../src/utils/fastfetch-schema';
import { blankFor, branchLabel, matchingBranch, schemaKind } from '../src/utils/schema-field';

describe('schemaKind', () => {
	test('una unión gana sobre el type', () => {
		expect(schemaKind({ type: 'boolean', oneOf: [{ type: 'boolean' }, { type: 'object' }] })).toBe(
			'union'
		);
	});

	test('mapea los tipos básicos', () => {
		expect(schemaKind({ type: 'boolean' })).toBe('boolean');
		expect(schemaKind({ type: 'integer' })).toBe('number');
		expect(schemaKind({ type: 'number' })).toBe('number');
		expect(schemaKind({ type: 'object' })).toBe('object');
		expect(schemaKind({ type: 'array' })).toBe('array');
		expect(schemaKind({ type: 'string' })).toBe('string');
	});

	test('un type como arreglo toma el primero que no sea null', () => {
		expect(schemaKind({ type: ['string', 'null'] })).toBe('string');
	});

	test('sin type es texto', () => {
		expect(schemaKind({})).toBe('string');
	});
});

describe('blankFor', () => {
	test('respeta el default del schema', () => {
		expect(blankFor({ type: 'boolean', default: true })).toBe(true);
	});

	test('valores en blanco por tipo', () => {
		expect(blankFor({ type: 'boolean' })).toBe(false);
		expect(blankFor({ type: 'number' })).toBe(0);
		expect(blankFor({ type: 'number', minimum: 2 })).toBe(2);
		expect(blankFor({ type: 'object' })).toEqual({});
		expect(blankFor({ type: 'array' })).toEqual([]);
		expect(blankFor({ type: 'string' })).toBe('');
	});
});

describe('matchingBranch', () => {
	const branches: SchemaNode[] = [{ type: 'boolean' }, { type: 'object' }];

	test('un booleano cae en la rama booleana', () => {
		expect(matchingBranch(branches, true)).toBe(0);
	});

	test('un objeto cae en la rama objeto', () => {
		expect(matchingBranch(branches, { a: 1 })).toBe(1);
	});

	test('sin valor, la primera', () => {
		expect(matchingBranch(branches, undefined)).toBe(0);
	});

	test('si ninguna matchea, la primera', () => {
		expect(matchingBranch([{ type: 'number' }], 'texto')).toBe(0);
	});
});

describe('branchLabel', () => {
	const t = (key: string) => key;

	test('usa el título del schema si lo hay', () => {
		expect(branchLabel({ title: 'CPU', type: 'object' }, t)).toBe('CPU');
	});

	test('si no, una etiqueta por tipo', () => {
		expect(branchLabel({ type: 'boolean' }, t)).toBe('views.fastfetch.schema.branchBoolean');
		expect(branchLabel({ type: 'object' }, t)).toBe('views.fastfetch.schema.branchObject');
	});
});
