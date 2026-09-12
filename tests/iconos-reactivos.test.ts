/**
 * Que un icono reactivo no deje nada colgado, y que nadie vuelva a pedir uno
 * donde no se puede.
 *
 * `useReactiveIcon` y `useReactiveSymbol` anotan una función en un conjunto del
 * módulo para volver a resolver el icono cuando cambia el tema, y lo único que
 * la saca de ahí es el `onUnmounted` del componente que la puso. O sea que fuera
 * del `setup` de un componente no hay quien la saque: la función queda para
 * siempre, apuntando a un `ref` que nadie mira.
 *
 * Pasaba en «Cuentas en Línea», que resolvía el icono de cada proveedor llamando
 * al composable dentro de `resolverIconos` —una función, que además vuelve a
 * correr con cada recarga del catálogo—. Sumaba un proveedor de fuga por
 * recarga, y encima no servía: lo que la plantilla dibujaba era una copia hecha
 * en el momento, así que al cambiar el tema los refrescos actualizaban `ref`
 * muertos y las tarjetas se quedaban con la variante anterior.
 *
 * Son dos pruebas: que el composable ya no anote nada cuando no hay componente,
 * y que ningún archivo lo llame desde adentro de una función.
 */

import { describe, expect, mock, spyOn, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/**
 * Las suscripciones al evento del tema que llegaron a pedirse.
 *
 * Es la forma de mirar el conjunto privado del módulo sin abrirlo: se suscribe
 * la primera vez que se anota una función, así que si nunca se suscribió es que
 * nunca anotó nada.
 */
const suscripciones: Array<(...args: unknown[]) => void> = [];

mock.module('@tauri-apps/api/event', () => ({
	listen: async (_evento: string, cb: (...args: unknown[]) => void) => {
		suscripciones.push(cb);
		return () => {};
	},
}));

mock.module('@vasakgroup/plugin-vicons', () => ({
	getIconSource: async (nombre: string) => `icono:${nombre}`,
	getSymbolSource: async (nombre: string) => `simbolo:${nombre}`,
}));

const { useReactiveSymbol } = await import('../src/composables/useReactiveIcon');

describe('useReactiveSymbol fuera del setup', () => {
	test('no anota nada, y avisa', async () => {
		const aviso = spyOn(console, 'warn').mockImplementation(() => {});

		const [simbolo, refrescar] = useReactiveSymbol('google-symbolic');
		await refrescar();

		// El icono se resuelve igual: lo que se pierde es el seguimiento del tema,
		// no el icono. Quien llame así tiene que refrescarlo por su cuenta.
		expect(simbolo.value).toBe('simbolo:google-symbolic');
		expect(suscripciones).toHaveLength(0);
		expect(aviso).toHaveBeenCalled();

		aviso.mockRestore();
	});
});

/**
 * El módulo que los define, que obviamente los nombra y no los llama.
 *
 * La regla es sobre quién los usa: `export function useReactiveIcon(` también
 * casa con la búsqueda, y dentro del propio módulo no significa nada.
 */
const DONDE_SE_DEFINEN = join('src', 'composables', 'useReactiveIcon.ts');

/** Todos los `.vue` y `.ts` de `src`. */
function fuentes(dir: string): string[] {
	const salida: string[] = [];
	for (const entrada of readdirSync(dir)) {
		const ruta = join(dir, entrada);
		if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
		else if (entrada.endsWith('.vue') || entrada.endsWith('.ts')) salida.push(ruta);
	}
	return salida;
}

/**
 * El archivo con todo lo que no es código puesto en blanco.
 *
 * En blanco y no borrado —espacios, respetando los saltos de línea— para que las
 * posiciones sigan siendo las del archivo y el número de línea del informe sea
 * el de verdad. Se blanquean la plantilla y los estilos de un `.vue`, los
 * comentarios y el contenido de las cadenas: adentro puede haber llaves, y las
 * llaves son lo único que se cuenta.
 */
function soloCodigo(ruta: string): string {
	const texto = readFileSync(ruta, 'utf8');
	const letras = texto.split('');

	const blanquear = (desde: number, hasta: number) => {
		for (let i = desde; i < Math.min(hasta, letras.length); i++) {
			if (letras[i] !== '\n') letras[i] = ' ';
		}
	};

	if (ruta.endsWith('.vue')) {
		const guion = texto.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		if (guion?.index === undefined) return '';
		const desde = guion.index + guion[0].indexOf('>') + 1;
		blanquear(0, desde);
		blanquear(desde + guion[1].length, texto.length);
	}

	let i = 0;
	while (i < texto.length) {
		const c = texto[i];
		if (c === '/' && texto[i + 1] === '/') {
			const fin = texto.indexOf('\n', i);
			const hasta = fin === -1 ? texto.length : fin;
			blanquear(i, hasta);
			i = hasta;
		} else if (c === '/' && texto[i + 1] === '*') {
			const fin = texto.indexOf('*/', i + 2);
			const hasta = fin === -1 ? texto.length : fin + 2;
			blanquear(i, hasta);
			i = hasta;
		} else if (c === '"' || c === "'" || c === '`') {
			let j = i + 1;
			while (j < texto.length && texto[j] !== c) {
				if (texto[j] === '\\') j++;
				j++;
			}
			blanquear(i, j + 1);
			i = j + 1;
		} else {
			i++;
		}
	}

	return letras.join('');
}

/**
 * Si esa llave abre el cuerpo de una función.
 *
 * Lo que importa no es estar dentro de unas llaves sino dentro de algo que corre
 * más tarde: el `for` de `SpecialKeysCard`, que crea un icono por tecla, está
 * entre llaves y corre durante el `setup` igual que si no lo estuviera.
 */
function abreUnaFuncion(codigo: string, llave: number): boolean {
	const antes = codigo.slice(0, llave).trimEnd();
	if (antes.endsWith('=>')) return true;
	if (!antes.endsWith(')')) return false;

	let profundidad = 0;
	let i = antes.length - 1;
	for (; i >= 0; i--) {
		if (antes[i] === ')') profundidad++;
		else if (antes[i] === '(' && --profundidad === 0) break;
	}
	if (i < 0) return false;

	const palabra = antes
		.slice(0, i)
		.trimEnd()
		.match(/([A-Za-z_$][\w$]*)$/);
	return !palabra || !/^(if|for|while|switch|catch)$/.test(palabra[1]);
}

/** Si esa posición cae dentro del cuerpo de alguna función. */
function dentroDeUnaFuncion(codigo: string, posicion: number): boolean {
	const pila: boolean[] = [];
	for (let i = 0; i < posicion; i++) {
		if (codigo[i] === '{') pila.push(abreUnaFuncion(codigo, i));
		else if (codigo[i] === '}') pila.pop();
	}
	return pila.includes(true);
}

describe('dónde se llama a los composables de icono', () => {
	test('nunca desde adentro de una función', () => {
		const llamadas: string[] = [];
		const tardias: string[] = [];

		for (const ruta of fuentes(join(RAIZ, 'src'))) {
			if (relative(RAIZ, ruta) === DONDE_SE_DEFINEN) continue;

			const codigo = soloCodigo(ruta);
			for (const uso of codigo.matchAll(/\buseReactive(?:Icon|Symbol)\s*\(/g)) {
				const linea = codigo.slice(0, uso.index).split('\n').length;
				const donde = `${relative(RAIZ, ruta)}:${linea}`;
				llamadas.push(donde);
				if (dentroDeUnaFuncion(codigo, uso.index)) tardias.push(donde);
			}
		}

		// Si un día dejan de usarse, esta prueba no tiene que seguir pasando sola.
		expect(llamadas.length).toBeGreaterThan(0);
		expect(tardias).toEqual([]);
	});
});
