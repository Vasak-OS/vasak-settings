<script setup lang="ts">
import { getSymbolSource, hasSymbol } from '@vasakgroup/plugin-vicons';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, ThemeIcon, usarLaVersionDelTema } from '@vasakgroup/vue-libvasak';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import {
	type AccountInfo,
	clearProviderCredentials,
	connectNextcloudAccount,
	connectOauthAccount,
	type DavDiscovery,
	discoverDav,
	listAccounts,
	listProviders,
	type MailProbe,
	type ProviderInfo,
	registerPasswordAccount,
	removeAccount,
	setProviderCredentials,
	testMailConnection,
} from '@/services/accounts.service';
import { canManageCredentials, clearOutcome } from '@/utils/provider-credentials';
import { CAPABILITY_ICONS, resolveProviderIcons } from '@/utils/provider-icon';
import {
	type CapabilityOwner,
	connectionBlocker,
	isCapabilityAvailable,
	requestedCapabilities,
} from '@/utils/requested-capabilities';

/**
 * El proveedor personalizado no está en el catálogo del servicio.
 *
 * Los del catálogo son proveedores OAuth2: tienen URLs y un `client_id`. Éste es
 * el camino de IMAP/SMTP con contraseña de aplicación, que no habla OAuth con
 * nadie, así que se dibuja al lado pero no sale de la misma lista.
 */
const CUSTOM_PROVIDER = 'custom';

const { t } = useI18n();

const providers = ref<ProviderInfo[]>([]);

/**
 * Por qué un proveedor no se puede conectar tal como está, o `undefined` si sí.
 *
 * Un botón que abre un flujo roto es peor que un botón apagado: la persona no
 * sabe si se equivocó ella, si falta un dato o si el sistema está mal. Hay dos
 * motivos, y el orden lo decide `connectionBlocker`:
 *
 * - que nada de lo que ofrece exista todavía en VasakOS (Microsoft hoy): se
 *   dice eso, y no se piden credenciales que no servirían para nada;
 * - que falten las credenciales: ya no es un «no se puede», el botón abre el
 *   formulario, así que el texto invita a tocarlo en vez de mandar a editar un
 *   archivo del sistema.
 */
const unavailableReason = (provider: ProviderInfo): string | undefined => {
	switch (connectionBlocker(provider)) {
		case 'nothingAvailable':
			return t('views.onlineAccounts.nothingAvailableYet').replace(
				'{0}',
				() => provider.display_name
			);
		case 'credentialsNeeded':
			return t('views.onlineAccounts.credentials.needed');
		default:
			return undefined;
	}
};

const errors = ref('');
const success = ref('');
/**
 * Lo que se borró bien pero dejó algo pendiente del otro lado.
 *
 * Estado propio y no `errors`, por dos razones. La primera es que no es un
 * error: lo que la persona pidió sí pasó. La segunda es concreta —y era un bug—:
 * `fetchAccounts()` limpia `errors` al empezar, así que un aviso escrito justo
 * antes de recargar la lista se borraba **antes de dibujarse**, y lo único que
 * este aviso venía a agregar no se veía nunca.
 */
const notice = ref('');
const loading = ref(false);
const accounts = ref<AccountInfo[]>([]);

const showCustomForm = ref(false);
const customForm = reactive({
	displayName: '',
	imapServer: '',
	imapPort: 993,
	smtpServer: '',
	smtpPort: 587,
	username: '',
	password: '',
});

const customFormErrors = reactive({
	displayName: '',
	imapServer: '',
	imapPort: '',
	smtpServer: '',
	smtpPort: '',
	username: '',
	password: '',
});

const isCustomValid = computed(() => {
	return (
		customForm.displayName.trim().length > 0 &&
		customForm.imapServer.trim().length > 0 &&
		customForm.imapPort > 0 &&
		customForm.imapPort <= 65535 &&
		customForm.smtpServer.trim().length > 0 &&
		customForm.smtpPort > 0 &&
		customForm.smtpPort <= 65535 &&
		customForm.username.trim().length > 0 &&
		customForm.password.length > 0
	);
});

/** El nombre del icono de una capacidad, de la tabla compartida. */
const capabilityIcon = (capability: string) => CAPABILITY_ICONS[capability] ?? '';

/**
 * El nombre de una capacidad tal como se lee en pantalla.
 *
 * Una que el proveedor todavía no puede dar lleva «todavía no disponible» en
 * el texto mismo y no sólo en el color: el atenuado solo no lo dice el lector
 * de pantalla, y un `title` no se ve sin pasar el ratón.
 */
const capabilityLabel = (
	owner: Pick<CapabilityOwner, 'unavailable_capabilities'>,
	capability: string
): string => {
	const name = t(`views.onlineAccounts.capabilities.${capability}`);
	return isCapabilityAvailable(owner, capability)
		? name
		: t('views.onlineAccounts.capabilityNotAvailableYet').replace('{0}', () => name);
};

/**
 * Los iconos, uno por proveedor.
 *
 * Se resuelven cuando llega el catálogo y no antes: la lista de proveedores la
 * decide el servicio, así que acá no se puede saber de antemano cuáles hay.
 */
const icons = ref<Record<string, string>>({});

