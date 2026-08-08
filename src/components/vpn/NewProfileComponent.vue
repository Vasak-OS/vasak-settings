<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, ref } from 'vue';
import TextInput from '@/components/ui/TextInput.vue';
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

const { t } = useI18n();

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

const dialogTitle = computed(() =>
	props.editingUuid
		? t('views.networkVpn.dialog.editTitle')
		: t('views.networkVpn.dialog.createTitle')
);

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
		throw new Error(t('views.networkVpn.dialog.errors.invalidJson').replace('{0}', label));
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(t('views.networkVpn.dialog.errors.notKeyValue').replace('{0}', label));
	}

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (typeof value !== 'string') {
			throw new Error(
				t('views.networkVpn.dialog.errors.valueNotString').replace('{0}', label).replace('{1}', key)
			);
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
		formError.value = t('views.networkVpn.dialog.errors.nameRequired');
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
			submitError instanceof Error ? submitError.message : t('views.networkVpn.dialog.errors.save');
	} finally {
		isSubmitting.value = false;
	}
};

const handleCancel = () => {
	resetForm();
	emit('cancel');
};
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
		<div class="w-full max-w-2xl rounded-corner border border-ui-border bg-ui-bg p-4 shadow-xl">
			<h2 class="text-lg font-semibold text-tx-primary">{{ dialogTitle }}</h2>
			<p class="mt-1 text-sm text-tx-muted">{{ t('views.networkVpn.dialog.description') }}</p>

			<div v-if="formError" class="mt-3 rounded border border-status-danger/30 bg-status-danger/10 p-2 text-xs text-status-danger">
				{{ formError }}
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-2">
				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.dialog.profileName') }}
					<TextInput v-model="profileId" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.dialog.vpnType') }}
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
					<TextInput v-model="profileGateway" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.dialog.username') }}
					<TextInput v-model="profileUsername" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Password
					<TextInput v-model="profilePassword" type="password" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					CA cert path
					<TextInput v-model="profileCaCertPath" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					User cert path
					<TextInput v-model="profileUserCertPath" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Private key path
					<TextInput v-model="profilePrivateKeyPath" class="mt-1" />
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					Private key password
					<TextInput v-model="profilePrivateKeyPassword" type="password" class="mt-1" />
				</label>
			</div>

			<div class="mt-3 grid gap-3 md:grid-cols-2">
				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.dialog.settingsJson') }}
					<textarea
						v-model="profileSettingsJson"
						rows="4"
						class="mt-1 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-xs"
						placeholder='{"remote":"vpn.example.com:51820"}'
					/>
				</label>

				<label class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.dialog.secretsJson') }}
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
				{{ t('views.networkVpn.dialog.autoconnect') }}
			</label>

			<div class="mt-4 flex justify-end gap-2">
				<button
					class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface"
					@click="handleCancel"
					:disabled="isSubmitting"
				>
					{{ t('common.cancel') }}
				</button>
				<button
					class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
					@click="handleSubmit"
					:disabled="isSubmitting"
				>
					{{ isSubmitting ? t('common.saving') : t('views.networkVpn.dialog.saveProfile') }}
				</button>
			</div>
		</div>
	</div>
</template>
