/**
 * El schema de fastfetch, leído para armar el formulario.
 *
 * El editor es 100% guiado por el JSON schema de fastfetch —qué módulos hay, qué
 * opciones tiene cada uno, de qué tipo— que se **empaqueta** en
 * `assets/fastfetch-schema.json` porque el paquete de Arch no lo trae (sólo
 * presets y logos). La versión del schema tiene que seguir a la de fastfetch:
 * ver `FASTFETCH_SCHEMA_VERSION` y cómo refrescarlo.
 *
 * Estas funciones son puras —toman el schema como argumento— para poder probar la
 * resolución de `$ref` y la extracción de módulos sin cargar los 280 KB reales.
 */

/** La versión de fastfetch cuyo schema está empaquetado. Subir al subir fastfetch:
 *  curl -s https://raw.githubusercontent.com/fastfetch-cli/fastfetch/<ver>/doc/json_schema.json
 *    -o src/assets/fastfetch-schema.json  (y actualizar este número). */
export const FASTFETCH_SCHEMA_VERSION = '2.69.0';

/** Un nodo del JSON schema, con lo que este editor mira. */
export interface SchemaNode {
	type?: string | string[];
	enum?: (string | number)[];
	const?: string | number | boolean;
	properties?: Record<string, SchemaNode>;
	items?: SchemaNode;
	oneOf?: SchemaNode[];
	anyOf?: SchemaNode[];
	allOf?: SchemaNode[];
	$ref?: string;
	default?: unknown;
	description?: string;
	title?: string;
	minimum?: number;
	maximum?: number;
}

export interface RootSchema extends SchemaNode {
	$defs?: Record<string, SchemaNode>;
}

/** Un módulo: su nombre (`cpu`), su título (`CPU`), su ayuda y su sub-schema. */
export interface ModuleVariant {
	name: string;
	title: string;
	description: string;
	schema: SchemaNode;
}

/** Una opción de un módulo o del bloque display: su clave y su schema ya resuelto. */
export interface OptionField {
	key: string;
	schema: SchemaNode;
}

/** Sigue un `$ref` del tipo `#/$defs/<nombre>` una vez. Devuelve el nodo tal cual
 *  si no tiene `$ref`. */
export function resolveRef(root: RootSchema, node: SchemaNode): SchemaNode {
	if (!node.$ref) return node;
	const match = /^#\/\$defs\/(.+)$/.exec(node.$ref);
	if (!match) return node;
	const target = root.$defs?.[match[1]];
	return target ?? node;
}

/** Resuelve `$ref` en cadena hasta un nodo sin `$ref`, con tope por si hay un
 *  ciclo (no debería, pero un ciclo colgaría la ventana). */
export function deref(root: RootSchema, node: SchemaNode): SchemaNode {
	let current = node;
	for (let i = 0; i < 20 && current.$ref; i++) {
		current = resolveRef(root, current);
	}
	return current;
}

/** El nodo objeto de `modules.items` que describe un módulo configurado. */
function moduleObjectNode(root: RootSchema): SchemaNode | undefined {
	const branches = root.properties?.modules?.items?.anyOf ?? [];
	return branches.find((branch) => Array.isArray(branch.oneOf));
}

/** Todos los módulos con su schema, sacados del schema. */
export function moduleVariants(root: RootSchema): ModuleVariant[] {
	const variants = moduleObjectNode(root)?.oneOf ?? [];
	const result: ModuleVariant[] = [];
	for (const variant of variants) {
		const typeNode = variant.properties?.type;
		const name = typeNode?.const;
		if (typeof name !== 'string') continue;
		result.push({
			name,
			title: variant.title ?? name,
			description: typeNode?.description ?? '',
			schema: variant,
		});
	}
	return result;
}

/** Los nombres de módulo que se pueden poner como cadena suelta (con sus
 *  valores por omisión). Es el mismo conjunto que `moduleVariants`, por el otro
 *  camino del schema; sirve de red de seguridad. */
export function defaultModuleNames(root: RootSchema): string[] {
	const branches = root.properties?.modules?.items?.anyOf ?? [];
	const stringBranch = branches.find((branch) => Array.isArray(branch.enum));
	return (stringBranch?.enum ?? []).filter((value): value is string => typeof value === 'string');
}

/** Las opciones configurables de un módulo (todas menos `type`), ya resueltas. */
export function optionFields(root: RootSchema, variant: SchemaNode): OptionField[] {
	const props = variant.properties ?? {};
	return Object.entries(props)
		.filter(([key]) => key !== 'type')
		.map(([key, schema]) => ({ key, schema: deref(root, schema) }));
}

/** El sub-schema del bloque `display`. */
export function displayNode(root: RootSchema): SchemaNode {
	return root.properties?.display ?? {};
}

/** Las opciones del bloque `display`, ya resueltas. */
export function displayFields(root: RootSchema): OptionField[] {
	const props = displayNode(root).properties ?? {};
	return Object.entries(props).map(([key, schema]) => ({ key, schema: deref(root, schema) }));
}
