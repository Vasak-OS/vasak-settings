<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import type { Store } from 'pinia';
import { onMounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

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

onMounted(async () => {
	try {
		configStore.value = useConfigStore() as Store<
			'config',
			{ config: VSKConfig; loadConfig: () => Promise<void> }
		>;

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		const panel = (vskConfig.value as any)?.panel ?? {};
		weather.value = panel.weather !== false;
		music.value = panel.music !== false;
		transfer.value = panel.transfer !== false;
		tray.value = panel.tray !== false;
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

		(vskConfig.value as any).panel = {
			...((vskConfig.value as any).panel ?? {}),
			weather: weather.value,
			music: music.value,
			transfer: transfer.value,
			tray: tray.value,
		};

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
						<SwitchToggle :is-on="weather" @toggle="(val) => (weather = val)" />
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
						<SwitchToggle :is-on="music" @toggle="(val) => (music = val)" />
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
						<SwitchToggle :is-on="transfer" @toggle="(val) => (transfer = val)" />
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
						<SwitchToggle :is-on="tray" @toggle="(val) => (tray = val)" />
					</div>
				</div>
			</SectionCard>
		</div>
	</div>
</template>
