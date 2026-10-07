<script setup lang="ts">
/**
 * «Modo juego»: qué hace el modo juego del centro de control
 * (vasak-settings#156, vasak-desktop#181).
 *
 * Lee al abrirse y escribe al tocar un interruptor; no vigila nada. El
 * escritorio lee esta misma sección al activar el modo, así que un cambio vale
 * para la próxima activación.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, PageHeader, Panel } from '@vasakgroup/vue-libvasak';
import { onMounted } from 'vue';
import GameModeActionList from '@/components/game-mode/GameModeActionList.vue';
import { useGameModeSettings } from '@/composables/useGameModeSettings';

const { t } = useI18n();
const { actions, settings, installed, loaded, saving, error, load, setAction } =
	useGameModeSettings();

onMounted(load);
</script>

<template>
	<div class="flex min-h-full min-w-0 flex-col gap-4 pb-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.system')"
			:title="t('views.gameMode.title')"
			:description="t('views.gameMode.description')"
		/>

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>

		<Panel as="section" :aria-busy="!loaded">
			<GameModeActionList
				:actions="actions"
				:settings="settings"
				:installed="installed"
				:saving="saving"
				@toggle="setAction"
			/>
		</Panel>

		<AlertMessage tone="info">{{ t('views.gameMode.nextActivation') }}</AlertMessage>
	</div>
</template>
