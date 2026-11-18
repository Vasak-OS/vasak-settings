/**
 * La biblioteca gestionada de fondos: al guardar, una imagen que no vive en un
 * lugar que las apps ven se importa y se guarda la copia; una ya gestionada o
 * un video no.
 *
 * Mismo doble de Tauri que `assistant-view.test.ts` (`fakeBackend`): se espía
 * `invoke`, sin `mock.module`, y el evento de soltar un archivo se dispara
 * llamando al manejador que la vista registró con `plugin:event|listen`.
 */

import { afterEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as event from '@tauri-apps/api/event';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { getLibraryWallpapers, importWallpaper } from '../src/services/style.service';
import WallpaperView from '../src/views/WallpaperView.vue';
import { type FakeBackend, fakeBackend, textsOf } from './screen-time-backend';

const OFFICIAL = '/usr/share/backgrounds/vasakos/wallpaper-1.jpg';
const LIBRARY = '/home/pato/.local/share/vasak/wallpapers/foto-10-20.webp';
const OWN_FOLDER = '/media/fondos/propio.png';
const STRANGER = '/home/pato/Descargas/foto.jpg';
const IMPORTED = '/home/pato/.local/share/vasak/wallpapers/foto-99-1.webp';

let backend: FakeBackend;
let storeSpy: Mock<typeof plugin.useConfigStore>;
let listenSpy: Mock<typeof event.listen>;
let view: VueWrapper | null = null;
let onDrop: ((event: { payload: { paths: string[] } }) => void) | null = null;

afterEach(() => {
	view?.unmount();
	view = null;
	backend?.restore();
	storeSpy?.mockRestore();
	listenSpy?.mockRestore();
	onDrop = null;
});

async function mountView(opts: { current?: string; folder?: string } = {}) {
	// `convertFileSrc` lee esta función del global nativo, que el piso de `preparar.ts` no trae.
	const internals = (globalThis as unknown as { __TAURI_INTERNALS__: Record<string, unknown> })
		.__TAURI_INTERNALS__;
	internals.convertFileSrc ??= (path: string) => `asset://localhost${path}`;
	// Y `unlisten` (al desmontar) llama a este otro.
	(window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ ??= {
		unregisterListener: () => {},
	};
	backend = fakeBackend({
		desktop: {
			wallpaper: [opts.current ?? OFFICIAL],
			...(opts.folder ? { wallpaperfolder: opts.folder } : {}),
		},
	});
	backend.handlers.get_official_wallpapers = () => [OFFICIAL];
	backend.handlers.get_library_wallpapers = () => [LIBRARY];
	backend.handlers.get_custom_wallpapers = () => [OWN_FOLDER];
	backend.handlers.allow_wallpaper_asset = (args) => String(args?.path);
	backend.handlers.wallpaper_thumbnail = (args) => String(args?.path);
	backend.handlers.import_wallpaper = () => IMPORTED;
	backend.handlers.prepare_wallpaper_video = (args) => ({
		path: `${String(args?.path)}.listo`,
		optimized: true,
		detail: '',
	});
	// Se espía `listen` y no `invoke`: otro archivo dobla `@tauri-apps/api/event`
	// entero, y el espía vale con o sin ese doble.
	listenSpy = spyOn(event, 'listen').mockImplementation((async (name: string, handler: unknown) => {
		if (name === 'tauri://drag-drop') onDrop = handler as typeof onDrop;
		return () => {};
	}) as unknown as typeof event.listen);
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
	view = mount(WallpaperView, {
		attachTo: document.body,
		global: { stubs: { ThemeIcon: true, AppIcon: true } },
	});
	await flushPromises();
	return view;
}

const drop = async (path: string) => {
	expect(onDrop).not.toBeNull();
	onDrop?.({ payload: { paths: [path] } });
	await flushPromises();
};

const save = async (wrapper: VueWrapper) => {
	const labels = textsOf('views.appearanceWallpaper.saveWallpaper');
	const button = wrapper.findAll('button').find((b) => labels.includes(b.text()));
	expect(button).toBeDefined();
	await button?.trigger('click');
	await flushPromises();
};

const importCalls = () => backend.calls.filter((c) => c.command === 'import_wallpaper');
const savedWallpaper = () =>
	(backend.writes().at(-1)?.desktop as { wallpaper: string[] } | undefined)?.wallpaper;

describe('guardar un fondo importa lo que no está gestionado', () => {
	test('una imagen de una carpeta cualquiera se importa y se guarda la ruta devuelta', async () => {
		const wrapper = await mountView();
		await drop(STRANGER);
		await save(wrapper);

		expect(importCalls()).toEqual([{ command: 'import_wallpaper', args: { path: STRANGER } }]);
		expect(savedWallpaper()).toEqual([IMPORTED]);
	});

	test('un fondo oficial no se importa', async () => {
		const wrapper = await mountView({ current: OFFICIAL });
		await save(wrapper);

		expect(importCalls()).toHaveLength(0);
		expect(savedWallpaper()).toEqual([OFFICIAL]);
	});

	test('un fondo que ya está en la biblioteca no se reimporta', async () => {
		const wrapper = await mountView();
		await drop(LIBRARY);
		await save(wrapper);

		expect(importCalls()).toHaveLength(0);
		expect(savedWallpaper()).toEqual([LIBRARY]);
	});

	test('un fondo de la carpeta propia no se importa', async () => {
		const wrapper = await mountView({ folder: '/media/fondos' });
		await drop(OWN_FOLDER);
		await save(wrapper);

		expect(importCalls()).toHaveLength(0);
		expect(savedWallpaper()).toEqual([OWN_FOLDER]);
	});

	test('un video sigue por prepare_wallpaper_video y no se importa', async () => {
		const wrapper = await mountView();
		await drop('/home/pato/Videos/loop.mp4');
		await save(wrapper);

		expect(importCalls()).toHaveLength(0);
		expect(backend.commands()).toContain('prepare_wallpaper_video');
		expect(savedWallpaper()).toEqual(['/home/pato/Videos/loop.mp4.listo']);
	});

	test('si importar falla no se guarda la ruta arbitraria', async () => {
		const wrapper = await mountView();
		backend.handlers.import_wallpaper = () => {
			throw new Error('sin espacio');
		};
		await drop(STRANGER);
		await save(wrapper);

		expect(backend.writes()).toHaveLength(0);
	});
});

describe('el servicio de la biblioteca', () => {
	test('getLibraryWallpapers pide get_library_wallpapers', async () => {
		const fake = fakeBackend({});
		fake.handlers.get_library_wallpapers = () => [LIBRARY];
		try {
			expect(await getLibraryWallpapers()).toEqual([LIBRARY]);
			expect(fake.calls).toEqual([{ command: 'get_library_wallpapers', args: undefined }]);
		} finally {
			fake.restore();
		}
	});

	test('importWallpaper pasa la ruta y devuelve la importada', async () => {
		const fake = fakeBackend({});
		fake.handlers.import_wallpaper = () => IMPORTED;
		try {
			expect(await importWallpaper(STRANGER)).toBe(IMPORTED);
			expect(fake.calls).toEqual([{ command: 'import_wallpaper', args: { path: STRANGER } }]);
		} finally {
			fake.restore();
		}
	});
});
