<script setup lang="ts">
import { onMounted } from 'vue';
import { useWayfireSection } from '@/composables/useWayfireSection';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';

const autostart = useWayfireSection('autostart');

onMounted(() => autostart.load());

function addApp() {
	const keys = Object.keys(autostart.values.value);
	const nums = keys.map(k => parseInt(k, 10)).filter(n => !isNaN(n));
	const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 0;
	autostart.values.value[String(nextNum)] = '';
}

function removeApp(key: string) {
	delete autostart.values.value[key];
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Autoinicio"
			description="Comandos que se ejecutan automáticamente al iniciar Wayfire."
		/>

		<AlertMessage v-if="autostart.error.value" tone="error" :message="autostart.error.value" />
		<AlertMessage v-if="autostart.success.value" tone="success" :message="autostart.success.value" />

		<form @submit.prevent="autostart.save()" class="flex flex-col gap-4">
			<SectionCard title="Comandos de inicio">
				<p class="mb-3 text-sm text-tx-muted">
					Cada comando se ejecutará al iniciar sesión en Wayfire.
				</p>
				<div class="flex flex-col gap-3">
					<div
						v-for="(value, key) in autostart.values.value"
						:key="key"
						class="flex items-center gap-2"
					>
						<input
							type="text"
							:value="value"
							@input="autostart.setVal(key as string, ($event.target as HTMLInputElement).value)"
							class="flex-1 rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm font-mono"
							placeholder="Ej: kitty, nm-applet, waybar, ..."
						/>
						<button
							type="button"
							@click="removeApp(key as string)"
							class="rounded-corner border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs font-medium text-status-danger hover:bg-status-danger/20"
						>
							Eliminar
						</button>
					</div>
					<div v-if="Object.keys(autostart.values.value).length === 0" class="rounded-corner border border-dashed border-ui-border bg-ui-surface/30 p-4 text-center text-sm text-tx-muted">
						No hay comandos de inicio configurados
					</div>
				</div>
				<button
					type="button"
					@click="addApp"
					class="mt-3 rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface"
				>
					+ Añadir comando
				</button>
			</SectionCard>

			<div class="flex justify-end">
				<button
					type="submit"
					:disabled="autostart.saving.value"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
				>
					{{ autostart.saving.value ? 'Guardando...' : 'Guardar cambios' }}
				</button>
			</div>
		</form>
	</div>
</template>
