<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { useReactiveSymbol } from '@/composables/useReactiveIcon';
import {
	listAccounts,
	registerNewAccount,
	removeAccount,
	type AccountInfo,
} from '@/services/accounts.service';

type ProviderKind = 'google' | 'proton' | 'nextcloud' | 'custom';

interface ProviderDef {
	kind: ProviderKind;
	label: string;
	description: string;
	icon: string;
}

const PROVIDERS: ProviderDef[] = [
	{
		kind: 'google',
		label: 'Google',
		description: 'Gmail, Calendar, Contacts, Drive',
		icon: 'google-symbolic',
	},
	{
		kind: 'proton',
		label: 'Proton',
		description: 'Mail, Calendar, Drive, VPN',
		icon: 'proton-symbolic',
	},
	{
		kind: 'nextcloud',
		label: 'Nextcloud',
		description: 'Files, Calendar, Contacts, Talk',
		icon: 'nextcloud-symbolic',
	},
	{
		kind: 'custom',
		label: 'Servidor personalizado',
		description: 'IMAP / SMTP / CardDAV / CalDAV',
		icon: 'computer-symbolic',
	},
];

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

const [googleIcon, updateGoogleIcon] = useReactiveSymbol(() => 'google-symbolic');
const [protonIcon, updateProtonIcon] = useReactiveSymbol(() => 'proton-symbolic');
const [nextcloudIcon, updateNextcloudIcon] = useReactiveSymbol(() => 'nextcloud-symbolic');
const [customIcon, updateCustomIcon] = useReactiveSymbol(() => 'computer-symbolic');

const providerIcons: Record<ProviderKind, ReturnType<typeof useReactiveSymbol>[0]> = {
	google: googleIcon,
	proton: protonIcon,
	nextcloud: nextcloudIcon,
	custom: customIcon,
};

const validateCustomForm = (): boolean => {
	let valid = true;

	if (!customForm.displayName.trim()) {
		customFormErrors.displayName = 'El nombre es obligatorio';
		valid = false;
	} else {
		customFormErrors.displayName = '';
	}

	if (!customForm.imapServer.trim()) {
		customFormErrors.imapServer = 'El servidor IMAP es obligatorio';
		valid = false;
	} else {
		customFormErrors.imapServer = '';
	}

	if (!customForm.imapPort || customForm.imapPort < 1 || customForm.imapPort > 65535) {
		customFormErrors.imapPort = 'Puerto inválido (1-65535)';
		valid = false;
	} else {
		customFormErrors.imapPort = '';
	}

	if (!customForm.smtpServer.trim()) {
		customFormErrors.smtpServer = 'El servidor SMTP es obligatorio';
		valid = false;
	} else {
		customFormErrors.smtpServer = '';
	}

	if (!customForm.smtpPort || customForm.smtpPort < 1 || customForm.smtpPort > 65535) {
		customFormErrors.smtpPort = 'Puerto inválido (1-65535)';
		valid = false;
	} else {
		customFormErrors.smtpPort = '';
	}

	if (!customForm.username.trim()) {
		customFormErrors.username = 'El usuario es obligatorio';
		valid = false;
	} else {
		customFormErrors.username = '';
	}

	if (!customForm.password) {
		customFormErrors.password = 'La contraseña es obligatoria';
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
		errors.value = `Error al cargar cuentas: ${err}`;
	}
};

const handleProviderClick = async (provider: ProviderDef) => {
	errors.value = '';
	success.value = '';

	if (provider.kind === 'custom') {
		showCustomForm.value = true;
		return;
	}

	if (provider.kind === 'google') {
		await startGoogleOAuth();
		return;
	}

	if (provider.kind === 'proton' || provider.kind === 'nextcloud') {
		await registerWellKnown(provider.kind);
	}
};

const GOOGLE_CLIENT_ID = '';
const GOOGLE_SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/calendar.readonly',
	'https://www.googleapis.com/auth/contacts.readonly',
];

