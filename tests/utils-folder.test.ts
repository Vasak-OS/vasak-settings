/**
 * Que las funciones puras vivan en una sola carpeta: `src/utils/`.
 *
 * Hasta el 30/09/2026 había dos, `src/tools/` y `src/utils/`, con el mismo
 * tipo de archivo en cada una, y quien buscaba un ayudante tenía que mirar en
 * las dos. Se mudó todo a `src/utils/`; esto vigila que no vuelva a nacer la
 * segunda, ni un import que apunte a ella.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** Todos los `.ts` y `.vue` bajo una carpeta. */
function sourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
		else if (/\.(ts|vue)$/.test(entry)) files.push(path);
	}
	return files;
}

describe('una sola carpeta de ayudantes', () => {
	test('no existe src/tools', () => {
		expect(existsSync(join(ROOT, 'src/tools'))).toBe(false);
	});

	test('ningún archivo importa de tools/', () => {
		const offenders = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'tests'))]
			.filter((file) => !file.endsWith('utils-folder.test.ts'))
			.filter((file) =>
				/from\s+['"](?:@\/|(?:\.\.\/)+src\/)tools\//.test(readFileSync(file, 'utf8'))
			);
		expect(offenders).toEqual([]);
	});

	test('los ayudantes mudados están en src/utils', () => {
		for (const name of [
			'config-values',
			'csp',
			'custom-scheme',
			'permissions-by-resource',
			'privacy-resources',
			'provider-icon',
		]) {
			expect(existsSync(join(ROOT, 'src/utils', `${name}.ts`))).toBe(true);
		}
	});
});
