<script setup lang="ts">
/** El mapa de conexiones en vivo: por aplicación, a dónde se conectó y si pasó. */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { EmptyState } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { ObservedConnection } from '@/services/permissions.service';
import { destinationLabel, groupConnections } from '@/utils/firewall-connections';

const props = defineProps<{
	connections: ObservedConnection[];
	/** binary_path → nombre para mostrar, de las apps que el servicio conoce. */
	names: Record<string, string>;
}>();

const { t } = useI18n();
const groups = computed(() => groupConnections(props.connections));
</script>

<template>
	<section class="flex flex-col gap-2">
		<header>
			<h3 class="font-semibold text-tx-main">{{ t('views.privacySecurity.firewall.connections.title') }}</h3>
			<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.firewall.connections.description') }}</p>
		</header>

		<EmptyState
			v-if="groups.length === 0"
			icon=""
			size="sm"
			bordered
			:title="t('views.privacySecurity.firewall.connections.empty')"
		/>

		<!-- Todo lo que viene de la red (dominio, ruta) va con {{ }}: lo escribe
		     quien abre la conexión. -->
		<article
			v-for="group in groups"
			:key="group.binaryPath"
			class="flex flex-col gap-2 rounded-corner-m border border-ui-border bg-ui-surface/70 p-3"
		>
			<h4 class="min-w-0 truncate font-medium text-tx-main" :title="group.binaryPath">
				{{ names[group.binaryPath] ?? group.binaryPath }}
			</h4>
			<ul class="flex flex-col gap-1">
				<li
					v-for="c in group.connections"
					:key="`${c.ip}|${c.port}|${c.proto}`"
					class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
				>
					<span class="min-w-0 flex-1 break-all font-mono text-tx-main">{{ destinationLabel(c) }}</span>
					<span class="shrink-0 text-xs uppercase text-tx-muted">{{ c.proto }}</span>
					<span
						class="shrink-0 rounded-corner-xs px-1.5 text-xs"
						:class="c.allowed ? 'bg-status-success/20 text-status-success' : 'bg-status-error/20 text-status-error'"
					>
						{{
							c.allowed
								? t('views.privacySecurity.firewall.connections.allowed')
								: t('views.privacySecurity.firewall.connections.blocked')
						}}
					</span>
				</li>
			</ul>
		</article>
	</section>
</template>
