<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { SelectField } from '@vasakgroup/vue-libvasak';
import { onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	escribirIndicadoresDelPanel,
	escribirPosicionDelPanel,
	indicadoresDelPanel,
	POSICIONES_DEL_PANEL,
	type PosicionDelPanel,
	posicionDelPanel,
} from '@/tools/valores-de-config';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);

/**
 * Todo arranca encendido.
 *
 * La sección `panel` no existe en la configuración hasta que alguien apaga
 * algo, así que la ausencia de una clave significa «mostralo». El escritorio lee
 * exactamente con este criterio (`!== false`), y si acá se leyera al revés, el
 * panel y esta pantalla se contradirían en cada instalación nueva.
 */
const weather = ref(true);
const music = ref(true);
const transfer = ref(true);
const tray = ref(true);
const privacy = ref(true);

/**
 * De qué lado queda la barra.
 *
 * Arriba por omisión, que es donde estuvo siempre. El escritorio la reancla y
 * reacomoda lo de adentro al recibir `config-changed`, así que moverla no pide
 * reiniciar la sesión.
 */
const posicion = ref<PosicionDelPanel>('top');

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		const panel = indicadoresDelPanel(vskConfig.value);
		weather.value = panel.weather;
		music.value = panel.music;
		transfer.value = panel.transfer;
		tray.value = panel.tray;
		privacy.value = panel.privacy;
		posicion.value = posicionDelPanel(vskConfig.value);
	} catch (err) {
		error.value = t('views.appearancePanel.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		if (!vskConfig.value) return;

		escribirIndicadoresDelPanel(vskConfig.value as any, {
			weather: weather.value,
			music: music.value,
			transfer: transfer.value,
			tray: tray.value,
			privacy: privacy.value,
		});

		escribirPosicionDelPanel(vskConfig.value as unknown as Record<string, unknown>, posicion.value);

		await writeConfig(vskConfig.value);

		// El escritorio recarga la configuración al recibir `config-changed`, que
		// emite el propio plugin: el panel se acomoda sin reiniciar la sesión.
		successMessage.value = t('views.appearancePanel.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearancePanel.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearancePanel.title')"
			:description="t('views.appearancePanel.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearancePanel.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearancePanel.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" :message="error" tone="error" />

			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">
					{{ t('views.appearancePanel.bar') }}
				</h3>

				<div class="flex items-start justify-between gap-4">
					<!-- Sólo la explicación: el nombre del control lo dice el `label`
					     del propio desplegable, y repetirlo acá lo escribe dos veces
					     una al lado de la otra. -->
					<p class="text-xs text-tx-muted">
						{{ t('views.appearancePanel.positionHint') }}
					</p>
					<!-- La etiqueta va **dentro** del componente: un `<label>` suelto
					     al lado no está asociado a nada, y un lector de pantalla
					     anuncia un desplegable sin nombre. -->
					<SelectField
						v-model="posicion"
						:label="t('views.appearancePanel.position')"
						class="w-48 shrink-0"
					>
						<option v-for="lado in POSICIONES_DEL_PANEL" :key="lado" :value="lado">
							{{ t(`views.appearancePanel.lados.${lado}`) }}
						</option>
					</SelectField>
				</div>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">
					{{ t('views.appearancePanel.indicators') }}
				</h3>

				<div class="flex flex-col gap-5">
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-primary">
								{{ t('views.appearancePanel.weather') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.weatherHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.weather')" :is-on="weather" @toggle="(val) => (weather = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-primary">
								{{ t('views.appearancePanel.music') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.musicHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.music')" :is-on="music" @toggle="(val) => (music = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-primary">
								{{ t('views.appearancePanel.transfer') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.transferHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.transfer')" :is-on="transfer" @toggle="(val) => (transfer = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-primary">
								{{ t('views.appearancePanel.tray') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.trayHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.tray')" :is-on="tray" @toggle="(val) => (tray = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<label class="text-sm font-medium text-tx-primary">
								{{ t('views.appearancePanel.privacy') }}
							</label>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.privacyHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.privacy')" :is-on="privacy" @toggle="(val) => (privacy = val)" />
					</div>
				</div>
			</SectionCard>
		</div>
	</div>
</template>
