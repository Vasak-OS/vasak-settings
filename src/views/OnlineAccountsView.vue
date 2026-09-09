<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, reactive, ref } from 'vue';
import AccountPermissionsSection from '@/components/accounts/AccountPermissionsSection.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { useReactiveSymbol } from '@/composables/useReactiveIcon';
import {
	type AccountInfo,
	connectNextcloudAccount,
	connectOauthAccount,
	listAccounts,
	listProviders,
	type ProviderInfo,
	registerPasswordAccount,
	removeAccount,
} from '@/services/accounts.service';

/**
 * El proveedor personalizado no está en el catálogo del servicio.
 *
 * Los del catálogo son proveedores OAuth2: tienen URLs y un `client_id`. Éste es
 * el camino de IMAP/SMTP con contraseña de aplicación, que no habla OAuth con
 * nadie, así que se dibuja al lado pero no sale de la misma lista.
 */
const PERSONALIZADO = 'custom';

const { t } = useI18n();

const providers = ref<ProviderInfo[]>([]);

/**
 * Por qué un proveedor no se puede conectar todavía, o `undefined` si sí.
 *
 * Un botón que abre un flujo roto es peor que un botón apagado: la persona no
 * sabe si se equivocó ella, si falta un dato o si el sistema está mal. Acá el
 * motivo es siempre el mismo —falta el `client_id`— y por eso el texto dice qué
 * hacer al respecto.
 */
const motivoNoDisponible = (provider: ProviderInfo): string | undefined =>
	provider.configured ? undefined : t('views.onlineAccounts.unavailable.noClientId');

const iconoDe = (id: string) => `${id}-symbolic`;

const errors = ref('');
const success = ref('');
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

/**
 * Los iconos, uno por proveedor.
 *
 * Se resuelven cuando llega el catálogo y no antes: la lista de proveedores la
 * decide el servicio, así que acá no se puede saber de antemano cuáles hay.
 */
const iconos = ref<Record<string, string>>({});
const [customIcon, updateCustomIcon] = useReactiveSymbol(() => 'computer-symbolic');