/**
 * Se piden derecho al plugin, y no con el componente compartido.
 *
 * `ThemeIcon` dibuja **un** nombre del tema, y acá hace falta preguntar antes si
 * el tema lo tiene: los proveedores salen del catálogo y no se saben de
 * antemano. El cambio de tema lo atiende la vista volviendo a correr esto — un
 * icono por proveedor, resueltos todos juntos.
 *
 * `hasSymbol` va aparte de `getSymbolSource` porque son dos preguntas distintas
 * —si el tema lo tiene, y traerlo— y pedir no contesta la primera: un nombre que
 * no está vuelve como el cuadrito de imagen rota, con forma de icono válido.
 */
const refreshProviderIcons = async () => {
	icons.value = await resolveProviderIcons(
		providers.value.map((provider) => provider.id),
		getSymbolSource,
		hasSymbol
	);
};

const validateCustomForm = (): boolean => {
	let valid = true;

	if (!customForm.displayName.trim()) {
		customFormErrors.displayName = t('views.onlineAccounts.errors.nameRequired');
		valid = false;
	} else {
		customFormErrors.displayName = '';
	}

	if (!customForm.imapServer.trim()) {
		customFormErrors.imapServer = t('views.onlineAccounts.errors.imapServerRequired');
		valid = false;
	} else {
		customFormErrors.imapServer = '';
	}

	if (!customForm.imapPort || customForm.imapPort < 1 || customForm.imapPort > 65535) {
		customFormErrors.imapPort = t('views.onlineAccounts.errors.invalidPort');
		valid = false;
	} else {
		customFormErrors.imapPort = '';
	}

	if (!customForm.smtpServer.trim()) {
		customFormErrors.smtpServer = t('views.onlineAccounts.errors.smtpServerRequired');
		valid = false;
	} else {
		customFormErrors.smtpServer = '';
	}

	if (!customForm.smtpPort || customForm.smtpPort < 1 || customForm.smtpPort > 65535) {
		customFormErrors.smtpPort = t('views.onlineAccounts.errors.invalidPort');
		valid = false;
	} else {
		customFormErrors.smtpPort = '';
	}

	if (!customForm.username.trim()) {
		customFormErrors.username = t('views.onlineAccounts.errors.usernameRequired');
		valid = false;
	} else {
		customFormErrors.username = '';
	}

	if (!customForm.password) {
		customFormErrors.password = t('views.onlineAccounts.errors.passwordRequired');
		valid = false;
	} else {
		customFormErrors.password = '';
	}

	return valid;
};

const fetchAccounts = async () => {
	try {
		errors.value = '';
		accounts.value = await listAccounts();
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.loadAccounts').replace('{0}', String(err));
	}
};

/**
 * Conecta un proveedor del catálogo.
 *
 * Se piden **todas las disponibles** juntas: el proveedor muestra una sola
 * pantalla de consentimiento, y pedirlas de a una obligaría a pasar por ahí una
 * vez por capacidad para terminar con el mismo permiso. Las que todavía no
 * existen en VasakOS quedan afuera (ver `requestedCapabilities`).
 */
const connectProvider = async (provider: ProviderInfo) => {
	const blocker = connectionBlocker(provider);

	// Primero lo que no está: si nada de este proveedor existe todavía, el
	// servicio rechazaría el pedido **después** de abrir el navegador, y pedir
	// las credenciales antes sería mandar a la persona a la consola del
	// proveedor a sacar un `client_id` para terminar en ese mismo rechazo. Se
	// le dice de entrada, sin flujo y sin formulario.
	if (blocker === 'nothingAvailable') {
		errors.value = '';
		success.value = '';
		notice.value = unavailableReason(provider) ?? '';
		return;
	}

	// Sin credenciales no hay flujo que empezar, pero tampoco es un callejón:
	// se abre el formulario para pegarlas. Antes el botón estaba apagado y lo
	// único que se podía hacer era editar un archivo como administrador.
	if (blocker === 'credentialsNeeded') {
		openCredentials(provider);
		return;
	}

	// Nextcloud no puede empezar sin la dirección: no hay un servidor conocido al
	// que mandar el navegador, porque el servidor es el de la propia persona.
	if (provider.kind === 'nextcloud') {
		openNextcloudForm(provider);
		return;
	}

	loading.value = true;
	errors.value = '';
	success.value = '';
	notice.value = '';

	try {
		await connectOauthAccount(provider.id, requestedCapabilities(provider), provider.display_name);
		success.value = t('views.onlineAccounts.providerConnected').replace(
			'{0}',
			provider.display_name
		);
		await fetchAccounts();
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.connectProvider')
			.replace('{0}', provider.display_name)
			.replace('{1}', String(err));
	} finally {
		loading.value = false;
	}
};

const nextcloudProvider = ref<ProviderInfo | null>(null);
const nextcloudForm = reactive({ server: '', displayName: '' });
const nextcloudError = ref('');

/**
 * El proveedor cuyo formulario de credenciales está abierto, o `null`.
 *
 * VasakOS no incluye un `client_id` para Google ni Microsoft, así que el de cada
 * quien se pega acá en vez de editar un archivo del sistema como administrador.
 */
const credentialsFor = ref<ProviderInfo | null>(null);
const credentialsForm = reactive({ clientId: '', clientSecret: '' });
const savingCredentials = ref(false);
/**
 * El error va **dentro** del formulario y no en el aviso de arriba.
 *
 * El aviso general se dibuja encima de la grilla de proveedores y el formulario
 * queda abajo: quien apreta guardar y falla se queda mirando el formulario sin
 * ver por qué no pasó nada.
 */
