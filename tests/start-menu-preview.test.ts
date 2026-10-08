import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import StartMenuPreview from '@/components/startmenu/StartMenuPreview.vue';
import { MENU_VARIANTS } from '@/utils/config-values';

/**
 * La vista previa del menú.
 *
 * Es una ilustración: no llama al backend ni usa iconos del tema, así que se
 * monta a secas. Lo que se cuida no es cómo se ve —eso se mira con las capturas—
 * sino que **cada variante dibuje su esqueleto** y que las opciones enciendan y
 * apaguen los pedazos que les tocan. Si un `v-if` se rompiera, el dibujo quedaría
 * igual para todas las variantes y nadie se enteraría.
 */

const mounted: VueWrapper[] = [];

function render(props: Record<string, unknown>) {
	const base = {
		variant: 'compact',
		widget: 'weather',
		showUser: true,
		showSessionActions: true,
		searchPosition: 'top',
		showPlaces: false,
		showFavorites: false,
		hero: false,
		label: 'preview',
		...props,
	};
	const view = mount(StartMenuPreview, { props: base as never });
	mounted.push(view);
	return view;
}

afterEach(() => {
	for (const view of mounted.splice(0)) view.unmount();
});

describe('cada variante dibuja su esqueleto', () => {
	for (const variant of MENU_VARIANTS) {
		test(`«${variant}» marca su variante en la raíz`, () => {
			const view = render({ variant });
			const root = view.get('[data-testid="start-menu-preview"]');
			expect(root.attributes('data-variant')).toBe(variant);
		});
	}

	test('la grilla y los mosaicos dibujan celdas; el clásico y los favoritos, una barra lateral', () => {
		expect(
			render({ variant: 'grid' }).findAll('[data-testid="preview-tile"]').length
		).toBeGreaterThan(0);
		expect(
			render({ variant: 'tiles' }).findAll('[data-testid="preview-tile"]').length
		).toBeGreaterThan(0);
		expect(render({ variant: 'classic' }).find('[data-testid="preview-sidebar"]').exists()).toBe(
			true
		);
	});
});

describe('las opciones encienden y apagan sus pedazos', () => {
	test('el nombre de la variante es el nombre accesible del dibujo', () => {
		const view = render({ variant: 'grid', label: 'Grilla' });
		expect(view.get('[data-testid="start-menu-preview"]').attributes('aria-label')).toBe('Grilla');
	});

	test('el widget se dibuja en el compacto salvo cuando es «none»', () => {
		expect(
			render({ variant: 'compact', widget: 'weather' })
				.find('[data-testid="preview-widget"]')
				.exists()
		).toBe(true);
		expect(
			render({ variant: 'compact', widget: 'none' }).find('[data-testid="preview-widget"]').exists()
		).toBe(false);
	});

	test('la tarjeta de usuario aparece sólo con showUser', () => {
		expect(
			render({ variant: 'compact', showUser: true }).find('[data-testid="preview-user"]').exists()
		).toBe(true);
		expect(
			render({ variant: 'compact', showUser: false }).find('[data-testid="preview-user"]').exists()
		).toBe(false);
	});

	test('el buscador se dibuja una sola vez, del lado que se pida', () => {
		const top = render({ searchPosition: 'top' });
		const bottom = render({ searchPosition: 'bottom' });
		expect(top.findAll('[data-testid="preview-search"]')).toHaveLength(1);
		expect(bottom.findAll('[data-testid="preview-search"]')).toHaveLength(1);
	});

	test('el encabezado hero aparece sólo cuando está encendido', () => {
		expect(render({ hero: true }).find('[data-testid="preview-hero"]').exists()).toBe(true);
		expect(render({ hero: false }).find('[data-testid="preview-hero"]').exists()).toBe(false);
	});

	test('las acciones de sesión aparecen sólo con showSessionActions', () => {
		expect(
			render({ showSessionActions: true }).find('[data-testid="preview-session"]').exists()
		).toBe(true);
		expect(
			render({ showSessionActions: false }).find('[data-testid="preview-session"]').exists()
		).toBe(false);
	});

	test('los lugares aparecen en el clásico sólo con showPlaces', () => {
		expect(
			render({ variant: 'classic', showPlaces: true })
				.find('[data-testid="preview-places"]')
				.exists()
		).toBe(true);
		expect(
			render({ variant: 'classic', showPlaces: false })
				.find('[data-testid="preview-places"]')
				.exists()
		).toBe(false);
	});
});

describe('el tamaño del menú se refleja en el marco', () => {
	test('por omisión es «normal»', () => {
		const root = render({}).get('[data-testid="start-menu-preview"]');
		expect(root.attributes('data-display-mode')).toBe('normal');
	});

	test('cada modo marca la raíz y ajusta el ancho del marco', () => {
		for (const mode of ['normal', 'full', 'compact'] as const) {
			const root = render({ displayMode: mode }).get('[data-testid="start-menu-preview"]');
			expect(root.attributes('data-display-mode')).toBe(mode);
		}
		// Se mira el marco, no la raíz: la raíz lleva `w-full` en todos los modos,
		// así que afirmarlo ahí pasaría aunque el marco dejara de ensancharse.
		const frameClasses = (mode: 'normal' | 'full' | 'compact') =>
			render({ displayMode: mode }).get('[data-testid="preview-frame"]').classes();
		// Completo va de borde a borde; compacto se encoge y se centra.
		expect(frameClasses('full')).toContain('w-full');
		expect(frameClasses('compact')).toContain('mx-auto');
		expect(frameClasses('full')).not.toContain('mx-auto');
	});
});
