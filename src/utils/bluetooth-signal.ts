/**
 * De un RSSI de Bluetooth al icono de señal del tema.
 *
 * El tema trae la escalera estándar de cinco pasos en simbólico
 * —`network-wireless-signal-{none,weak,ok,good,excellent}`—, que es lo mismo que
 * dibuja el resto del escritorio para la señal inalámbrica. Va un icono y no un
 * glifo de emoji: el emoji no seguía al tema, lo dibujaba la fuente del sistema
 * (distinto en cada máquina, y a veces en color al lado de todo lo monocromo) y
 * era el mismo dibujo con señal buena y con señal pésima.
 */

/**
 * Los cortes, de mejor a peor: `[mínimo en dBm, nombre del icono]`.
 *
 * Arrancan con la tabla del issue (Vasak-OS/vasak-settings#118): el RSSI de
 * Bluetooth va de unos −30 dBm con el dispositivo pegado a −90 al límite del
 * alcance. Son un punto de partida, no una medición: el RSSI depende del
 * adaptador, así que se ajustan con un dispositivo real en la máquina que se
 * tenga a mano, alejándolo y mirando en qué escalón cae.
 */
export const SIGNAL_THRESHOLDS: ReadonlyArray<readonly [number, string]> = [
	[-50, 'network-wireless-signal-excellent'],
	[-60, 'network-wireless-signal-good'],
	[-70, 'network-wireless-signal-ok'],
	[-80, 'network-wireless-signal-weak'],
];

/** El escalón de abajo del todo: por debajo del último corte. */
export const NO_SIGNAL_ICON = 'network-wireless-signal-none';

/**
 * El nombre del icono del tema para un RSSI en dBm.
 *
 * Recibe un número, no un opcional: si el dispositivo no informa RSSI la fila
 * no muestra nada, y esa decisión es de quien arma la fila. Un icono de
 * «ninguna señal» ahí diría algo falso —no es que no haya señal, es que no la
 * informa—.
 */
export function signalLevel(rssi: number): string {
	for (const [minimum, icon] of SIGNAL_THRESHOLDS) {
		if (rssi >= minimum) return icon;
	}
	return NO_SIGNAL_ICON;
}