const startGoogleOAuth = async () => {
	loading.value = true;
	errors.value = '';
	success.value = '';

	try {
		const code = await invoke<string>('start_google_oauth', {
			clientId: GOOGLE_CLIENT_ID,
			scopes: GOOGLE_SCOPES,
		});

		const body = new URLSearchParams({
			code,
			client_id: GOOGLE_CLIENT_ID,
			redirect_uri: `http://127.0.0.1:0/callback`,
			grant_type: 'authorization_code',
		});

		const resp = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`Google token endpoint error: ${resp.status} ${text}`);
		}

		const data = await resp.json();
		const token = data.access_token as string;

		await registerNewAccount(
			'google',
			{
				display_name: 'Google',
				scope: GOOGLE_SCOPES,
				token_type: 'Bearer',
			},
			token,
		);

		success.value = 'Cuenta de Google agregada correctamente';
		await fetchAccounts();
	} catch (err) {
		errors.value = `Error en autenticación Google: ${err}`;
	} finally {
		loading.value = false;
	}
};

const registerWellKnown = async (provider: ProviderKind) => {
	loading.value = true;
	errors.value = '';
	success.value = '';

	try {
		const label = provider === 'proton' ? 'Proton' : 'Nextcloud';
		await registerNewAccount(provider, { display_name: label }, '');
		success.value = `Cuenta de ${provider === 'proton' ? 'Proton' : 'Nextcloud'} registrada.`;
		await fetchAccounts();
	} catch (err) {
		errors.value = `Error al registrar ${provider}: ${err}`;
	} finally {
		loading.value = false;
	}
};

const submitCustomProvider = async () => {
	if (!validateCustomForm()) return;

	loading.value = true;
	errors.value = '';
	success.value = '';

	try {
		await registerNewAccount(
			'custom',
			{
				display_name: customForm.displayName,
				imap_server: customForm.imapServer,
				imap_port: customForm.imapPort,
				smtp_server: customForm.smtpServer,
				smtp_port: customForm.smtpPort,
				username: customForm.username,
			},
			customForm.password,
		);

		success.value = 'Cuenta personalizada agregada correctamente';
		showCustomForm.value = false;
		resetCustomForm();
		await fetchAccounts();
	} catch (err) {
		errors.value = `Error al registrar cuenta personalizada: ${err}`;
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
		success.value = `Cuenta de ${account.display_name || account.provider} eliminada.`;
		await fetchAccounts();
	} catch (err) {
		errors.value = `Error al eliminar cuenta: ${err}`;
	}
};

