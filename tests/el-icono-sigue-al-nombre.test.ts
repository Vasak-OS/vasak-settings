/**
 * Que un icono cambie cuando cambia lo que representa.
 *
 * Esta ventana resolvía los iconos con un composable propio que pedía el icono
 * **una vez** y no miraba el nombre. Por eso todo lo que cambiaba de icono
 * llevaba su propio andamiaje: el volumen tenía un `watch` sobre el silencio y
 * el nivel, más tres `await updateIcon()` repartidos por las funciones que
 * tocan el volumen; el micrófono otros tres; la red, cinco.
 *
 * Todo eso se fue: `ThemeIcon` recibe el **nombre** y lo mira, así que alcanza
 * con un `computed`. Pero eso mueve la responsabilidad a un lugar donde nadie
 * de esta ventana la estaba comprobando, y romperla no falla: el icono se queda
 * con el dibujo anterior y la pantalla sigue andando.
 *
 * Se prueba sobre `ProfileIcon`, que es la pieza más chica que hace exactamente
 * esto —una propiedad entra, un nombre de icono sale— y no necesita ningún
 * doble del backend. Lo que queda demostrado es el mecanismo, que es el mismo
 * que usan el volumen, el micrófono, la red y la batería.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

/**
 * El doble va **encima** del módulo de verdad, no en su lugar.
 *
 * Reemplazarlo entero deja sin exportar lo que no se nombre acá, y lo que falla
 * entonces es el import y no la prueba: los componentes compilados de la
 * librería importan `once` de este mismo módulo, así que en cuanto una prueba
 * monta uno, la corrida se cae con un «Export named 'once' not found» que no
 * nombra ninguna prueba.
 */
const eventos = await import('@tauri-apps/api/event');

mock.module('@tauri-apps/api/event', () => ({
	...eventos,
	// `ThemeIcon` se suscribe al cambio de tema al montar. Sin esto el `listen`
	// de verdad intenta hablar con Tauri y el `onMounted` revienta.
	listen: async () => () => {},
}));

mock.module('@vasakgroup/plugin-vicons', () => ({
	getIconSource: async (nombre: string) => `icono:${nombre}`,
	getSymbolSource: async (nombre: string) => `simbolo:${nombre}`,
	hasSymbol: async () => true,
}));

const ProfileIcon = (await import('@/components/ui/ProfileIcon.vue')).default;

const montadas: VueWrapper[] = [];

/**
 * Deja que `ThemeIcon` resuelva.
 *
 * El icono se pide al montar y vuelve por promesa, así que hasta que no vuelve
 * el componente dibuja el hueco del mismo tamaño y no una imagen.
 */
async function asentar(vueltas = 8) {
	for (let i = 0; i < vueltas; i++) await nextTick();
}

beforeEach(() => {
	// La memoria y la cuenta de oyentes de la librería viven en su módulo y se
	// comparten entre archivos de prueba.
	olvidarLosIconosDelTema();
});

afterEach(() => {
	while (montadas.length) montadas.pop()?.unmount();
	olvidarLosIconosDelTema();
});

describe('el icono sigue al nombre', () => {
	test('cambia cuando cambia lo que representa', async () => {
		const vista = mount(ProfileIcon, { props: { profile: 'balanced' } });
		montadas.push(vista);
		await asentar();
		expect(vista.get('img').attributes('src')).toBe('icono:battery-profile-balanced');

		await vista.setProps({ profile: 'performance' });
		await asentar();

		expect(vista.get('img').attributes('src')).toBe('icono:battery-profile-performance');
	});

	test('y es el de color, no el glifo monocromo', async () => {
		// El composable tenía dos funciones —una por variante— y ésta usaba la de
		// color. `ThemeIcon` trae la de color por omisión, pero pedir la que no
		// es **no falla**: dibuja otra cosa.
		const vista = mount(ProfileIcon, { props: { profile: 'power-saver' } });
		montadas.push(vista);
		await asentar();

		expect(vista.get('img').attributes('src')).toStartWith('icono:');
	});
});
