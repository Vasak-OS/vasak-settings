<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import {
	connectVpn,
	createVpnProfile,
	deleteVpnProfile,
	disconnectVpn,
	getVpnStatus,
	listVpnProfiles,
	updateVpnProfile,
	type VpnConnectionState,
	type VpnCreateInput,
	type VpnProfile,
	type VpnStatus,
	type VpnType,
	type VpnUpdateInput,
} from '@/services/network.service';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatTile from '@/components/ui/StatTile.vue';

const vpnProfiles = ref<VpnProfile[]>([]);
const vpnStatus = ref<VpnStatus | null>(null);
const loading = ref(true);
const error = ref('');
const actionProfileUuid = ref<string | null>(null);
const showProfileDialog = ref(false);
const isSubmittingProfile = ref(false);
const editingProfileUuid = ref<string | null>(null);

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

const unlisteners: Array<() => void> = [];

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

const activeProfile = computed(() => {
	const uuid = vpnStatus.value?.active_profile_uuid;
	if (!uuid) return null;
	return vpnProfiles.value.find((profile) => profile.uuid === uuid) || null;
});

const vpnStateLabel = computed(() => {
	const state = vpnStatus.value?.state;
	if (!state) return 'Desconocido';

	const labels: Record<VpnConnectionState, string> = {
		disconnected: 'Desconectada',
		connecting: 'Conectando',
		connected: 'Conectada',
		disconnecting: 'Desconectando',
		failed: 'Fallida',
		unknown: 'Desconocido',
	};

	return labels[state] ?? 'Desconocido';
});

const hasActiveVpn = computed(() => vpnStatus.value?.state === 'connected');

const dialogTitle = computed(() =>
	editingProfileUuid.value ? 'Editar perfil VPN' : 'Crear perfil VPN'
);

