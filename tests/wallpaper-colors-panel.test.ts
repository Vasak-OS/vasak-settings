import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { PaletteColor } from '@vasakgroup/plugin-config-manager';
import { mount, type VueWrapper } from '@vue/test-utils';
import SchemeColorEditor from '@/components/scheme/SchemeColorEditor.vue';
import WallpaperColorsPanel from '@/components/scheme/WallpaperColorsPanel.vue';
import type { SchemeFile } from '@/types/scheme';

/**
 * Lo que se ve de «Seguir al fondo»: el panel con la vista previa y los
 * candados del editor. Como en `scheme-components.test.ts`, no se miran
 * textos —dependen del doble del i18n— sino lo que se emite y lo que se marca.
 */

const FIXTURE = new URL('./fixtures/scheme-vasak-default.json', import.meta.url);
const scheme = (): SchemeFile => JSON.parse(readFileSync(FIXTURE, 'utf8')) as SchemeFile;

const mounted: VueWrapper[] = [];
function mountAttached(component: Parameters<typeof mount>[0], options: Record<string, unknown>) {
	const wrapper = mount(component, {
		attachTo: document.body,
		global: { stubs: { ThemeIcon: true } },
		...options,
	} as never);
	mounted.push(wrapper);
	return wrapper;
}

afterEach(() => {
	for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

const color = (hex: string, x: number, y: number, population: number): PaletteColor => ({
	hex,
	x,
	y,
	population,
	lightness: 0.5,
	chroma: 0.1,
	hue: 180,
});

const palette = [color('#1e6e5a', 0.3, 0.7, 0.6), color('#a8c8d2', 0.5, 0.15, 0.4)];

describe('WallpaperColorsPanel', () => {
	const props = {
		follow: false,
		wallpaperPath: '/fondos/bosque.jpg',
		thumbnail: 'asset://bosque.jpg',
		palette,
		accentSource: palette[0],
	};

	test('marca cada color donde está en la imagen, y el del acento resaltado', () => {
		const wrapper = mountAttached(WallpaperColorsPanel, { props });
		const dots = wrapper.findAll('[data-palette-dot]');
		expect(dots).toHaveLength(2);
		const first = dots[0]?.element as HTMLElement;
		expect(first.style.left).toBe('30.0%');
		expect(first.style.top).toBe('70.0%');
		expect(dots[0]?.classes()).toContain('ring-primary');
		expect(dots[1]?.classes()).not.toContain('ring-primary');
	});

	test('el interruptor emite el estado nuevo', async () => {
		const wrapper = mountAttached(WallpaperColorsPanel, { props });
		await wrapper.get('[role="switch"]').trigger('click');
		expect(wrapper.emitted('update:follow')).toEqual([[true]]);
	});

	test('«Volver a sacar del fondo» emite el recálculo', async () => {
		const wrapper = mountAttached(WallpaperColorsPanel, { props });
		await wrapper.get('[data-regenerate]').trigger('click');
		expect(wrapper.emitted('regenerate')).toHaveLength(1);
	});

	test('sin fondo no hay vista previa ni recálculo, y el interruptor no se puede tocar', () => {
		const wrapper = mountAttached(WallpaperColorsPanel, {
			props: { ...props, wallpaperPath: '', thumbnail: '', palette: [] },
		});
		expect(wrapper.find('[data-wallpaper-preview]').exists()).toBe(false);
		expect(wrapper.find('[data-regenerate]').exists()).toBe(false);
		expect(
			wrapper.get('[role="switch"]').attributes('aria-disabled') ??
				wrapper.get('[role="switch"]').attributes('disabled')
		).toBeDefined();
	});
});

describe('SchemeColorEditor con colores fijados', () => {
	test('sólo los fijados llevan «Soltar», y soltar emite el camino del color', async () => {
		const wrapper = mountAttached(SchemeColorEditor, {
			props: { scheme: scheme(), initialVariant: 'dark', pinned: { dark: ['ui.color.primary'] } },
		});
		const unpin = wrapper.findAll('[data-unpin]');
		expect(unpin).toHaveLength(1);
		expect(wrapper.get('[data-swatch="primary"]').find('[data-unpin]').exists()).toBe(true);

		await unpin[0]?.trigger('click');
		expect(wrapper.emitted('unpin')).toEqual([['dark', 'ui.color.primary']]);
	});

	test('los fijados son por variante', () => {
		const wrapper = mountAttached(SchemeColorEditor, {
			props: { scheme: scheme(), initialVariant: 'light', pinned: { dark: ['ui.color.primary'] } },
		});
		expect(wrapper.findAll('[data-unpin]')).toHaveLength(0);
	});
});