const credentialsError = ref('');
/**
 * Si se está preguntando «¿quitar?». Quitar las credenciales no se deshace: hay
 * que volver a la consola del proveedor a sacar otras.
 */
const confirmingClear = ref(false);
const clearingCredentials = ref(false);
/**
 * Si hay un guardado o un borrado de credenciales en curso. Mientras dura, no se
 * abre el formulario de otro proveedor: al terminar, el de éste se cierra, y se
 * llevaría puesto el otro con lo que la persona ya había escrito.
 */
const credentialsBusy = computed(() => savingCredentials.value || clearingCredentials.value);

const openCredentials = (provider: ProviderInfo) => {
	errors.value = '';
	success.value = '';
	notice.value = '';
	credentialsForm.clientId = '';
	credentialsForm.clientSecret = '';
	credentialsError.value = '';
	confirmingClear.value = false;
	credentialsFor.value = provider;
};

const closeCredentials = () => {
	credentialsFor.value = null;
	credentialsError.value = '';
	confirmingClear.value = false;
};

const saveCredentials = async () => {
	const provider = credentialsFor.value;
	if (!provider || !credentialsForm.clientId.trim()) return;

	savingCredentials.value = true;
	credentialsError.value = '';
	try {
		await setProviderCredentials(
			provider.id,
			credentialsForm.clientId,
			credentialsForm.clientSecret
		);
		if (credentialsFor.value?.id === provider.id) credentialsFor.value = null;
		// El catálogo cambió: ese proveedor pasa a estar listo, y el botón se
		// tiene que encender sin que haya que volver a entrar a la pantalla.
		await fetchProviders();
		success.value = t('views.onlineAccounts.credentials.saved').replace(
			'{0}',
			provider.display_name
		);
	} catch (err) {
		credentialsError.value = String(err);
	} finally {
		savingCredentials.value = false;
	}
};

const clearCredentials = async (provider: ProviderInfo) => {
	credentialsError.value = '';
	success.value = '';
	clearingCredentials.value = true;
	try {
		await clearProviderCredentials(provider.id);
		if (credentialsFor.value?.id === provider.id) {
			credentialsFor.value = null;
			confirmingClear.value = false;
		}
		const refreshed = await fetchProviders();
		// Las que se borran son las propias: si el proveedor sigue listo, tiene
		// unas del sistema, y «quitadas» a secas haría creer que ya no se puede
		// conectar nada nuevo con él.
		const after = providers.value.find((p) => p.id === provider.id);
		const key =
			clearOutcome(after, refreshed) === 'systemRemains'
				? 'views.onlineAccounts.credentials.clearedSystemRemains'
				: 'views.onlineAccounts.credentials.cleared';
		success.value = t(key).replace('{0}', provider.display_name);
	} catch (err) {
		credentialsError.value = String(err);
	} finally {
		clearingCredentials.value = false;
	}
};

const openNextcloudForm = (provider: ProviderInfo) => {
	errors.value = '';
	success.value = '';
	notice.value = '';
	nextcloudError.value = '';
	nextcloudForm.server = '';
	nextcloudForm.displayName = '';
	nextcloudProvider.value = provider;
};

const cancelNextcloud = () => {
	nextcloudProvider.value = null;
	nextcloudError.value = '';
};

/**
 * Arranca el inicio de sesión y espera.
 *
 * `esperando` es su propio estado y no el `loading` general: esto puede tardar
 * lo que la persona tarde en autenticarse en su servidor, y durante ese rato hay
 * que decirle que se fue al navegador — con el `loading` general parecería que
 * la pantalla se colgó.
 */
const connectingNextcloud = ref(false);

const connectNextcloud = async () => {
	const provider = nextcloudProvider.value;
	if (!provider) return;

	if (!nextcloudForm.server.trim()) {
		nextcloudError.value = t('views.onlineAccounts.errors.serverRequired');
		return;
	}

	connectingNextcloud.value = true;
	nextcloudError.value = '';

	try {
		await connectNextcloudAccount(nextcloudForm.server, nextcloudForm.displayName);
		success.value = t('views.onlineAccounts.providerConnected').replace(
			'{0}',
			provider.display_name
		);
		nextcloudProvider.value = null;
		await fetchAccounts();
	} catch (err) {
		// Se queda en el formulario: el error más común es una dirección mal
		// escrita, y cerrarlo obligaría a tipearla de nuevo.
		nextcloudError.value = String(err);
	} finally {
		connectingNextcloud.value = false;
	}
};

const openCustomForm = () => {
	errors.value = '';
	success.value = '';
	notice.value = '';
	showCustomForm.value = true;
};

/**
 * El resultado de la última prueba, o `null` si todavía no se probó.
 *
 * Se guarda para dos cosas: mostrarlo campo por campo, y saber si la persona ya
 * vio un fallo — porque después de verlo puede decidir guardar igual.
 */
const probe = ref<MailProbe | null>(null);
const probing = ref(false);

const probeOk = computed(() => probe.value?.imap.ok === true && probe.value?.smtp.ok === true);

