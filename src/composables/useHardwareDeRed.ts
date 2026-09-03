/**
 * Qué hardware de red tiene el equipo, para no ofrecer lo que no existe.
 *
 * Un equipo de escritorio sin placa inalámbrica mostraba igual la sección de
 * Wi-Fi, y ahí lo único que se puede leer es que no hay ninguna red. Lo mismo
 * con Bluetooth. No es un error —la pantalla funciona— pero le hace buscar a
 * alguien un problema donde no hay ninguno: la pregunta que se hace no es «¿por
 * qué está vacío?» sino «¿qué configuré mal?».
 *
 * # La tercera respuesta
 *
 * Las dos consultas pueden **fallar**, y eso no es lo mismo que «no hay
 * hardware»: si NetworkManager o bluez no están corriendo, la respuesta es que
 * no se sabe. Ahí la sección **se muestra**, porque esconderla dejaría a la
 * persona sin el único lugar donde el problema se puede explicar. Sólo se
 * esconde lo que se sabe que no está.
 *
 * Por eso se usa `listAdapters` y no `isBluetoothAvailable`, que envuelve la
 * llamada en un `try/catch` y devuelve `false` también cuando falló: convierte
 * «no pude preguntar» en «no hay», que es justo la distinción que acá importa.
 */

import { listAdapters } from '@vasakgroup/plugin-bluetooth-manager';
import { isWirelessAvailable } from '@vasakgroup/plugin-network-manager';
import { onMounted, ref } from 'vue';
import type { Disponibilidad, Hardware } from './secciones-por-hardware';

export type { Disponibilidad } from './secciones-por-hardware';

/**
 * Traduce el resultado de una consulta a las tres respuestas.
 *
 * La consulta rechazada es la que importa: se convierte en `desconocido` y no
 * en `no`, que es la confusión que este módulo existe para evitar.
 */
function disponibilidadDe<T>(
	resultado: PromiseSettledResult<T>,
	hay: (valor: T) => boolean
): Disponibilidad {
	if (resultado.status !== 'fulfilled') return 'desconocido';
	return hay(resultado.value) ? 'si' : 'no';
}

/**
 * El sondeo, hecho una sola vez por ejecución.
 *
 * Lo piden dos: el menú lateral, para esconder lo que no existe, y el guard del
 * router, para que no se pueda llegar igual. Compartir la promesa es lo que
 * evita dos rondas de D-Bus y, sobre todo, que las dos decisiones se tomen con
 * respuestas distintas.
 *
 * No se reintenta si falló. Un fallo da `desconocido`, que **deja pasar** y deja
 * la sección a la vista, así que reintentar no cambiaría ninguna decisión.
 */
let sondeo: Promise<Record<Hardware, Disponibilidad>> | null = null;

export function hardwareDeRed(): Promise<Record<Hardware, Disponibilidad>> {
	sondeo ??= consultar();
	return sondeo;
}

async function consultar(): Promise<Record<Hardware, Disponibilidad>> {
	// Las dos en paralelo y con `allSettled`: son consultas independientes y que
	// una falle no tiene por qué dejar la otra sin respuesta.
	const [inalambrica, adaptadores] = await Promise.allSettled([
		isWirelessAvailable(),
		listAdapters(),
	]);

	return {
		// `is_wireless_available` es `!wireless_device_paths().is_empty()` en
		// NetworkManager: cuenta dispositivos, no si la radio está encendida. Una
		// placa apagada por software sigue siendo una placa, y su sección tiene
		// que estar para poder prenderla.
		wifi: disponibilidadDe(inalambrica, (hay) => hay),
		bluetooth: disponibilidadDe(adaptadores, (lista) => lista.length > 0),
	};
}

export function useHardwareDeRed() {
	const wifi = ref<Disponibilidad>('desconocido');
	const bluetooth = ref<Disponibilidad>('desconocido');

	// Una sola vez al abrir, y sin volver a preguntar: un adaptador USB
	// enchufado con la ventana abierta no aparece hasta reabrirla.
	onMounted(async () => {
		const disponible = await hardwareDeRed();
		wifi.value = disponible.wifi;
		bluetooth.value = disponible.bluetooth;
	});

	return { wifi, bluetooth };
}
