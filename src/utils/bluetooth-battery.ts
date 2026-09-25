/**
 * Del porcentaje de batería que publica BlueZ al icono del tema.
 *
 * BlueZ lo expone en `org.bluez.Battery1` como `Percentage`, de 0 a 100, y
 * sólo para los dispositivos que lo informan. Que no venga **no** es cero: es
 * «no lo sé», y esa distinción la hace quien arma la fila —acá se recibe un
 * número, nunca un opcional—.
 *
 * Va la escalera `battery-level-{0,10,…,100}` y no la de cinco nombres
 * (`empty/caution/low/good/full`): el tema trae las dos, pero la de diez en
 * diez es la que dibuja el nivel de verdad —un 60 % se ve distinto de un 90 %—
 * y la de nombres obliga a inventar cortes («¿caution es 20 o 15?») que nadie
 * más comparte. El nombre va pelado: la tarjeta le pega `-symbolic` sola.
 */

/** El prefijo de la escalera del tema. */
export const BATTERY_ICON_PREFIX = 'battery-level-';

/**
 * El nombre del icono para un porcentaje.
 *
 * Redondea a la decena más cercana —87 es 90, 4 es 0, 5 es 10— y acota a 0–100
 * por si un dispositivo informa algo fuera de rango: BlueZ lo da como `byte`,
 * así que no baja de cero, pero nada impide que un firmware raro pase de 100.
 */
export function batteryIcon(percentage: number): string {
	const clamped = Math.min(100, Math.max(0, percentage));
	return `${BATTERY_ICON_PREFIX}${Math.round(clamped / 10) * 10}`;
}
