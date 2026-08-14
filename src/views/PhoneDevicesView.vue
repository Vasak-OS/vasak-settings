<script setup lang="ts">
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import TextInput from '@/components/ui/TextInput.vue';
import {
	forgetDevice,
	type KnownDevice,
	listKnownDevices,
	setDeviceAlias,
} from '@/services/connect.service';

const { t } = useI18n();

const devices = ref<KnownDevice[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const editing = ref<string | null>(null);
const draftAlias = ref('');

const load = async () => {
	loading.value = true;
	errorMessage.value = '';
	try {
		devices.value = await listKnownDevices();
	} catch (error) {
		// Almost always "the service is not running", which is a legitimate
		// state — it can be disabled — and the message from the backend says so.
		errorMessage.value = String(error);
		devices.value = [];
	} finally {
		loading.value = false;
	}
};

const startRename = (device: KnownDevice) => {
	editing.value = device.serial;
	draftAlias.value = device.name;
};

const saveAlias = async (device: KnownDevice) => {
	const alias = draftAlias.value.trim();
	if (alias && alias !== device.name) {
		await setDeviceAlias(device.serial, alias);
		await load();
	}
	editing.value = null;
};

const forget = async (device: KnownDevice) => {
	await forgetDevice(device.serial);
	await load();
};

/** The date the daemon recorded is ISO-8601; show it the way the session does. */
const formatDate = (iso: string): string => {
	if (!iso) return '—';
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const stateTone = (device: KnownDevice): 'success' | 'error' | 'neutral' => {
	if (!device.connected) return 'neutral';
	return device.state === 'ready' ? 'success' : 'error';
};

const stateLabel = (device: KnownDevice): string => {
	if (!device.connected) return t('views.phoneDevices.disconnected');
	if (device.state === 'unauthorized') return t('views.phoneDevices.unauthorized');
	if (device.state === 'ready') return t('views.phoneDevices.connected');
	return t('views.phoneDevices.connecting');
};

let unlisten: UnlistenFn | undefined;

onMounted(async () => {
	await load();
	// The daemon signals when a phone appears, changes state or goes away.
	// Without this the screen kept showing whatever was true when it was opened,
	// and plugging a phone in while it sat there did nothing at all.
	unlisten = await listen('connect-devices-changed', load);
});

onBeforeUnmount(() => unlisten?.());
</script>

<template>
	<div class="flex flex-col gap-4">
		<PageHeader
			:section="t('views.phoneDevices.section')"
			:title="t('views.phoneDevices.title')"
			:description="t('views.phoneDevices.description')"
		/>

		<AlertMessage v-if="errorMessage" :message="errorMessage" tone="error" />

		<!-- Said once, plainly, and above the list: pressing "forget" does not
		     cut off access. The authorisation is on the phone, and somebody who
		     believes otherwise will think they revoked something they did not. -->
		<AlertMessage :message="t('views.phoneDevices.trustNotice')" tone="info" />

		<SectionCard>
			<EmptyStateBox v-if="loading" :message="t('views.phoneDevices.loading')" />
			<EmptyStateBox
				v-else-if="devices.length === 0"
				:message="t('views.phoneDevices.empty')"
				padding="lg"
			/>

			<ul v-else class="flex flex-col gap-3">
				<li
					v-for="device in devices"
					:key="device.serial"
					class="flex flex-col gap-3 rounded-corner border border-ui-border bg-ui-surface/20 p-4 sm:flex-row sm:items-center"
				>
					<div class="min-w-0 flex-1">
						<div v-if="editing === device.serial" class="flex items-center gap-2">
							<TextInput v-model="draftAlias" @keyup.enter="saveAlias(device)" />
							<button
								type="button"
								class="rounded-corner bg-primary px-3 py-1 text-sm text-white"
								@click="saveAlias(device)"
							>
								{{ t('views.phoneDevices.save') }}
							</button>
						</div>
						<p v-else class="truncate font-semibold">{{ device.name }}</p>

						<p class="truncate text-xs text-tx-muted">
							{{ device.serial }}
							· {{ t('views.phoneDevices.firstSeen') }} {{ formatDate(device.first_seen) }}
							<template v-if="device.last_address"> · {{ device.last_address }}</template>
						</p>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<StatusBadge :text="stateLabel(device)" :tone="stateTone(device)" />
						<button
							v-if="editing !== device.serial"
							type="button"
							class="rounded-corner border border-ui-border px-3 py-1 text-sm hover:bg-ui-surface"
							@click="startRename(device)"
						>
							{{ t('views.phoneDevices.rename') }}
						</button>
						<button
							type="button"
							class="rounded-corner border border-status-error/40 px-3 py-1 text-sm text-status-error hover:bg-status-error/10"
							@click="forget(device)"
						>
							{{ t('views.phoneDevices.forget') }}
						</button>
					</div>
				</li>
			</ul>
		</SectionCard>
	</div>
</template>
