import type { ProviderInfo } from '../services/accounts.service';

/**
 * Qué capacidades de un proveedor —o de una cuenta— se pueden usar hoy.
 *
 * El servicio de cuentas marca en `unavailable_capabilities` las que un
 * proveedor ofrece pero todavía no tienen dirección de servicio (el Drive de
 * Google, todo lo de Microsoft). La decisión de producto es que eso se vea
 * «todavía no disponible» y nunca roto: la casilla sigue en la tarjeta,
 * apagada, pero no se pide al conectar.
 *
 * Va aparte de la vista para poder probarlo sin Tauri ni Vue.
 *
 * `unavailable_capabilities` se lee como opcional: un servicio anterior a
 * vasak-accounts 0.13.1 no lo manda, y entonces todo vale como disponible, que
 * es lo que se suponía antes de que existiera el campo.
 */
export type CapabilityOwner = Pick<ProviderInfo, 'capabilities'> &
	Partial<Pick<ProviderInfo, 'unavailable_capabilities'>>;

/** Si esta capacidad del proveedor o de la cuenta se puede usar hoy. */
export const isCapabilityAvailable = (
	owner: Pick<CapabilityOwner, 'unavailable_capabilities'>,
	capability: string
): boolean => !(owner.unavailable_capabilities ?? []).includes(capability);

/**
 * Las capacidades a pedir al conectar un proveedor: las que ofrece menos las
 * que todavía no están, en el mismo orden.
 *
 * Mandar las no disponibles no rompería nada —el servicio las descarta—, pero
 * si **sólo** quedan ésas el servicio devuelve error, y para entonces ya se le
 * abrió el navegador a la persona. Por eso se filtran acá y la vista mira si
 * quedó algo antes de empezar.
 */
export const requestedCapabilities = (provider: CapabilityOwner): string[] =>
	provider.capabilities.filter((capability) => isCapabilityAvailable(provider, capability));

/**
 * Qué frena la conexión de un proveedor, o `undefined` si se puede empezar.
 *
 * - `nothingAvailable`: ninguna de sus capacidades existe todavía en VasakOS.
 * - `credentialsNeeded`: falta pegar el `client_id` (sólo OAuth2).
 *
 * El orden importa y es a propósito: **primero** lo que no está disponible.
 * Si nada lo está, pedirle las credenciales a la persona es mandarla a la
 * consola del proveedor a sacar un `client_id` para terminar, después de
 * pegarlo, en el mismo «no hay nada que conectar». Se le dice eso de entrada;
 * las credenciales se piden sólo cuando al pegarlas hay algo que ganar.
 */
export const connectionBlocker = (
	provider: CapabilityOwner & Pick<ProviderInfo, 'configured'>
): 'nothingAvailable' | 'credentialsNeeded' | undefined => {
	if (requestedCapabilities(provider).length === 0) return 'nothingAvailable';
	if (!provider.configured) return 'credentialsNeeded';
	return undefined;
};
