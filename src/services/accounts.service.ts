import { invoke } from '@tauri-apps/api/core';

/**
 * El resumen que devuelve el servicio de cuentas.
 *
 * Es un resumen y no la cuenta entera porque listar no pide permiso: lo que sale
 * por ahí lo ve cualquier programa del usuario. El servidor y el `client_id`
 * quedan detrás de `GetAccountData` del servicio de cuentas, que sí pregunta —
 * y esta pantalla no lo llama: administra las cuentas, no las consume.
 */
export interface AccountInfo {
	id: string;
	display_name: string;
	provider_type: string;
	capabilities: string[];
	/** El proveedor dejó de aceptar la autorización y hay que reconectarla. */
	needs_reauth: boolean;
}

/** Un proveedor OAuth2 del catálogo del servicio. */
export interface ProviderInfo {
	id: string;
	display_name: string;
	capabilities: string[];
	/**
	 * Si se puede empezar un flujo tal como está.
	 *
	 * Para OAuth2 depende de que alguien haya dejado el `client_id`; los de
	 * Nextcloud están listos siempre, porque las credenciales las emite el
	 * servidor de la propia persona.
	 */
	configured: boolean;
	/**
	 * `oauth2` o `nextcloud`. Decide qué se le pide a la persona: el primero abre
	 * el navegador directo, el segundo necesita la dirección del servidor antes.
	 */
	kind: 'oauth2' | 'nextcloud';
}

export const listAccounts = (): Promise<AccountInfo[]> => invoke<AccountInfo[]>('list_accounts');

export const listProviders = (): Promise<ProviderInfo[]> =>
	invoke<ProviderInfo[]>('list_providers');

/**
 * Conecta una cuenta OAuth2 de punta a punta.
 *
 * Todo el flujo ocurre del otro lado del IPC: ni el código de autorización ni el
 * `state` entran acá. El `code_verifier` de PKCE no sale nunca del servicio de
 * cuentas, así que lo que se maneja en este proceso no es un secreto.
 */
export const connectOauthAccount = (
	providerId: string,
	capabilities: string[],
	displayName: string
): Promise<string> =>
	invoke<string>('connect_oauth_account', { providerId, capabilities, displayName });

/** Cómo le fue a una de las dos puntas de la prueba. */
export interface ProbeOutcome {
	ok: boolean;
	/** Qué pasó, en términos de lo que se puede arreglar. */
	detail: string;
}

/**
 * Las dos puntas por separado, y eso importa: es muy común que la de entrada
 * funcione y la de salida no. Un resultado único diría «no anda» sin decir cuál
 * de los dos grupos de campos hay que mirar.
 */
export interface MailProbe {
	imap: ProbeOutcome;
	smtp: ProbeOutcome;
}

/**
 * Prueba que una cuenta de correo funcione antes de guardarla.
 *
 * Corre en el proceso de la ventana y no en el servicio de cuentas: la
 * contraseña ya está acá —la acaba de escribir la persona—, así que probarla no
 * la expone a nada nuevo, y mantiene un cliente de IMAP y otro de SMTP fuera de
 * un proceso que corre como root.
 */
export const testMailConnection = (
	imapServer: string,
	imapPort: number,
	smtpServer: string,
	smtpPort: number,
	username: string,
	password: string
): Promise<MailProbe> =>
	invoke<MailProbe>('test_mail_connection', {
		imapServer,
		imapPort,
		smtpServer,
		smtpPort,
		username,
		password,
	});

/**
 * Conecta una cuenta de Nextcloud.
 *
 * La contraseña de aplicación que emite el servidor no pasa por acá ni por el
 * proceso de la ventana: el servicio de cuentas la recibe, la guarda y devuelve
 * sólo el identificador. Puede tardar lo que la persona tarde en autenticarse en
 * su servidor, porque el sondeo corre del otro lado del IPC.
 */
export const connectNextcloudAccount = (server: string, displayName: string): Promise<string> =>
	invoke<string>('connect_nextcloud_account', { server, displayName });

/** Dónde vive el calendario o la libreta de contactos, o por qué no se encontró. */
export interface Hallazgo {
	url: string | null;
	detail: string;
}

export interface DavDiscovery {
	calendar: Hallazgo;
	contacts: Hallazgo;
}

/**
 * Busca el calendario y los contactos de una cuenta sin que nadie escriba una
 * URL.
 *
 * Recorre lo que dice el estándar: del dominio al servidor por `.well-known`, y
 * de ahí al lugar donde viven las colecciones de la persona. Los dos resultados
 * vienen por separado porque es muy común que un servidor tenga uno y no el
 * otro.
 */
export const discoverDav = (
	account: string,
	username: string,
	password: string
): Promise<DavDiscovery> => invoke<DavDiscovery>('discover_dav', { account, username, password });

/**
 * Registra una cuenta con contraseña: IMAP/SMTP y compañía.
 *
 * Las cuentas OAuth2 no van por acá — el servicio rechaza sus secretos en este
 * camino, porque sin las URLs para renovar el token quedarían cuentas que se
 * mueren en una hora.
 */
export const registerPasswordAccount = (
	provider: string,
	displayName: string,
	capabilities: Record<string, Record<string, unknown>>,
	secret: string
): Promise<string> =>
	invoke<string>('register_password_account', {
		provider,
		displayName,
		capabilities,
		secret,
	});

export const removeAccount = (accountId: string): Promise<void> =>
	invoke<void>('remove_account', { accountId });

export const accountManagerPing = (): Promise<string> => invoke<string>('account_manager_ping');