onMounted(async () => {
	await fetchAccounts();
	await Promise.all([
		updateGoogleIcon(),
		updateProtonIcon(),
		updateNextcloudIcon(),
		updateCustomIcon(),
	]);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Sistema"
			title="Cuentas en Línea"
			description="Conecta tus servicios de correo, calendario y contactos."
		/>

		<AlertMessage v-if="errors" :message="errors" tone="error" />
		<AlertMessage v-if="success" :message="success" tone="success" />

		<SectionCard>
			<h3 class="mb-4 text-lg font-medium text-tx-primary">Proveedores</h3>

			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<button
					v-for="provider in PROVIDERS"
					:key="provider.kind"
					:disabled="loading"
					class="flex flex-col items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 px-4 py-5 text-center transition-colors"
					:class="loading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/40 hover:bg-ui-surface cursor-pointer'"
					@click="handleProviderClick(provider)"
				>
					<img
						v-if="providerIcons[provider.kind].value"
						:src="providerIcons[provider.kind].value"
						:alt="provider.label"
						class="h-10 w-10"
					/>
					<span class="text-sm font-medium text-tx-primary">{{ provider.label }}</span>
					<span class="text-xs text-tx-muted">{{ provider.description }}</span>
				</button>
			</div>
		</SectionCard>

		<SectionCard v-if="accounts.length > 0">
			<h3 class="mb-4 text-lg font-medium text-tx-primary">Cuentas vinculadas</h3>

			<ul class="flex flex-col gap-2">
				<li
					v-for="account in accounts"
					:key="account.id"
					class="flex items-center justify-between rounded-corner border border-ui-border bg-ui-surface/40 px-4 py-3"
				>
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm font-medium text-tx-primary">
							{{ account.display_name || account.provider }}
						</span>
						<span class="text-xs text-tx-muted">
							{{ account.provider }} &middot; {{ account.created_at }}
						</span>
					</div>

					<button
						class="rounded-corner border border-ui-border px-3 py-1.5 text-xs text-tx-muted transition-colors hover:border-status-error/40 hover:bg-status-error/10 hover:text-status-error"
						@click="deleteAccount(account)"
					>
						Eliminar
					</button>
				</li>
			</ul>
		</SectionCard>

		<div
			v-if="showCustomForm"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		>
			<div class="w-full max-w-lg rounded-corner border border-ui-border bg-ui-bg p-5 shadow-xl">
				<h2 class="text-lg font-semibold text-tx-primary">Servidor personalizado</h2>
				<p class="mt-1 text-sm text-tx-muted">
					Configura manualmente los datos de tu servidor de correo y sincronización.
				</p>

				<div class="mt-4 space-y-3">
					<div>
						<label class="block text-xs font-medium text-tx-muted">Nombre para mostrar</label>
						<input
							v-model="customForm.displayName"
							type="text"
							placeholder="Mi cuenta personal"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
							:class="customFormErrors.displayName ? 'border-status-error' : 'border-ui-border focus:border-primary'"
						/>
						<span v-if="customFormErrors.displayName" class="mt-0.5 block text-xs text-status-error">
							{{ customFormErrors.displayName }}
						</span>
					</div>

					<div class="grid grid-cols-3 gap-2">
						<div class="col-span-2">
							<label class="block text-xs font-medium text-tx-muted">Servidor IMAP</label>
							<input
								v-model="customForm.imapServer"
								type="text"
								placeholder="imap.example.com"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
								:class="customFormErrors.imapServer ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.imapServer" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.imapServer }}
							</span>
						</div>
						<div>
							<label class="block text-xs font-medium text-tx-muted">Puerto</label>
							<input
								v-model.number="customForm.imapPort"
								type="number"
								placeholder="993"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
								:class="customFormErrors.imapPort ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.imapPort" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.imapPort }}
							</span>
						</div>
					</div>

					<div class="grid grid-cols-3 gap-2">
						<div class="col-span-2">
							<label class="block text-xs font-medium text-tx-muted">Servidor SMTP</label>
							<input
								v-model="customForm.smtpServer"
								type="text"
								placeholder="smtp.example.com"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
								:class="customFormErrors.smtpServer ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.smtpServer" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.smtpServer }}
							</span>
						</div>
						<div>
							<label class="block text-xs font-medium text-tx-muted">Puerto</label>
							<input
								v-model.number="customForm.smtpPort"
								type="number"
								placeholder="587"
								class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
								:class="customFormErrors.smtpPort ? 'border-status-error' : 'border-ui-border focus:border-primary'"
							/>
							<span v-if="customFormErrors.smtpPort" class="mt-0.5 block text-xs text-status-error">
								{{ customFormErrors.smtpPort }}
							</span>
						</div>
					</div>

					<div>
						<label class="block text-xs font-medium text-tx-muted">Nombre de usuario</label>
						<input
							v-model="customForm.username"
							type="text"
							placeholder="usuario@example.com"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
							:class="customFormErrors.username ? 'border-status-error' : 'border-ui-border focus:border-primary'"
						/>
						<span v-if="customFormErrors.username" class="mt-0.5 block text-xs text-status-error">
							{{ customFormErrors.username }}
						</span>
					</div>

					<div>
						<label class="block text-xs font-medium text-tx-muted">Contraseña</label>
						<input
							v-model="customForm.password"
							type="password"
							placeholder="Contraseña de aplicación"
							class="mt-1 w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm outline-none"
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
						Cancelar
					</button>
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
						:disabled="loading || !isCustomValid"
						@click="submitCustomProvider"
					>
						{{ loading ? 'Guardando...' : 'Agregar cuenta' }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