/**
 * Cualquier cambio en los datos invalida la prueba anterior.
 *
 * Sin esto, alguien podría probar, corregir el servidor, y guardar apoyándose en
 * un resultado que ya no corresponde a lo que hay en el formulario.
 */
const forgetProbe = () => {
	probe.value = null;
	// Lo encontrado también deja de valer: si cambió el usuario o el servidor,
	// esas direcciones son de otra cuenta.
	dav.value = null;
};

/**
 * Lo que el autodescubrimiento encontró, o `null` si todavía no se buscó.
 *
 * Es opcional a propósito: una cuenta de sólo correo se guarda igual. Buscar y
 * no encontrar tampoco impide guardar — hay servidores que no hacen
 * autodescubrimiento y aun así funcionan perfecto para el correo.
 */
const dav = ref<DavDiscovery | null>(null);
const discoveringDav = ref(false);

const lookUpDav = async () => {
	if (!customForm.username.trim() || !customForm.password) {
		errors.value = t('views.onlineAccounts.errors.usernameRequired');
		return;
	}

	discoveringDav.value = true;
	errors.value = '';
	success.value = '';
	notice.value = '';

	try {
		// El usuario suele ser el correo, y de ahí sale el dominio contra el que
		// buscar. Si no lo fuera, el servidor IMAP es la mejor pista que hay.
		const lookupTarget = customForm.username.includes('@')
			? customForm.username
			: customForm.imapServer;
		dav.value = await discoverDav(lookupTarget, customForm.username, customForm.password);
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.discoverFailed').replace('{0}', String(err));
	} finally {
		discoveringDav.value = false;
	}
};

const testConnection = async (): Promise<boolean> => {
	if (!validateCustomForm()) return false;

	probing.value = true;
	errors.value = '';
	success.value = '';
	notice.value = '';

	try {
		probe.value = await testMailConnection(
			customForm.imapServer,
			customForm.imapPort,
			customForm.smtpServer,
			customForm.smtpPort,
			customForm.username,
			customForm.password
		);
		return probeOk.value;
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.probeFailed').replace('{0}', String(err));
		return false;
	} finally {
		probing.value = false;
	}
};

/**
 * Guarda, probando primero.
 *
 * Si la prueba falla **no se bloquea el guardado**: se muestra qué falló y el
 * botón pasa a decir «guardar igual». Una prueba puede dar un falso negativo
 * —un servidor que sólo acepta un mecanismo raro, una red que filtra un
 * puerto— y dejar a alguien sin poder guardar una cuenta que anda sería peor
 * que el problema que esto viene a resolver.
 */
