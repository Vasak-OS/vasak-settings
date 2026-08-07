<script setup lang="ts">
import { onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useWayfirePlugins } from '@/composables/useWayfirePlugins';

const { byCategory, enabledCount, loading, error, load, setEnabled } = useWayfirePlugins();

onMounted(() => load(true));

function handleToggle(id: string, value: boolean) {
	void setEnabled(id, value);
}
</script>

<template>
	<section class="flex flex-col gap-4">
		<PageHeader
			section="Ventanas"
			title="Plugins del compositor"
			:description="`Activá solo lo que uses: cada plugin apagado es memoria y trabajo que Wayfire no hace. ${enabledCount} activos.`"
		/>

		<AlertMessage v-if="error" :message="error" tone="error" />
		<p v-if="loading" class="text-sm text-tx-muted">Cargando plugins…</p>

		<div v-for="group in byCategory" :key="group.category" class="flex flex-col gap-2">
			<h2 class="px-1 text-xs font-semibold uppercase tracking-wide text-tx-muted">
				{{ group.category }}
			</h2>

			<ul class="divide-y divide-ui-border overflow-hidden rounded-corner border border-ui-border bg-ui-surface/40">
				<li
					v-for="plugin in group.items"
					:key="plugin.id"
					class="flex items-center gap-3 px-4 py-3"
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="truncate text-sm font-medium text-tx-primary">{{ plugin.label }}</span>
							<code class="shrink-0 rounded bg-ui-surface/70 px-1.5 py-0.5 text-[10px] text-tx-muted">
								{{ plugin.id }}
							</code>
						</div>
						<p class="mt-0.5 text-xs text-tx-muted">{{ plugin.description }}</p>
						<p v-if="plugin.required && plugin.required_reason" class="mt-1 text-[11px] text-tx-muted">
							{{ plugin.required_reason }}
						</p>
					</div>

					<span
						v-if="plugin.required"
						class="shrink-0 rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[11px] font-medium text-tx-muted"
					>
						Requerido
					</span>
					<SwitchToggle
						v-else
						:is-on="plugin.enabled"
						@toggle="(value) => handleToggle(plugin.id, value)"
					/>
				</li>
			</ul>
		</div>
	</section>
</template>
