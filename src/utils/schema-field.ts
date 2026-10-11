/**
 * La lógica pura del renderer de campos del schema, aparte del `.vue` para poder
 * probarla: clasificar un nodo, armar su valor en blanco, y en una unión elegir
 * qué rama corresponde al valor actual.
 */

import type { SchemaNode } from './fastfetch-schema';

export type FieldKind = 'union' | 'boolean' | 'number' | 'object' | 'array' | 'string';

/** El primer `type` que no sea `null` (el schema a veces da `["string","null"]`). */
function primaryType(schema: SchemaNode): string | undefined {
	if (Array.isArray(schema.type)) return schema.type.find((t) => t !== 'null');
	return schema.type;
}

/** Con qué control se dibuja un nodo. Una unión gana sobre todo lo demás. */
export function schemaKind(schema: SchemaNode): FieldKind {
	if (schema.oneOf?.length || schema.anyOf?.length) return 'union';
	switch (primaryType(schema)) {
		case 'boolean':
			return 'boolean';
		case 'integer':
		case 'number':
			return 'number';
		case 'object':
			return 'object';
		case 'array':
			return 'array';
		default:
			return 'string';
	}
}

/** El valor en blanco de un nodo: para un elemento nuevo de un arreglo o al
 *  cambiar de rama en una unión. Respeta el `default` del schema si lo hay. */
export function blankFor(schema: SchemaNode): unknown {
	if (schema.default !== undefined) return schema.default;
	switch (schemaKind(schema)) {
		case 'boolean':
			return false;
		case 'number':
			return typeof schema.minimum === 'number' ? schema.minimum : 0;
		case 'object':
			return {};
		case 'array':
			return [];
		case 'union':
			return undefined;
		default:
			return '';
	}
}

/** El tipo JS de un valor, en los términos del schema. */
function valueType(value: unknown): string {
	if (Array.isArray(value)) return 'array';
	if (value === null) return 'null';
	return typeof value;
}

/** En una unión, el índice de la rama que corresponde al valor actual. Si
 *  ninguna matchea (p. ej. valor vacío), la primera. */
export function matchingBranch(branches: SchemaNode[], value: unknown): number {
	if (value === undefined || value === null) return 0;
	const vt = valueType(value);
	const index = branches.findIndex((branch) => {
		const kind = schemaKind(branch);
		if (kind === 'number') return vt === 'number';
		if (kind === 'boolean') return vt === 'boolean';
		if (kind === 'object') return vt === 'object';
		if (kind === 'array') return vt === 'array';
		return vt === 'string';
	});
	return index >= 0 ? index : 0;
}

/** El nombre de una rama de unión: su título del schema, o uno por tipo. */
export function branchLabel(branch: SchemaNode, t: (key: string) => string): string {
	if (branch.title) return branch.title;
	switch (schemaKind(branch)) {
		case 'boolean':
			return t('views.fastfetch.schema.branchBoolean');
		case 'number':
			return t('views.fastfetch.schema.branchNumber');
		case 'object':
			return t('views.fastfetch.schema.branchObject');
		case 'array':
			return t('views.fastfetch.schema.branchArray');
		default:
			return t('views.fastfetch.schema.branchString');
	}
}