const resetProfileForm = () => {
	profileId.value = '';
	profileType.value = 'generic';
	profileAutoconnect.value = false;
	profileGateway.value = '';
	profileUsername.value = '';
	profilePassword.value = '';
	profileCaCertPath.value = '';
	profileUserCertPath.value = '';
	profilePrivateKeyPath.value = '';
	profilePrivateKeyPassword.value = '';
	profileSettingsJson.value = '';
	profileSecretsJson.value = '';
	editingProfileUuid.value = null;
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

const errorMessage = (err: unknown): string => {
	const readString = (value: unknown): string | null => {
		if (typeof value === 'string' && value.trim()) return value;
		return null;
	};

	if (typeof err === 'string') return err;
	if (err instanceof Error) {
		if (err.message?.trim()) return err.message;
	}

	if (err && typeof err === 'object') {
		const maybe = err as {
			message?: unknown;
			error?: unknown;
			details?: unknown;
			cause?: unknown;
			data?: unknown;
			payload?: unknown;
		};

		const directCandidates = [
			maybe.message,
			maybe.error,
			maybe.details,
			maybe.cause,
			maybe.data,
			maybe.payload,
		];

		for (const candidate of directCandidates) {
			const text = readString(candidate);
			if (text) return text;
		}

		const nestedCandidates = [
			maybe.error,
			maybe.details,
			maybe.cause,
			maybe.data,
			maybe.payload,
		];

		for (const candidate of nestedCandidates) {
			if (candidate && typeof candidate === 'object') {
				const nested = candidate as {
					message?: unknown;
					error?: unknown;
					details?: unknown;
				};
				const nestedText =
					readString(nested.message) ||
					readString(nested.error) ||
					readString(nested.details);
				if (nestedText) return nestedText;
			}
		}

		try {
			const serialized = JSON.stringify(err);
			if (serialized && serialized !== '{}' && serialized !== '[]') return serialized;
		} catch {
			// ignore stringify failures and continue with fallback
		}
	}

	return 'Error desconocido (sin detalle del backend)';
};

const refreshVpnData = async () => {
	loading.value = true;
	error.value = '';
	try {
		const [profiles, status] = await Promise.all([listVpnProfiles(), getVpnStatus()]);
		vpnProfiles.value = profiles;
		vpnStatus.value = status;
	} catch (stateError) {
		error.value = `Error obteniendo estado VPN: ${errorMessage(stateError)}`;
	} finally {
		loading.value = false;
	}
};

const connectProfile = async (uuid: string) => {
	actionProfileUuid.value = uuid;
	error.value = '';
	try {
		await connectVpn(uuid);
		await refreshVpnData();
	} catch (connectError) {
		error.value = `Error conectando VPN: ${errorMessage(connectError)}`;
	} finally {
		actionProfileUuid.value = null;
	}
};

const disconnectProfile = async (uuid?: string) => {
	actionProfileUuid.value = uuid || '__active__';
	error.value = '';
	try {
		await disconnectVpn(uuid);
		await refreshVpnData();
	} catch (disconnectError) {
		error.value = `Error desconectando VPN: ${errorMessage(disconnectError)}`;
	} finally {
		actionProfileUuid.value = null;
	}
};

const removeProfile = async (profile: VpnProfile) => {
	if (!confirm(`Eliminar perfil VPN '${profile.id}'?`)) return;
	actionProfileUuid.value = profile.uuid;
	error.value = '';
	try {
		await deleteVpnProfile(profile.uuid);
		await refreshVpnData();
	} catch (deleteError) {
		error.value = `Error eliminando perfil VPN: ${errorMessage(deleteError)}`;
	} finally {
		actionProfileUuid.value = null;
	}
};

const openCreateDialog = () => {
	resetProfileForm();
	showProfileDialog.value = true;
};

const openEditDialog = (profile: VpnProfile) => {
	resetProfileForm();
	editingProfileUuid.value = profile.uuid;
	profileId.value = profile.id;
	profileType.value = profile.vpn_type;
	profileAutoconnect.value = profile.autoconnect;
	showProfileDialog.value = true;
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

const submitProfile = async () => {
	if (!profileId.value.trim()) {
		error.value = 'El nombre del perfil es obligatorio';
		return;
	}

	isSubmittingProfile.value = true;
	error.value = '';
	try {
		if (editingProfileUuid.value) {
			await updateVpnProfile(buildUpdateInput(editingProfileUuid.value));
		} else {
			await createVpnProfile(buildCreateInput());
		}
		showProfileDialog.value = false;
		resetProfileForm();
		await refreshVpnData();
	} catch (submitError) {
		error.value = `Error guardando perfil VPN: ${errorMessage(submitError)}`;
	} finally {
		isSubmittingProfile.value = false;
	}
};

const cancelDialog = () => {
	showProfileDialog.value = false;
	resetProfileForm();
};

onMounted(async () => {
	await refreshVpnData();
	unlisteners.push(
		await listen('network-changed', refreshVpnData),
		await listen('vpn-changed', refreshVpnData),
		await listen('vpn-connected', refreshVpnData),
		await listen('vpn-disconnected', refreshVpnData),
		await listen('vpn-failed', refreshVpnData)
	);
});

onUnmounted(() => {
	for (const unlisten of unlisteners) {
		unlisten();
	}
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Conectividad"
			title="VPN"
			description="Gestiona perfiles VPN, estado del túnel y operaciones de conexión."
		>
			<template #actions>
				<div class="flex gap-2">
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15"
						@click="openCreateDialog"
					>
						Nuevo perfil
					</button>
					<button
						class="rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface"
						@click="refreshVpnData"
						:disabled="loading"
					>
						{{ loading ? 'Actualizando...' : 'Actualizar estado' }}
					</button>
				</div>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" :message="error" tone="error" />

		<div class="grid gap-4 xl:grid-cols-3">
			<SectionCard class="xl:col-span-2">
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Estado Actual</h3>

				<EmptyStateBox v-if="loading" message="Leyendo estado de red..." />

				<div v-else class="space-y-3">
					<StatTile label="Estado VPN" :value="vpnStateLabel" />
					<StatTile
						label="Perfil activo"
						:value="activeProfile?.id || vpnStatus?.active_profile_name || 'Sin conexión activa'"
						:hint="vpnStatus?.active_profile_uuid || undefined"
					/>
					<StatTile label="Gateway" :value="vpnStatus?.gateway || 'No disponible'" />
					<StatTile label="IP" :value="vpnStatus?.ip_address || 'No disponible'" />
				</div>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Conexión rápida</h3>
				<div class="space-y-2 text-sm text-tx-muted">
					<p>Perfiles disponibles: {{ vpnProfiles.length }}</p>
					<p>
						Estado del túnel:
						<span class="font-medium text-tx-primary">{{ vpnStateLabel }}</span>
					</p>
					<button
						class="mt-2 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface disabled:cursor-not-allowed disabled:opacity-50"
						@click="disconnectProfile()"
						:disabled="!hasActiveVpn || actionProfileUuid === '__active__'"
					>
						{{ actionProfileUuid === '__active__' ? 'Desconectando...' : 'Desconectar VPN activa' }}
					</button>
				</div>
			</SectionCard>
		</div>

		<SectionCard>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-medium text-tx-primary">Perfiles VPN</h3>
				<span class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ vpnProfiles.length }} perfiles</span>
				</div>

			<EmptyStateBox
				v-if="!loading && vpnProfiles.length === 0"
				message="No hay perfiles VPN configurados. Crea uno para comenzar."
			/>

			<ul v-else class="space-y-2">
				<li
					v-for="profile in vpnProfiles"
					:key="profile.uuid"
					class="rounded-corner border border-ui-border bg-ui-surface/35 p-3"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p class="text-sm font-medium text-tx-primary">{{ profile.id }}</p>
							<p class="text-xs text-tx-muted">
								{{ profile.vpn_type }} · UUID: {{ profile.uuid }}
								<span v-if="profile.autoconnect"> · autoconnect</span>
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								v-if="vpnStatus?.active_profile_uuid === profile.uuid && vpnStatus?.state === 'connected'"
								class="rounded-corner border border-ui-border px-2 py-1 text-xs text-tx-muted hover:bg-ui-surface disabled:cursor-not-allowed disabled:opacity-50"
								@click="disconnectProfile(profile.uuid)"
								:disabled="actionProfileUuid === profile.uuid"
							>
								{{ actionProfileUuid === profile.uuid ? 'Desconectando...' : 'Desconectar' }}
							</button>
							<button
								v-else
								class="rounded-corner border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
								@click="connectProfile(profile.uuid)"
								:disabled="actionProfileUuid === profile.uuid"
							>
								{{ actionProfileUuid === profile.uuid ? 'Conectando...' : 'Conectar' }}
							</button>
							<button
								class="rounded-corner border border-ui-border px-2 py-1 text-xs text-tx-muted hover:bg-ui-surface"
								@click="openEditDialog(profile)"
							>
								Editar
							</button>
							<button
								class="rounded-corner border border-status-danger/20 bg-status-danger/10 px-2 py-1 text-xs text-status-danger hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
								@click="removeProfile(profile)"
								:disabled="actionProfileUuid === profile.uuid"
							>
								Eliminar
							</button>
						</div>
					</div>
				</li>
			</ul>
		</SectionCard>

		<div
			v-if="showProfileDialog"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		>
			<div class="w-full max-w-2xl rounded-corner border border-ui-border bg-ui-bg p-4 shadow-xl">
				<h2 class="text-lg font-semibold text-tx-primary">{{ dialogTitle }}</h2>
				<p class="mt-1 text-sm text-tx-muted">Configura los datos principales del perfil VPN.</p>

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
							<option v-for="opt in vpnTypes" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
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
						@click="cancelDialog"
						:disabled="isSubmittingProfile"
					>
						Cancelar
					</button>
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
						@click="submitProfile"
						:disabled="isSubmittingProfile"
					>
						{{ isSubmittingProfile ? 'Guardando...' : 'Guardar perfil' }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
