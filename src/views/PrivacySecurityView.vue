<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import {
	forgetPermission,
	listPermissions,
	type PermissionEntry,
	setPermission,
} from '@/services/permissions.service';

const { t } = useI18n();

/**
 * The resources a person can be shown, in the order they appear.
 *
 * Only what the permission service actually enforces. The camera, the
 * microphone and the screen are handed out by PipeWire and the desktop portal,
 * which do not consult this policy — the service refuses those requests
 * outright rather than storing an answer that changes nothing, so there is
 * never anything here to show for them. A switch that looks like protection and
 * is not is worse than no switch at all.
 */
const RESOURCES = [
	'account.email',
	'account.calendar',
	'account.contacts',
	'account.chat',
	'account.drive',
	'account.tasks',
] as const;

/**
 * Translation key per resource.
 *
 * Kept separate from the resource id because the ids contain dots
 * (`account.email`) and translation keys are looked up by splitting on dots —
 * so the id used directly would descend into a key that does not exist and
 * render raw.
 */
const RESOURCE_LABEL: Record<string, string> = {
	'account.email': 'accountEmail',
	'account.calendar': 'accountCalendar',
	'account.contacts': 'accountContacts',
	'account.chat': 'accountChat',
	'account.drive': 'accountDrive',
	'account.tasks': 'accountTasks',
};

const labelFor = (resource: string) =>
	t(`views.privacy.resources.${RESOURCE_LABEL[resource] ?? resource}`);


const entries = ref<PermissionEntry[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const busyPath = ref('');

const load = async () => {
	loading.value = true;
	errorMessage.value = '';
	try {
		entries.value = await listPermissions();
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		loading.value = false;
	}
};

const decisionOf = (entry: PermissionEntry, resource: string) =>
	entry.decisions[resource] ?? 'unknown';

/** Only the resources this program has actually been asked about. */
const decidedResources = (entry: PermissionEntry) =>
	RESOURCES.filter((resource) => decisionOf(entry, resource) !== 'unknown');

const change = async (entry: PermissionEntry, resource: string, allowed: boolean) => {
	busyPath.value = entry.application.binary_path;
	errorMessage.value = '';
	try {
		await setPermission(entry.application.binary_path, resource, allowed);
		await load();
	} catch (error) {
		// A refused authentication is the normal case, not a failure worth
		// alarming about — but the switch must snap back to the truth.
		errorMessage.value = String(error);
		await load();
	} finally {
		busyPath.value = '';
	}
};

const forget = async (entry: PermissionEntry) => {
	busyPath.value = entry.application.binary_path;
	errorMessage.value = '';
	try {
		await forgetPermission(entry.application.binary_path);
		await load();
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		busyPath.value = '';
	}
};

const hasEntries = computed(() => entries.value.length > 0);

onMounted(load);
</script>

<template>
	<section class="flex flex-col gap-4 p-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.privacy.title')"
			:description="t('views.privacy.description')"
		/>

		<AlertMessage v-if="errorMessage" type="error" :message="errorMessage" />

		<p v-if="loading" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

		<EmptyStateBox
			v-else-if="!hasEntries"
			padding="lg"
			:message="t('views.privacy.emptyDescription')"
		/>

		<article
			v-for="entry in entries"
			v-else
			:key="entry.application.binary_path"
			class="rounded-corner border border-ui-border bg-ui-surface/40 p-4 flex flex-col gap-3"
		>
			<header class="flex flex-wrap items-start gap-3">
				<div class="min-w-0 flex-1">
					<h3 class="font-semibold text-tx-main truncate">
						{{ entry.application.display_name }}
					</h3>
					<p class="text-xs text-tx-muted break-all">
						{{ entry.application.binary_path }}
					</p>
					<!-- The path alone does not tell a person whether the program can
					     be swapped underneath the permission they granted. -->
					<p
						v-if="entry.application.provenance === 'unverified'"
						class="mt-1 text-xs text-status-warning"
					>
						{{ t('views.privacy.unverified') }}
					</p>
				</div>

				<button
					type="button"
					:disabled="busyPath === entry.application.binary_path"
					class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-main hover:bg-ui-surface disabled:opacity-50"
					@click="forget(entry)"
				>
					{{ t('views.privacy.forget') }}
				</button>
			</header>

			<ul class="flex flex-col gap-2">
				<li
					v-for="resource in decidedResources(entry)"
					:key="resource"
					class="flex items-center justify-between gap-3"
				>
					<span class="min-w-0 text-sm text-tx-main">
						{{ labelFor(resource) }}
					</span>

					<div class="flex shrink-0 gap-1">
						<button
							type="button"
							:disabled="busyPath === entry.application.binary_path"
							class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
							:class="
								decisionOf(entry, resource) === 'allowed'
									? 'bg-status-success/20 text-status-success font-semibold'
									: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
							"
							@click="change(entry, resource, true)"
						>
							{{ t('views.privacy.allow') }}
						</button>
						<button
							type="button"
							:disabled="busyPath === entry.application.binary_path"
							class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
							:class="
								decisionOf(entry, resource) === 'denied'
									? 'bg-status-error/20 text-status-error font-semibold'
									: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
							"
							@click="change(entry, resource, false)"
						>
							{{ t('views.privacy.deny') }}
						</button>
					</div>
				</li>
			</ul>
		</article>

		<p class="text-xs text-tx-muted">
			{{ t('views.privacy.note') }}
		</p>
	</section>
</template>
