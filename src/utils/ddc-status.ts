import type { DdcStatus } from '@vasakgroup/plugin-display-manager';

/** Un aviso para mostrar: la clave de traducción y sus argumentos (`{0}`). */
export interface DdcNotice {
	key: string;
	args: string[];
}

const REASONS: Record<NonNullable<DdcStatus['reason']>, string> = {
	'not-installed': 'views.monitors.ddcNotInstalled',
	'no-i2c-dev': 'views.monitors.ddcNoI2cDev',
	'no-permission': 'views.monitors.ddcNoPermission',
};

/**
 * Qué decir sobre los monitores externos.
 *
 * El plugin manda códigos y no frases, para que el texto salga traducido. Que
 * esté buscando no es un problema y se dice aparte; un monitor que no contesta
 * DDC/CI se nombra, en vez de desaparecer de la lista sin explicación.
 */
export function ddcNotices(status: DdcStatus): DdcNotice[] {
	if (status.state === 'detecting') {
		return [{ key: 'views.monitors.ddcDetecting', args: [] }];
	}
	if (status.state === 'unavailable' && status.reason) {
		return [{ key: REASONS[status.reason], args: [] }];
	}
	return status.unsupported.map((output) => ({
		key: 'views.monitors.ddcUnsupported',
		args: [output],
	}));
}
