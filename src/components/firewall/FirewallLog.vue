<script setup lang="ts">
/**
 * El registro persistente de bloqueos (opt-in): un interruptor, la lista de lo
 * bloqueado y «Borrar el registro». Apagar no borra; borrar es otra acción y
 * pide confirmación.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	SwitchToggle,
} from '@vasakgroup/vue-libvasak';
import { onMounted, ref } from 'vue';
import {
	clearFirewallLog,
	type FirewallLogEntry,
	firewallLoggingEnabled,
	readFirewallLog,
	setFirewallLogging,
} from '@/services/permissions.service';

const { t } = useI18n();
const enabled = ref(false);
const entries = ref<FirewallLogEntry[]>([]);
const busy = ref(false);
const confirming = ref(false);
const errorMessage = ref('');

const REASONS: Record<string, string> = {
	'kill-switch': 'killSwitch',
	'domain-rule': 'domainRule',
	'forced-resolver': 'forcedResolver',
};
const reasonLabel = (reason: string) =>
	REASONS[reason] ? t(`views.privacySecurity.firewall.log.reasons.${REASONS[reason]}`) : '—';

const whenLabel = (secs: number) => new Date(secs * 1000).toLocaleString();

const reload = async () => {
	// Apagado se lee igual: apagar no borra, y lo guardado sigue a la vista.
	entries.value = await readFirewallLog().catch(() => entries.value);
};

const toggle = async (value: boolean) => {
	busy.value = true;
	errorMessage.value = '';
	try {
		await setFirewallLogging(value);
	} catch (error) {
		// Una autenticación rechazada es lo normal; el estado vuelve a la verdad.
		errorMessage.value = String(error);
	}
	enabled.value = await firewallLoggingEnabled().catch(() => enabled.value);
	await reload();
	busy.value = false;
};

const clear = async () => {
	confirming.value = false;
	busy.value = true;
	errorMessage.value = '';
	try {
		await clearFirewallLog();
	} catch (error) {
		errorMessage.value = String(error);
	}
	await reload();
	busy.value = false;
};

onMounted(async () => {
	enabled.value = await firewallLoggingEnabled().catch(() => false);
	await reload();
});
</script>

<template>
	<section class="flex flex-col gap-2">
		<header>
			<h3 class="font-semibold text-tx-main">{{ t('views.privacySecurity.firewall.log.title') }}</h3>
			<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.firewall.log.description') }}</p>
		</header>

		<AlertMessage v-if="errorMessage" tone="error">{{ errorMessage }}</AlertMessage>

		<div class="flex items-center gap-3 rounded-corner-m border border-ui-border bg-ui-surface/70 p-3">
			<p class="min-w-0 flex-1 font-medium text-tx-main">{{ t('views.privacySecurity.firewall.log.toggle') }}</p>
			<SwitchToggle
				:label="t('views.privacySecurity.firewall.log.toggle')"
				:model-value="enabled"
				:disabled="busy"
				@update:model-value="toggle"
			/>
		</div>

		<EmptyState
			v-if="entries.length === 0"
			icon=""
			size="sm"
			bordered
			:title="t(enabled ? 'views.privacySecurity.firewall.log.empty' : 'views.privacySecurity.firewall.log.off')"
		/>

		<!-- Todo lo que viene de la app (ruta, destino) va con {{ }}: lo influye ella. -->
		<ul v-else class="flex flex-col gap-2">
			<li
				v-for="(e, i) in entries"
				:key="`${e.timestamp}|${e.binary_path}|${e.destination}|${e.port}|${i}`"
				class="flex flex-col gap-1 rounded-corner-m border border-ui-border bg-ui-surface/70 p-3 text-sm"
			>
				<p class="min-w-0 truncate font-medium text-tx-main" :title="e.binary_path">{{ e.binary_path }}</p>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="min-w-0 flex-1 break-all font-mono text-tx-main">{{ e.destination }}:{{ e.port }}</span>
					<span class="shrink-0 text-xs uppercase text-tx-muted">{{ e.proto }}</span>
					<span class="shrink-0 rounded-corner-xs bg-status-error/20 px-1.5 text-xs text-status-error">{{ reasonLabel(e.reason) }}</span>
					<span class="shrink-0 text-xs text-tx-muted">{{ whenLabel(e.timestamp) }}</span>
				</div>
			</li>
		</ul>

		<div class="flex flex-wrap items-center gap-3">
			<button
				type="button"
				data-log-clear
				class="min-h-8 rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
				:disabled="busy || entries.length === 0"
				@click="confirming = true"
			>
				{{ t('views.privacySecurity.firewall.log.clear') }}
			</button>
			<p class="min-w-0 flex-1 text-xs text-tx-muted">{{ t('views.privacySecurity.firewall.log.clearHint') }}</p>
		</div>

		<Dialog :open="confirming" @update:open="(stillOpen: boolean) => { if (!stillOpen) confirming = false; }">
			<DialogContent size="md">
				<DialogHeader close-style="label" :close-label="t('common.close')">
					<DialogTitle>{{ t('views.privacySecurity.firewall.log.clearTitle') }}</DialogTitle>
					<DialogDescription>{{ t('views.privacySecurity.firewall.log.clearDescription') }}</DialogDescription>
				</DialogHeader>
				<div class="mt-4 flex justify-end gap-2">
					<button
						type="button"
						data-log-cancel
						class="min-h-8 rounded-corner-m border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						@click="confirming = false"
					>
						{{ t('common.cancel') }}
					</button>
					<button
						type="button"
						data-log-confirm
						class="min-h-8 rounded-corner-m border border-status-error bg-ui-surface/70 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						@click="clear"
					>
						{{ t('views.privacySecurity.firewall.log.clearConfirm') }}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	</section>
</template>
