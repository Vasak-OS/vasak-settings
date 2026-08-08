<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import TextInput from '@/components/ui/TextInput.vue';
import { useWayfireSection } from '@/composables/useWayfireSection';

// The section is owned entirely by this view, so saving must also delete what
// the user removed rather than merging.
const autostart = useWayfireSection('autostart', true);

/**
 * Entries the session cannot start without. They stay editable — a user may
 * need to adjust the command — but they cannot be deleted by accident.
 */
const PROTECTED: Record<string, string> = {
	'0_env':
		'Publica el entorno de la sesión (uwsm finalize). Sin esto systemd y D-Bus no ven la sesión gráfica.',
	desktop: 'Lanza vasak-desktop: el panel, el menú y el escritorio.',
};

onMounted(() => autostart.load());

const entries = computed(() =>
	Object.keys(autostart.values.value)
		.sort((a, b) => {
			const protectedA = a in PROTECTED ? 0 : 1;
			const protectedB = b in PROTECTED ? 0 : 1;
			return protectedA - protectedB || a.localeCompare(b);
		})
		.map((key) => ({ key, value: autostart.values.value[key], locked: key in PROTECTED }))
);

function addApp() {
	let index = 1;
	while (`app_${index}` in autostart.values.value) {
		index += 1;
	}
	autostart.values.value[`app_${index}`] = '';
}

function removeApp(key: string) {
	if (key in PROTECTED) return;
	delete autostart.values.value[key];
}

function renameApp(oldKey: string, rawKey: string) {
	const newKey = rawKey.trim();

	if (oldKey in PROTECTED || !newKey || newKey === oldKey) return;
	if (newKey in autostart.values.value) return;

	autostart.values.value[newKey] = autostart.values.value[oldKey];
	delete autostart.values.value[oldKey];
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Ventanas"
			title="Autoinicio"
			description="Comandos que Wayfire ejecuta al iniciar la sesión."
		/>

		<AlertMessage v-if="autostart.error.value" tone="error" :message="autostart.error.value" />
		<AlertMessage v-if="autostart.success.value" tone="success" :message="autostart.success.value" />

		<form @submit.prevent="autostart.save()" class="flex flex-col gap-4">
			<SectionCard>
				<h3 class="text-base font-medium">Comandos de inicio</h3>
				<p class="mb-4 mt-0.5 text-sm text-tx-muted">
					El nombre solo identifica la entrada; se ejecutan al iniciar sesión.
				</p>

				<div class="flex flex-col gap-3">
					<div v-for="entry in entries" :key="entry.key" class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<div class="w-40 shrink-0">
								<TextInput
									:model-value="entry.key"
									:readonly="entry.locked"
									lazy
									placeholder="nombre"
									@update:model-value="renameApp(entry.key, $event)"
								/>
							</div>
							<div class="flex-1">
								<TextInput
									:model-value="entry.value"
									mono
									placeholder="Ej: nm-applet"
									@update:model-value="autostart.setVal(entry.key, $event)"
								/>
							</div>

							<span
								v-if="entry.locked"
								class="shrink-0 rounded-full border border-ui-border bg-ui-surface/70 px-2 py-1 text-[11px] font-medium text-tx-muted"
							>
								Requerido
							</span>
							<button
								v-else
								type="button"
								@click="removeApp(entry.key)"
								class="shrink-0 rounded-corner border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs font-medium text-status-danger hover:bg-status-danger/20"
							>
								Eliminar
							</button>
						</div>

						<p v-if="entry.locked" class="pl-1 text-[11px] text-tx-muted">
							{{ PROTECTED[entry.key] }}
						</p>
					</div>

					<div
						v-if="entries.length === 0"
						class="rounded-corner border border-dashed border-ui-border bg-ui-surface/30 p-4 text-center text-sm text-tx-muted"
					>
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
