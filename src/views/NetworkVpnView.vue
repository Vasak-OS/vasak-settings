<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import NewProfileComponent from '@/components/vpn/NewProfileComponent.vue';
import VpnProfileItem from '@/components/vpn/VpnProfileItem.vue';
import VpnStatusPanel from '@/components/vpn/VpnStatusPanel.vue';
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
	type VpnUpdateInput,
} from '@/services/network.service';

const { t } = useI18n();

const vpnProfiles = ref<VpnProfile[]>([]);
const vpnStatus = ref<VpnStatus | null>(null);
const loading = ref(true);
const error = ref('');
const actionProfileUuid = ref<string | null>(null);
const showProfileDialog = ref(false);

const unlisteners: Array<() => void> = [];

const activeProfile = computed(() => {
	const uuid = vpnStatus.value?.active_profile_uuid;
	if (!uuid) return null;
	return vpnProfiles.value.find((profile) => profile.uuid === uuid) || null;
});

const vpnStateLabel = computed(() => {
	const state = vpnStatus.value?.state;
	if (!state) return t('views.networkVpn.state.unknown');

	const labels: Record<VpnConnectionState, string> = {
		disconnected: t('views.networkVpn.state.disconnected'),
		connecting: t('views.networkVpn.state.connecting'),
		connected: t('views.networkVpn.state.connected'),
		disconnecting: t('views.networkVpn.state.disconnecting'),
		failed: t('views.networkVpn.state.failed'),
		unknown: t('views.networkVpn.state.unknown'),
	};

	return labels[state] ?? t('views.networkVpn.state.unknown');
});

const hasActiveVpn = computed(() => vpnStatus.value?.state === 'connected');

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

		const nestedCandidates = [maybe.error, maybe.details, maybe.cause, maybe.data, maybe.payload];

		for (const candidate of nestedCandidates) {
			if (candidate && typeof candidate === 'object') {
				const nested = candidate as {
					message?: unknown;
					error?: unknown;
					details?: unknown;
				};
				const nestedText =
					readString(nested.message) || readString(nested.error) || readString(nested.details);
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

	return t('views.networkVpn.errors.unknown');
};

const refreshVpnData = async () => {
	loading.value = true;
	error.value = '';
	try {
		const [profiles, status] = await Promise.all([listVpnProfiles(), getVpnStatus()]);
		vpnProfiles.value = profiles;
		vpnStatus.value = status;
	} catch (stateError) {
		error.value = t('views.networkVpn.errors.status').replace('{0}', errorMessage(stateError));
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
		error.value = t('views.networkVpn.errors.connect').replace('{0}', errorMessage(connectError));
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
		error.value = t('views.networkVpn.errors.disconnect').replace(
			'{0}',
			errorMessage(disconnectError)
		);
	} finally {
		actionProfileUuid.value = null;
	}
};

const removeProfile = async (profile: VpnProfile) => {
	if (!confirm(t('views.networkVpn.confirmDelete').replace('{0}', profile.id))) return;
	actionProfileUuid.value = profile.uuid;
	error.value = '';
	try {
		await deleteVpnProfile(profile.uuid);
		await refreshVpnData();
	} catch (deleteError) {
		error.value = t('views.networkVpn.errors.delete').replace('{0}', errorMessage(deleteError));
	} finally {
		actionProfileUuid.value = null;
	}
};

const handleProfileSubmit = async (input: VpnCreateInput | VpnUpdateInput) => {
	error.value = '';
	try {
		if ('uuid' in input) {
			await updateVpnProfile(input as VpnUpdateInput);
		} else {
			await createVpnProfile(input as VpnCreateInput);
		}
		showProfileDialog.value = false;
		await refreshVpnData();
	} catch (submitError) {
		error.value = t('views.networkVpn.errors.save').replace('{0}', errorMessage(submitError));
	}
};

const handleProfileCancel = () => {
	showProfileDialog.value = false;
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
			:section="t('sidebar.network')"
			:title="t('views.networkVpn.title')"
			:description="t('views.networkVpn.description')"
		>
			<template #actions>
				<div class="flex gap-2">
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15"
						@click="showProfileDialog = true"
					>
						{{ t('views.networkVpn.newProfile') }}
					</button>
					<button
						class="rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface"
						@click="refreshVpnData"
						:disabled="loading"
					>
						{{ loading ? t('views.networkVpn.refreshing') : t('views.networkVpn.refresh') }}
					</button>
				</div>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" :message="error" tone="error" />

		<div class="grid gap-4 xl:grid-cols-3">
			<SectionCard class="xl:col-span-2">
				<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.networkVpn.currentStatus') }}</h3>

				<EmptyStateBox v-if="loading" :message="t('views.networkVpn.readingStatus')" />

				<VpnStatusPanel
					v-else
					:vpn-status="vpnStatus"
					:active-profile="activeProfile"
					:is-loading="loading"
				/>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.networkVpn.quickConnect') }}</h3>
				<div class="space-y-2 text-sm text-tx-muted">
					<p>{{ t('views.networkVpn.availableProfiles') }} {{ vpnProfiles.length }}</p>
					<p>
						{{ t('views.networkVpn.tunnelState') }}
						<span class="font-medium text-tx-primary">{{ vpnStateLabel }}</span>
					</p>
					<button
						class="mt-2 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface disabled:cursor-not-allowed disabled:opacity-50"
						@click="disconnectProfile()"
						:disabled="!hasActiveVpn || actionProfileUuid === '__active__'"
					>
						{{ actionProfileUuid === '__active__' ? t('views.networkVpn.disconnecting') : t('views.networkVpn.disconnectActive') }}
					</button>
				</div>
			</SectionCard>
		</div>

		<SectionCard>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-medium text-tx-primary">{{ t('views.networkVpn.profiles') }}</h3>
				<span class="text-xs uppercase tracking-[0.16em] text-tx-muted">
					{{ t('views.networkVpn.profileCount').replace('{0}', String(vpnProfiles.length)) }}
				</span>
			</div>

			<EmptyStateBox
				v-if="!loading && vpnProfiles.length === 0"
				:message="t('views.networkVpn.emptyProfiles')"
			/>

			<ul v-else class="space-y-2">
				<VpnProfileItem
					v-for="profile in vpnProfiles"
					:key="profile.uuid"
					:profile="profile"
					:is-active="vpnStatus?.active_profile_uuid === profile.uuid"
					:is-connected="vpnStatus?.state === 'connected'"
					:is-loading="loading"
					:action-profile-uuid="actionProfileUuid"
					@connect="connectProfile(profile.uuid)"
					@disconnect="disconnectProfile(profile.uuid)"
					@edit="showProfileDialog = true"
					@delete="removeProfile(profile)"
				/>
			</ul>
		</SectionCard>

		<NewProfileComponent
			:open="showProfileDialog"
			@update:open="showProfileDialog = $event"
			@submit="handleProfileSubmit"
			@cancel="handleProfileCancel"
		/>
	</div>
</template>