const submitCustomProvider = async () => {
	if (!validateCustomForm()) return;

	// La primera vez se prueba; si ya se probó y falló, el segundo clic guarda.
	if (probe.value === null) {
		const connectionWorks = await testConnection();
		if (!connectionWorks) return;
	}

	loading.value = true;
	errors.value = '';
	success.value = '';
	notice.value = '';

	try {
		// El correo siempre; el calendario y los contactos sólo si se los
		// encontró. Una capacidad sin dirección no serviría de nada: la cuenta
		// la declararía y la aplicación que la pidiera no tendría adónde ir.
		const capabilities: Record<string, Record<string, unknown>> = {
			email: {
				imap_server: customForm.imapServer,
				imap_port: customForm.imapPort,
				smtp_server: customForm.smtpServer,
				smtp_port: customForm.smtpPort,
				username: customForm.username,
			},
		};
		if (dav.value?.calendar.url) {
			capabilities.calendar = {
				url: dav.value.calendar.url,
				username: customForm.username,
				auth: 'basic',
			};
		}
		if (dav.value?.contacts.url) {
			capabilities.contacts = {
				url: dav.value.contacts.url,
				username: customForm.username,
				auth: 'basic',
			};
		}

		await registerPasswordAccount(
			CUSTOM_PROVIDER,
			customForm.displayName,
			capabilities,
			customForm.password
		);

		success.value = t('views.onlineAccounts.customAdded');
		showCustomForm.value = false;
		resetCustomForm();
		probe.value = null;
		dav.value = null;
		await fetchAccounts();
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.registerCustom').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
};

const resetCustomForm = () => {
	customForm.displayName = '';
	customForm.imapServer = '';
	customForm.imapPort = 993;
	customForm.smtpServer = '';
	customForm.smtpPort = 587;
	customForm.username = '';
	customForm.password = '';

	for (const key of Object.keys(customFormErrors) as (keyof typeof customFormErrors)[]) {
		customFormErrors[key] = '';
	}
};

const cancelCustomForm = () => {
	showCustomForm.value = false;
	resetCustomForm();
	probe.value = null;
	dav.value = null;
};

const deleteAccount = async (account: AccountInfo) => {
	try {
		errors.value = '';
		notice.value = '';
		const result = await removeAccount(account.id);
		const accountName = account.display_name || account.provider_type;

		// Recargar primero: `fetchAccounts()` limpia `errors`, y el aviso se
		// escribe después para que sobreviva a esa limpieza.
		await fetchAccounts();

		success.value = t('views.onlineAccounts.accountRemoved').replace('{0}', accountName);

		// La cuenta se borró igual, pero del otro lado quedó algo que la persona
		// puede terminar. Va como aviso y no como error: no falló lo que pidió.
		if (!result.revoked) {
			notice.value = t('views.onlineAccounts.errors.notRevoked')
				.replace('{0}', accountName)
				.replace('{1}', result.detail);
		}
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.deleteAccount').replace('{0}', String(err));
	}
};

/**
 * Relee el catálogo. Devuelve si lo pudo releer: quien acaba de cambiar algo
 * necesita saber si lo que ve después es el catálogo nuevo o el de antes.
 */
const fetchProviders = async (): Promise<boolean> => {
	let refreshed = false;
	try {
		providers.value = await listProviders();
		refreshed = true;
		await refreshProviderIcons();
	} catch (err) {
		// El catálogo no es imprescindible para ver las cuentas que ya están, así
		// que el fallo se cuenta y la pantalla sigue sirviendo.
		errors.value = t('views.onlineAccounts.errors.loadProviders').replace('{0}', String(err));
	}
	return refreshed;
};

/**
 * Los iconos del catálogo se vuelven a pedir cuando cambia el tema.
 *
 * Acá había un `listen` propio, con su bandera para la carrera entre el
 * registro y el desmontaje. Todo eso lo hace la librería: `usarLaVersionDelTema`
 * se cuelga del **mismo** oyente que usan los `ThemeIcon` de esta pantalla, con
 * su cuenta de suscriptores, en vez de sumar uno más.
 *
 * Los del catálogo necesitan esto y los demás no, porque los demás son
 * `ThemeIcon` y se encargan solos.
 */
const themeVersion = usarLaVersionDelTema();
watch(themeVersion, refreshProviderIcons);

onMounted(async () => {
	await Promise.all([fetchAccounts(), fetchProviders()]);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.onlineAccounts.title')"
			:description="t('views.onlineAccounts.description')"
		/>

		<AlertMessage v-if="errors" tone="error">{{ errors }}</AlertMessage>
		<AlertMessage v-if="notice" tone="warning">{{ notice }}</AlertMessage>
		<AlertMessage v-if="success" tone="success">{{ success }}</AlertMessage>

		<SectionCard v-if="accounts.length > 0">
			<h3 class="mb-4 text-lg font-medium text-tx-main">{{ t('views.onlineAccounts.linkedAccounts') }}</h3>

			<ul class="flex flex-col gap-2">
				<li
					v-for="account in accounts"
					:key="account.id"
					class="flex items-center justify-between rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-3"
				>
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm font-medium text-tx-main">
							{{ account.display_name || account.provider_type }}
						</span>
						<span class="text-xs text-tx-muted">{{ account.provider_type }}</span>

						<!-- Qué le dio la persona a esta cuenta. Con icono porque es
						     lo que se recorre con la vista: seis capacidades en texto
						     separado por puntos se leen palabra por palabra. -->
						<ul v-if="account.capabilities.length" class="mt-1 flex flex-wrap gap-2">
							<li
								v-for="c in account.capabilities"
								:key="c"
								class="flex items-center gap-1 rounded-corner-sm bg-ui-surface/70 px-1.5 py-0.5 text-xs text-tx-muted"
								:class="{ 'opacity-60': !isCapabilityAvailable(account, c) }"
							>
								<ThemeIcon :name="capabilityIcon(c)" type="symbol" :size="14" />
								{{ capabilityLabel(account, c) }}
							</li>
						</ul>
						<!-- Sin esto la cuenta queda en la lista fallando en silencio:
						     el proveedor dejó de aceptarla y cada intento de usarla da
						     un error que la persona nunca ve. -->
						<span v-if="account.needs_reauth" class="mt-1 text-xs text-status-warning">
							{{ t('views.onlineAccounts.needsReauth') }}
						</span>
					</div>

					<button
						class="rounded-corner border border-ui-border px-3 py-1.5 text-xs text-tx-muted transition-colors hover:border-status-error/40 hover:bg-status-error/10 hover:text-status-error"
						@click="deleteAccount(account)"
					>
						{{ t('common.delete') }}
					</button>
				</li>
			</ul>
		</SectionCard>

		<SectionCard v-if="credentialsFor">
			<h3 class="mb-1 text-lg font-medium text-tx-main">
				{{ t('views.onlineAccounts.credentials.title').replace('{0}', credentialsFor.display_name) }}
			</h3>
			<p class="mb-2 text-sm text-tx-muted">
				{{ t('views.onlineAccounts.credentials.why').replace('{0}', credentialsFor.display_name) }}
			</p>
			<p class="mb-4 text-xs text-tx-muted">
				{{ t('views.onlineAccounts.credentials.how') }}
			</p>

			<AlertMessage v-if="credentialsError" tone="error">{{ credentialsError }}</AlertMessage>

			<div class="flex flex-col gap-3">
				<label class="flex flex-col gap-1">
					<span class="text-sm text-tx-main">
						{{ t('views.onlineAccounts.credentials.clientId') }}
					</span>
					<input
						v-model="credentialsForm.clientId"
						type="text"
						:disabled="savingCredentials"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="saveCredentials"
					/>
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-sm text-tx-main">
						{{ t('views.onlineAccounts.credentials.clientSecret') }}
					</span>
					<input
						v-model="credentialsForm.clientSecret"
						type="password"
						:disabled="savingCredentials"
						:placeholder="t('views.onlineAccounts.credentials.clientSecretPlaceholder')"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="saveCredentials"
					/>
					<!-- Google lo llama secreto y no lo es: viaja dentro de cualquier
					     programa que lo use. Decirlo evita que alguien no lo pegue
					     creyendo que se está exponiendo. -->
					<span class="text-xs text-tx-muted">
						{{ t('views.onlineAccounts.credentials.secretNote') }}
					</span>
				</label>

				<div class="flex gap-2">
					<button
						:disabled="savingCredentials || !credentialsForm.clientId.trim()"
						class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-tx-on-primary disabled:opacity-50"
						@click="saveCredentials"
					>
						{{ savingCredentials ? t('common.saving') : t('common.save') }}
					</button>
					<button
						:disabled="savingCredentials"
						class="rounded-corner border border-ui-border px-4 py-2 text-sm text-tx-main disabled:opacity-50"
						@click="closeCredentials"
					>
						{{ t('common.cancel') }}
					</button>
					<button
						v-if="canManageCredentials(credentialsFor) && !confirmingClear"
						:disabled="savingCredentials"
						class="rounded-corner border border-ui-border px-4 py-2 text-sm text-tx-muted transition-colors hover:border-status-error/40 hover:text-status-error disabled:opacity-50"
						@click="confirmingClear = true"
					>
						{{ t('views.onlineAccounts.credentials.clear') }}
					</button>
				</div>
				<div
					v-if="confirmingClear"
					class="mt-3 rounded-corner border border-status-error/40 bg-status-error/10 p-3"
				>
					<p class="text-sm text-tx-main">
						{{ t('views.onlineAccounts.credentials.clearConfirm').replace('{0}', credentialsFor.display_name) }}
					</p>
					<div class="mt-2 flex gap-2">
						<button
							:disabled="clearingCredentials"
							class="rounded-corner bg-status-error px-4 py-2 text-sm font-medium text-tx-on-error disabled:opacity-50"
							@click="clearCredentials(credentialsFor)"
						>
							{{ t('views.onlineAccounts.credentials.clearConfirmAction') }}
						</button>
						<button
							:disabled="clearingCredentials"
							class="rounded-corner border border-ui-border px-4 py-2 text-sm text-tx-main disabled:opacity-50"
							@click="confirmingClear = false"
						>
							{{ t('common.cancel') }}
						</button>
					</div>
				</div>
			</div>
		</SectionCard>

		<SectionCard v-if="nextcloudProvider">
			<h3 class="mb-1 text-lg font-medium text-tx-main">
				{{ t('views.onlineAccounts.nextcloud.title').replace('{0}', nextcloudProvider.display_name) }}
			</h3>
			<p class="mb-4 text-sm text-tx-muted">
				{{ t('views.onlineAccounts.nextcloud.description') }}
			</p>

			<AlertMessage v-if="nextcloudError" tone="error">{{ nextcloudError }}</AlertMessage>

			<div class="flex flex-col gap-3">
				<label class="flex flex-col gap-1">
					<span class="text-sm text-tx-main">{{ t('views.onlineAccounts.nextcloud.server') }}</span>
					<input
						v-model="nextcloudForm.server"
						type="text"
						:disabled="connectingNextcloud"
						:placeholder="t('views.onlineAccounts.nextcloud.serverPlaceholder')"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="connectNextcloud"
					/>
					<!-- Se dice antes y no después de fallar: quien tiene un servidor
					     casero sin certificado tiene que enterarse acá, no cuando ya
					     escribió todo. -->
					<span class="text-xs text-tx-muted">
						{{ t('views.onlineAccounts.nextcloud.httpsNote') }}
					</span>
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-sm text-tx-main">
						{{ t('views.onlineAccounts.nextcloud.name') }}
					</span>
					<input
						v-model="nextcloudForm.displayName"
						type="text"
						:disabled="connectingNextcloud"
						:placeholder="t('views.onlineAccounts.nextcloud.namePlaceholder')"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="connectNextcloud"
					/>
				</label>

				<!-- Mientras espera, se dice dónde está la pelota. Sin esto la
				     ventana parece colgada durante todo el tiempo que la persona
				     tarda en autenticarse en su servidor. -->
				<p v-if="connectingNextcloud" class="text-sm text-tx-muted">
					{{ t('views.onlineAccounts.nextcloud.waiting') }}
				</p>

				<div class="flex gap-2">
					<button
						:disabled="connectingNextcloud"
						class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-tx-on-primary disabled:opacity-50"
						@click="connectNextcloud"
					>
						{{ t('views.onlineAccounts.nextcloud.connect') }}
					</button>
					<button
						:disabled="connectingNextcloud"
						class="rounded-corner border border-ui-border px-4 py-2 text-sm text-tx-main disabled:opacity-50"
						@click="cancelNextcloud"
					>
						{{ t('common.cancel') }}
					</button>
				</div>
			</div>
		</SectionCard>

		<SectionCard>
			<h3 class="mb-4 text-lg font-medium text-tx-main">{{ t('views.onlineAccounts.providers') }}</h3>

			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div v-for="provider in providers" :key="provider.id" class="flex flex-col gap-1">
					<button
						:disabled="loading"
						:title="unavailableReason(provider)"
						class="flex w-full flex-1 flex-col items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-5 text-center transition-colors"
						:class="
							loading
								? 'opacity-60 cursor-not-allowed'
								: 'hover:border-primary/40 hover:bg-ui-surface cursor-pointer'
						"
						@click="connectProvider(provider)"
					>
						<img
							v-if="icons[provider.id]"
							:src="icons[provider.id]"
							:alt="provider.display_name"
							class="h-10 w-10"
						/>
						<span class="text-sm font-medium text-tx-main">{{ provider.display_name }}</span>
						<ul class="flex flex-wrap justify-center gap-1.5">
							<!-- Las que todavía no existen en VasakOS siguen acá, atenuadas
							     y con el texto que lo dice: una casilla que desaparece
							     parece una que el proveedor no tiene. -->
							<li
								v-for="c in provider.capabilities"
								:key="c"
								class="flex items-center gap-1 text-xs text-tx-muted"
								:class="{ 'opacity-60': !isCapabilityAvailable(provider, c) }"
							>
								<ThemeIcon :name="capabilityIcon(c)" type="symbol" :size="14" />
								{{ capabilityLabel(provider, c) }}
							</li>
						</ul>
						<!-- Ya no está apagado: falta un paso y el botón lleva a darlo.
						     Antes esto decía «no se puede» y lo único que se podía hacer
						     era editar un archivo del sistema como administrador. Y sólo
						     si pegarlas sirve: con nada disponible, las casillas ya dicen
						     por qué, y el clic lo explica sin pedir nada. -->
						<span
							v-if="connectionBlocker(provider) === 'credentialsNeeded'"
							class="text-xs text-status-warning"
						>
							{{ t('views.onlineAccounts.credentials.needed') }}
						</span>
					</button>
					<!-- Aparte de la tarjeta y no adentro: la tarjeta es un botón que
					     conecta, y un botón no puede ir dentro de otro. Sin esto, las
					     credenciales ya guardadas no se podían cambiar ni quitar
					     (Vasak-OS/vasak-settings#132). -->
					<button
						v-if="canManageCredentials(provider)"
						:disabled="loading || credentialsBusy"
						class="self-center rounded-corner px-2 py-1 text-xs text-tx-muted transition-colors hover:text-tx-main disabled:opacity-50"
						@click="openCredentials(provider)"
					>
						{{ t('views.onlineAccounts.credentials.manage') }}
					</button>
				</div>

				<button
					:disabled="loading"
					class="flex flex-col items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-5 text-center transition-colors"
					:class="loading ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/40 hover:bg-ui-surface cursor-pointer'"
					@click="openCustomForm"
				>
					<ThemeIcon
						name="computer-symbolic"
						type="symbol"
						:size="40"
						:alt="t('views.onlineAccounts.customProvider')" />
					<span class="text-sm font-medium text-tx-main">
						{{ t('views.onlineAccounts.customProvider') }}
					</span>
					<span class="text-xs text-tx-muted">IMAP / SMTP / CardDAV / CalDAV</span>
				</button>
			</div>

		</SectionCard>

		<div
			v-if="showCustomForm"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		>
			<div class="w-full max-w-lg rounded-corner border border-ui-border bg-ui-bg p-5 shadow-xl">
				<h2 class="text-lg font-semibold text-tx-main">{{ t('views.onlineAccounts.customProvider') }}</h2>
				<p class="mt-1 text-sm text-tx-muted">
					{{ t('views.onlineAccounts.customDialogDescription') }}
				</p>

				<div class="mt-4 space-y-3">
					<div>
						<label for="custom-display-name" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.displayName') }}</label>
						<input
							id="custom-display-name"
							v-model="customForm.displayName"
							@input="forgetProbe"
							type="text"
							:placeholder="t('views.onlineAccounts.displayNamePlaceholder')"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
							:class="customFormErrors.displayName ? 'border-status-error' : 'border-ui-border focus:border-primary'"
						/>
						<span v-if="customFormErrors.displayName" class="mt-0.5 block text-xs text-status-error">
							{{ customFormErrors.displayName }}
						</span>
					</div>

					<div class="grid grid-cols-3 gap-2">
						<div class="col-span-2">
							<label for="custom-imap-server" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.imapServer') }}</label>
							<input
								id="custom-imap-server"
								v-model="customForm.imapServer"
								@input="forgetProbe"
								type="text"
								placeholder="imap.example.com"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
								:class="customFormErrors.imapServer ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.imapServer" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.imapServer }}
							</span>
						</div>
						<div>
							<label for="custom-imap-port" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.port') }}</label>
							<input
								id="custom-imap-port"
								v-model.number="customForm.imapPort"
								@input="forgetProbe"
								type="number"
								placeholder="993"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
								:class="customFormErrors.imapPort ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.imapPort" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.imapPort }}
							</span>
						</div>
					</div>

					<div class="grid grid-cols-3 gap-2">
						<div class="col-span-2">
							<label for="custom-smtp-server" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.smtpServer') }}</label>
							<input
								id="custom-smtp-server"
								v-model="customForm.smtpServer"
								@input="forgetProbe"
								type="text"
								placeholder="smtp.example.com"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
								:class="customFormErrors.smtpServer ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.smtpServer" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.smtpServer }}
							</span>
						</div>
						<div>
							<label for="custom-smtp-port" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.port') }}</label>
							<input
								id="custom-smtp-port"
								v-model.number="customForm.smtpPort"
								@input="forgetProbe"
								type="number"
								placeholder="587"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
								:class="customFormErrors.smtpPort ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.smtpPort" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.smtpPort }}
							</span>
						</div>
					</div>

					<div>
						<label for="custom-username" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.username') }}</label>
						<input
							id="custom-username"
							v-model="customForm.username"
							@input="forgetProbe"
							type="text"
							:placeholder="t('views.onlineAccounts.usernamePlaceholder')"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
							:class="customFormErrors.username ? 'border-status-error' : 'border-ui-border focus:border-primary'"
						/>
						<span v-if="customFormErrors.username" class="mt-0.5 block text-xs text-status-error">
							{{ customFormErrors.username }}
						</span>
					</div>

					<div>
						<label for="custom-password" class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.password') }}</label>
						<input
							id="custom-password"
							v-model="customForm.password"
							@input="forgetProbe"
							type="password"
							:placeholder="t('views.onlineAccounts.passwordPlaceholder')"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm"
							:class="customFormErrors.password ? 'border-status-error' : 'border-ui-border focus:border-primary'"
						/>
						<span v-if="customFormErrors.password" class="mt-0.5 block text-xs text-status-error">
							{{ customFormErrors.password }}
						</span>
					</div>
				</div>

				<!-- El resultado de la prueba, una punta por vez.
				     Separadas a propósito: es muy común que la entrada funcione y
				     la salida no, y un «no anda» único mandaría a revisar los seis
				     campos en vez de los tres que corresponden. -->
				<div v-if="probe" class="mt-4 flex flex-col gap-2">
					<div
						v-for="endpoint in [
							{ key: 'imap', result: probe.imap },
							{ key: 'smtp', result: probe.smtp },
						]"
						:key="endpoint.key"
						class="rounded-corner border px-3 py-2 text-xs"
						:class="
							endpoint.result.ok
								? 'border-status-success/30 bg-status-success/10 text-status-success'
								: 'border-status-error/30 bg-status-error/10 text-status-error'
						"
					>
						<span class="font-medium">
							{{ endpoint.result.ok ? '✓' : '✕' }}
							{{ t(`views.onlineAccounts.probe.${endpoint.key}`) }}
						</span>
						<span v-if="endpoint.result.detail"> — {{ endpoint.result.detail }}</span>
					</div>

					<!-- Una prueba puede dar un falso negativo, así que el fallo no
					     bloquea: se avisa y el botón pasa a guardar igual. -->
					<p v-if="!probeOk" class="text-xs text-tx-muted">
						{{ t('views.onlineAccounts.probe.saveAnywayHint') }}
					</p>
				</div>

				<!-- Lo que se encontró de calendario y contactos.
				     Por separado, como la prueba de correo: es muy común que un
				     servidor tenga uno y no el otro. -->
				<div v-if="dav" class="mt-4 flex flex-col gap-2">
					<div
						v-for="finding in [
							{ key: 'calendar', result: dav.calendar },
							{ key: 'contacts', result: dav.contacts },
						]"
						:key="finding.key"
						class="rounded-corner border px-3 py-2 text-xs"
						:class="
							finding.result.url
								? 'border-status-success/30 bg-status-success/10 text-status-success'
								: 'border-ui-border bg-ui-surface/70 text-tx-muted'
						"
					>
						<span class="font-medium">
							{{ finding.result.url ? '✓' : '—' }}
							{{ t(`views.onlineAccounts.capabilities.${finding.key}`) }}
						</span>
						<span v-if="finding.result.url" class="break-all">
							— {{ finding.result.url }}
						</span>
						<span v-else-if="finding.result.detail"> — {{ finding.result.detail }}</span>
					</div>

					<!-- No encontrar no impide nada: hay servidores que no hacen
					     autodescubrimiento y andan perfecto para el correo. -->
					<p
						v-if="!dav.calendar.url && !dav.contacts.url"
						class="text-xs text-tx-muted"
					>
						{{ t('views.onlineAccounts.dav.nothingFoundHint') }}
					</p>
				</div>

				<div class="mt-5 flex justify-end gap-2">
					<button
						class="rounded-corner border border-ui-border px-4 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface"
						:disabled="loading || probing"
						@click="cancelCustomForm"
					>
						{{ t('common.cancel') }}
					</button>
					<button
						class="rounded-corner border border-ui-border px-4 py-1.5 text-sm text-tx-main transition-colors hover:bg-ui-surface"
						:disabled="loading || probing || discoveringDav || !isCustomValid"
						@click="testConnection"
					>
						{{ probing ? t('views.onlineAccounts.probe.testing') : t('views.onlineAccounts.probe.test') }}
					</button>
					<button
						class="rounded-corner border border-ui-border px-4 py-1.5 text-sm text-tx-main transition-colors hover:bg-ui-surface"
						:disabled="loading || probing || discoveringDav || !isCustomValid"
						:title="t('views.onlineAccounts.dav.hint')"
						@click="lookUpDav"
					>
						{{ discoveringDav ? t('views.onlineAccounts.dav.searching') : t('views.onlineAccounts.dav.search') }}
					</button>
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
						:disabled="loading || probing || discoveringDav || !isCustomValid"
						@click="submitCustomProvider"
					>
						{{
							loading
								? t('common.saving')
								: probe && !probeOk
									? t('views.onlineAccounts.probe.saveAnyway')
									: t('views.onlineAccounts.addAccount')
						}}
					</button>
				</div>
			</div>
		</div>

	</div>
</template>
