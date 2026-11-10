<script setup lang="ts">
/** Reglas de bloqueo por dominio: agregar o quitar un dominio cortado por aplicación. */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, SelectField, TextInput } from '@vasakgroup/vue-libvasak';
import { computed, ref } from 'vue';
import {
	type BlockedDomain,
	type PermissionEntry,
	setDomainRule,
} from '@/services/permissions.service';

const props = defineProps<{ entries: PermissionEntry[]; rules: BlockedDomain[] }>();
const emit = defineEmits<{ changed: []; failed: [message: string] }>();

const { t } = useI18n();
const binary = ref('');
const domain = ref('');
const busy = ref(false);

const appOptions = computed(() => [
	{ value: '', label: t('views.privacySecurity.firewall.rules.chooseApp') },
	// Una regla es sobre la ruta de un ejecutable: las identidades del portal no valen.
	...props.entries
		.filter((e) => e.application.binary_path.startsWith('/'))
		.map((e) => ({ value: e.application.binary_path, label: e.application.display_name })),
]);

const nameOf = (path: string) =>
	props.entries.find((e) => e.application.binary_path === path)?.application.display_name ?? path;

const apply = async (path: string, name: string, blocked: boolean) => {
	busy.value = true;
	try {
		await setDomainRule(path, name, blocked);
		if (blocked) domain.value = '';
	} catch (error) {
		emit('failed', String(error));
	} finally {
		emit('changed');
		busy.value = false;
	}
};
</script>

<template>
	<section class="flex flex-col gap-2">
		<header>
			<h3 class="font-semibold text-tx-main">{{ t('views.privacySecurity.firewall.rules.title') }}</h3>
			<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.firewall.rules.description') }}</p>
		</header>

		<form
			class="flex flex-wrap items-end gap-2"
			@submit.prevent="domain.trim() && binary && apply(binary, domain.trim(), true)"
		>
			<SelectField
				v-model="binary"
				class="min-w-40 flex-1"
				:label="t('views.privacySecurity.firewall.rules.app')"
				:options="appOptions"
				:disabled="busy"
			/>
			<TextInput
				v-model="domain"
				class="min-w-40 flex-1"
				:placeholder="t('views.privacySecurity.firewall.rules.domainPlaceholder')"
				:ariaLabel="t('views.privacySecurity.firewall.rules.domain')"
				:disabled="busy"
			/>
			<ActionButton
				variant="primary"
				icon="list-add"
				:label="t('views.privacySecurity.firewall.rules.add')"
				:disabled="busy || !binary || !domain.trim()"
				@click="apply(binary, domain.trim(), true)"
			/>
		</form>

		<p v-if="rules.length === 0" class="text-sm text-tx-muted">
			{{ t('views.privacySecurity.firewall.rules.empty') }}
		</p>
		<ul v-else class="flex flex-col gap-2">
			<li
				v-for="rule in rules"
				:key="`${rule.binary_path}|${rule.domain}`"
				class="flex items-center gap-3 rounded-corner-m border border-ui-border bg-ui-surface/70 p-3"
			>
				<div class="min-w-0 flex-1">
					<p class="break-all font-mono text-sm text-tx-main">{{ rule.domain }}</p>
					<p class="truncate text-xs text-tx-muted" :title="rule.binary_path">{{ nameOf(rule.binary_path) }}</p>
				</div>
				<ActionButton
					variant="secondary"
					size="sm"
					icon="list-remove"
					:label="t('views.privacySecurity.firewall.rules.remove')"
					:disabled="busy"
					@click="apply(rule.binary_path, rule.domain, false)"
				/>
			</li>
		</ul>
	</section>
</template>