const resolverIconos = async () => {
	const resueltos: Record<string, string> = {};
	await Promise.all(
		providers.value.map(async (provider) => {
			const [icono, actualizar] = useReactiveSymbol(() => iconoDe(provider.id));
			await actualizar();
			if (icono.value) resueltos[provider.id] = icono.value;
		})
	);
	iconos.value = resueltos;
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
 * Se piden **todas** sus capacidades juntas: el proveedor muestra una sola
 * pantalla de consentimiento, y pedirlas de a una obligaría a pasar por ahí una
 * vez por capacidad para terminar con el mismo permiso.
 */
const conectarProveedor = async (provider: ProviderInfo) => {
	if (motivoNoDisponible(provider)) return;

	// Nextcloud no puede empezar sin la dirección: no hay un servidor conocido al
	// que mandar el navegador, porque el servidor es el de la propia persona.
	if (provider.kind === 'nextcloud') {
		abrirFormularioNextcloud(provider);
		return;
	}

	loading.value = true;
	errors.value = '';
	success.value = '';

	try {
		await connectOauthAccount(provider.id, provider.capabilities, provider.display_name);
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

const abrirFormularioNextcloud = (provider: ProviderInfo) => {
	errors.value = '';
	success.value = '';
	nextcloudError.value = '';
	nextcloudForm.server = '';
	nextcloudForm.displayName = '';
	nextcloudProvider.value = provider;
};

const cancelarNextcloud = () => {
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
const esperandoNextcloud = ref(false);

const conectarNextcloud = async () => {
	const provider = nextcloudProvider.value;
	if (!provider) return;

	if (!nextcloudForm.server.trim()) {
		nextcloudError.value = t('views.onlineAccounts.errors.serverRequired');
		return;
	}

	esperandoNextcloud.value = true;
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
		esperandoNextcloud.value = false;
	}
};

const abrirFormularioPersonalizado = () => {
	errors.value = '';
	success.value = '';
	showCustomForm.value = true;
};

const submitCustomProvider = async () => {
	if (!validateCustomForm()) return;

	loading.value = true;
	errors.value = '';
	success.value = '';

	try {
		await registerPasswordAccount(
			PERSONALIZADO,
			customForm.displayName,
			'email',
			{
				imap_server: customForm.imapServer,
				imap_port: customForm.imapPort,
				smtp_server: customForm.smtpServer,
				smtp_port: customForm.smtpPort,
				username: customForm.username,
			},
			customForm.password
		);

		success.value = t('views.onlineAccounts.customAdded');
		showCustomForm.value = false;
		resetCustomForm();
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
};

const deleteAccount = async (account: AccountInfo) => {
	try {
		errors.value = '';
		await removeAccount(account.id);
		success.value = t('views.onlineAccounts.accountRemoved').replace(
			'{0}',
			account.display_name || account.provider
		);
		await fetchAccounts();
	} catch (err) {
		errors.value = t('views.onlineAccounts.errors.deleteAccount').replace('{0}', String(err));
	}
};

const fetchProviders = async () => {
	try {
		providers.value = await listProviders();
		await resolverIconos();
	} catch (err) {
		// El catálogo no es imprescindible para ver las cuentas que ya están, así
		// que el fallo se cuenta y la pantalla sigue sirviendo.
		errors.value = t('views.onlineAccounts.errors.loadProviders').replace('{0}', String(err));
	}
};

onMounted(async () => {
	await Promise.all([fetchAccounts(), fetchProviders(), updateCustomIcon()]);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.onlineAccounts.title')"
			:description="t('views.onlineAccounts.description')"
		/>

		<AlertMessage v-if="errors" :message="errors" tone="error" />
		<AlertMessage v-if="success" :message="success" tone="success" />

		<SectionCard>
			<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.onlineAccounts.providers') }}</h3>

			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<button
					v-for="provider in providers"
					:key="provider.id"
					:disabled="loading || !!motivoNoDisponible(provider)"
					:title="motivoNoDisponible(provider)"
					class="flex flex-col items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 px-4 py-5 text-center transition-colors"
					:class="
						loading || motivoNoDisponible(provider)
							? 'opacity-60 cursor-not-allowed'
							: 'hover:border-primary/40 hover:bg-ui-surface cursor-pointer'
					"
					@click="conectarProveedor(provider)"
				>
					<img
						v-if="iconos[provider.id]"
						:src="iconos[provider.id]"
						:alt="provider.display_name"
						class="h-10 w-10"
						:class="motivoNoDisponible(provider) && 'grayscale'"
					/>
					<span class="text-sm font-medium text-tx-primary">{{ provider.display_name }}</span>
					<span class="text-xs text-tx-muted">
						{{ provider.capabilities.map((c) => t(`views.onlineAccounts.capabilities.${c}`)).join(' · ') }}
					</span>
					<!-- El motivo, no un «no disponible» a secas: quien lo lee tiene que
					     poder saber si le falta hacer algo o si es el sistema el que
					     todavía no llegó. -->
					<span v-if="motivoNoDisponible(provider)" class="text-xs text-status-warning">
						{{ motivoNoDisponible(provider) }}
					</span>
				</button>

				<button
					:disabled="loading"
					class="flex flex-col items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 px-4 py-5 text-center transition-colors"
					:class="loading ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/40 hover:bg-ui-surface cursor-pointer'"
					@click="abrirFormularioPersonalizado"
				>
					<img
						v-if="customIcon"
						:src="customIcon"
						:alt="t('views.onlineAccounts.customProvider')"
						class="h-10 w-10"
						:class="provider.unavailable && 'grayscale'"
					/>
					<span class="text-sm font-medium text-tx-primary">
						{{ t('views.onlineAccounts.customProvider') }}
					</span>
					<span class="text-xs text-tx-muted">IMAP / SMTP / CardDAV / CalDAV</span>
				</button>
			</div>

		</SectionCard>

		<SectionCard v-if="nextcloudProvider">
			<h3 class="mb-1 text-lg font-medium text-tx-primary">
				{{ t('views.onlineAccounts.nextcloud.title').replace('{0}', nextcloudProvider.display_name) }}
			</h3>
			<p class="mb-4 text-sm text-tx-muted">
				{{ t('views.onlineAccounts.nextcloud.description') }}
			</p>

			<AlertMessage v-if="nextcloudError" :message="nextcloudError" tone="error" />

			<div class="flex flex-col gap-3">
				<label class="flex flex-col gap-1">
					<span class="text-sm text-tx-main">{{ t('views.onlineAccounts.nextcloud.server') }}</span>
					<input
						v-model="nextcloudForm.server"
						type="text"
						:disabled="esperandoNextcloud"
						:placeholder="t('views.onlineAccounts.nextcloud.serverPlaceholder')"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="conectarNextcloud"
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
						:disabled="esperandoNextcloud"
						:placeholder="t('views.onlineAccounts.nextcloud.namePlaceholder')"
						class="rounded-corner border border-ui-border bg-ui-surface px-3 py-2 text-sm text-tx-main disabled:opacity-50"
						@keyup.enter="conectarNextcloud"
					/>
				</label>

				<!-- Mientras espera, se dice dónde está la pelota. Sin esto la
				     ventana parece colgada durante todo el tiempo que la persona
				     tarda en autenticarse en su servidor. -->
				<p v-if="esperandoNextcloud" class="text-sm text-tx-muted">
					{{ t('views.onlineAccounts.nextcloud.waiting') }}
				</p>

				<div class="flex gap-2">
					<button
						:disabled="esperandoNextcloud"
						class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
						@click="conectarNextcloud"
					>
						{{ t('views.onlineAccounts.nextcloud.connect') }}
					</button>
					<button
						:disabled="esperandoNextcloud"
						class="rounded-corner border border-ui-border px-4 py-2 text-sm text-tx-main disabled:opacity-50"
						@click="cancelarNextcloud"
					>
						{{ t('common.cancel') }}
					</button>
				</div>
			</div>
		</SectionCard>

		<SectionCard v-if="accounts.length > 0">
			<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.onlineAccounts.linkedAccounts') }}</h3>

			<ul class="flex flex-col gap-2">
				<li
					v-for="account in accounts"
					:key="account.id"
					class="flex items-center justify-between rounded-corner border border-ui-border bg-ui-surface/40 px-4 py-3"
				>
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm font-medium text-tx-primary">
							{{ account.display_name || account.provider_type }}
						</span>
						<span class="text-xs text-tx-muted">
							{{ account.provider_type }}
							<template v-if="account.capabilities.length">
								&middot;
								{{ account.capabilities.map((c) => t(`views.onlineAccounts.capabilities.${c}`)).join(' · ') }}
							</template>
						</span>
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

		<div
			v-if="showCustomForm"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		>
			<div class="w-full max-w-lg rounded-corner border border-ui-border bg-ui-bg p-5 shadow-xl">
				<h2 class="text-lg font-semibold text-tx-primary">{{ t('views.onlineAccounts.customProvider') }}</h2>
				<p class="mt-1 text-sm text-tx-muted">
					{{ t('views.onlineAccounts.customDialogDescription') }}
				</p>

				<div class="mt-4 space-y-3">
					<div>
						<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.displayName') }}</label>
						<input
							v-model="customForm.displayName"
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
							<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.imapServer') }}</label>
							<input
								v-model="customForm.imapServer"
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
							<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.port') }}</label>
							<input
								v-model.number="customForm.imapPort"
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
							<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.smtpServer') }}</label>
							<input
								v-model="customForm.smtpServer"
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
							<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.port') }}</label>
							<input
								v-model.number="customForm.smtpPort"
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
						<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.username') }}</label>
						<input
							v-model="customForm.username"
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
						<label class="block text-xs font-medium text-tx-muted">{{ t('views.onlineAccounts.password') }}</label>
						<input
							v-model="customForm.password"
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

				<div class="mt-5 flex justify-end gap-2">
					<button
						class="rounded-corner border border-ui-border px-4 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface"
						:disabled="loading"
						@click="cancelCustomForm"
					>
						{{ t('common.cancel') }}
					</button>
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
						:disabled="loading || !isCustomValid"
						@click="submitCustomProvider"
					>
						{{ loading ? t('common.saving') : t('views.onlineAccounts.addAccount') }}
					</button>
				</div>
			</div>
		</div>

		<!-- Qué aplicaciones pueden usar estas cuentas. Vivía en una pantalla
		     aparte llamada «Privacidad y seguridad», que prometía cámara y
		     micrófono sin poder controlarlos. -->
		<AccountPermissionsSection />
	</div>
</template>
