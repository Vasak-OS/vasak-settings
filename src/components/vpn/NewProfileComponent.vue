<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VpnCreateInput, VpnType, VpnUpdateInput } from '@/services/network.service';

export interface Props {
	open: boolean;
	editingUuid?: string | null;
	initialId?: string;
	initialType?: VpnType;
	initialAutoconnect?: boolean;
}

export interface Emits {
	'update:open': [boolean];
	submit: [VpnCreateInput | VpnUpdateInput];
	cancel: [];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Form fields
const profileId = ref('');
const profileType = ref<VpnType>('generic');
const profileAutoconnect = ref(false);
const profileGateway = ref('');
const profileUsername = ref('');
const profilePassword = ref('');
const profileCaCertPath = ref('');
const profileUserCertPath = ref('');
const profilePrivateKeyPath = ref('');
const profilePrivateKeyPassword = ref('');
const profileSettingsJson = ref('');
const profileSecretsJson = ref('');

const isSubmitting = ref(false);
const formError = ref('');

const vpnTypes: Array<{ value: VpnType; label: string }> = [
	{ value: 'open-vpn', label: 'OpenVPN' },
	{ value: 'wire-guard', label: 'WireGuard' },
	{ value: 'l2tp', label: 'L2TP' },
	{ value: 'pptp', label: 'PPTP' },
	{ value: 'sstp', label: 'SSTP' },
	{ value: 'ikev2', label: 'IKEv2' },
	{ value: 'fortisslvpn', label: 'FortiSSLVPN' },
	{ value: 'open-connect', label: 'OpenConnect' },
	{ value: 'generic', label: 'Generic' },
];

const dialogTitle = computed(() => (props.editingUuid ? 'Editar perfil VPN' : 'Crear perfil VPN'));

const resetForm = () => {
	profileId.value = props.initialId || '';
	profileType.value = props.initialType || 'generic';
	profileAutoconnect.value = props.initialAutoconnect || false;
	profileGateway.value = '';
	profileUsername.value = '';
	profilePassword.value = '';
	profileCaCertPath.value = '';
	profileUserCertPath.value = '';
	profilePrivateKeyPath.value = '';
	profilePrivateKeyPassword.value = '';
	profileSettingsJson.value = '';
	profileSecretsJson.value = '';
	formError.value = '';
};

const parseStringMap = (raw: string, label: string): Record<string, string> | undefined => {
	if (!raw.trim()) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`${label} debe ser un JSON válido`);
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} debe ser un objeto clave/valor`);
	}

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (typeof value !== 'string') {
			throw new Error(`${label}: el valor de '${key}' debe ser string`);
		}
		out[key] = value;
	}

	return out;
};

const buildCreateInput = (): VpnCreateInput => {
	const settings = parseStringMap(profileSettingsJson.value, 'Settings');
	const secrets = parseStringMap(profileSecretsJson.value, 'Secrets');

	return {
		id: profileId.value.trim(),
		vpn_type: profileType.value,
		autoconnect: profileAutoconnect.value,
		username: profileUsername.value.trim() || undefined,
		password: profilePassword.value || undefined,
		gateway: profileGateway.value.trim() || undefined,
		ca_cert_path: profileCaCertPath.value.trim() || undefined,
		user_cert_path: profileUserCertPath.value.trim() || undefined,
		private_key_path: profilePrivateKeyPath.value.trim() || undefined,
		private_key_password: profilePrivateKeyPassword.value || undefined,
		settings,
		secrets,
	};
};

const buildUpdateInput = (uuid: string): VpnUpdateInput => {
	const settings = parseStringMap(profileSettingsJson.value, 'Settings');
	const secrets = parseStringMap(profileSecretsJson.value, 'Secrets');

	return {
		uuid,
		id: profileId.value.trim() || undefined,
		autoconnect: profileAutoconnect.value,
		username: profileUsername.value.trim() || undefined,
		password: profilePassword.value || undefined,
		gateway: profileGateway.value.trim() || undefined,
		ca_cert_path: profileCaCertPath.value.trim() || undefined,
		user_cert_path: profileUserCertPath.value.trim() || undefined,
		private_key_path: profilePrivateKeyPath.value.trim() || undefined,
		private_key_password: profilePrivateKeyPassword.value || undefined,
		settings,
		secrets,
	};
};

const handleSubmit = async () => {
	if (!profileId.value.trim()) {
		formError.value = 'El nombre del perfil es obligatorio';
		return;
	}

	isSubmitting.value = true;
	formError.value = '';

	try {
		if (props.editingUuid) {
			emit('submit', buildUpdateInput(props.editingUuid));
		} else {
			emit('submit', buildCreateInput());
		}
	} catch (submitError) {
		formError.value =
			submitError instanceof Error ? submitError.message : 'Error al guardar el perfil';
	} finally {
		isSubmitting.value = false;
	}
};

const handleCancel = () => {
	resetForm();
	emit('cancel');
};

const handleClose = () => {
	emit('update:open', false);
};
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
		<div class="w-full max-w-2xl rounded-corner border border-ui-border bg-ui-bg p-4 shadow-xl">
			<h2 class="text-lg font-semibold text-tx-primary">{{ dialogTitle }}</h2>
			<p class="mt-1 text-sm text-tx-muted">Configura los datos principales del perfil VPN.</p>

			<div v-if="formError" class="mt-3 rounded border border-status-danger/30 bg-status-danger/10 p-2 text-xs text-status-danger">
				{{ formError }}
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-2">
				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Nombre del perfil
					<input
						v-model="profileId"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Tipo VPN
					<select
						v-model="profileType"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					>
						<option v-for="opt in vpnTypes" :key="opt.value" :value="opt.value">
							{{ opt.label }}
						</option>
					</select>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Gateway / Remote
					<input
						v-model="profileGateway"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Usuario
					<input
						v-model="profileUsername"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Password
					<input
						v-model="profilePassword"
						type="password"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					CA cert path
					<input
						v-model="profileCaCertPath"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					User cert path
					<input
						v-model="profileUserCertPath"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Private key path
					<input
						v-model="profilePrivateKeyPath"
						type="text"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Private key password
					<input
						v-model="profilePrivateKeyPassword"
						type="password"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</label>
			</div>

			<div class="mt-3 grid gap-3 md:grid-cols-2">
				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Settings JSON (objeto string/string)
					<textarea
						v-model="profileSettingsJson"
						rows="4"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-xs"
						placeholder='{"remote":"vpn.example.com:51820"}'
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Secrets JSON (objeto string/string)
					<textarea
						v-model="profileSecretsJson"
						rows="4"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-xs"
						placeholder='{"private_key":"***"}'
					/>
				</label>
			</div>

			<label class="mt-2 flex items-center gap-2 text-sm text-tx-muted">
				<input v-model="profileAutoconnect" type="checkbox" />
				Autoconectar este perfil
			</label>

			<div class="mt-4 flex justify-end gap-2">
				<button
					class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface"
					@click="handleCancel"
					:disabled="isSubmitting"
				>
					Cancelar
				</button>
				<button
					class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
					@click="handleSubmit"
					:disabled="isSubmitting"
				>
					{{ isSubmitting ? 'Guardando...' : 'Guardar perfil' }}
				</button>
			</div>
		</div>
	</div>
</template>
