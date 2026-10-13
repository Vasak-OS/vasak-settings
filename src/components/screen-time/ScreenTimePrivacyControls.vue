<script setup lang="ts">
/**
 * El tiempo de pantalla en «Privacidad y seguridad» (vasak-settings#145).
 *
 * Es donde se buscan los ajustes de privacidad: el interruptor del registro y
 * «Borrar el historial», con lo que hace falta para decidir —qué se guarda y
 * que no sale de la máquina— y un enlace a la sección con el informe.
 *
 * Los dos controles son los mismos de la sección «Tiempo de pantalla», no una
 * copia: los da `useScreenTimeSettings`. Acá no hay informe que recargar, así que
 * van sin ganchos.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, AlertMessage, Panel, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useScreenTimeSettings } from '@/composables/useScreenTimeSettings';

const { t } = useI18n();
const router = useRouter();

const settings = useScreenTimeSettings({
	saved: () => t('views.screenTime.saved'),
	errorSaving: (reason) => t('views.screenTime.errorSaving').replace('{0}', reason),
	errorClearing: (reason) => t('views.screenTime.clear.errorClearing').replace('{0}', reason),
});
const { enabled, busy, confirmingClear, error, successMessage } = settings;

const openSection = () => router.push({ name: 'screen-time' });

onMounted(() => settings.refresh());
</script>

<template>
	<div data-screen-time-privacy>
		<Panel as="section">
			<header class="flex flex-col gap-1">
				<h2 class="text-lg font-medium text-tx-main">{{ t('views.privacySecurity.screenTime.title') }}</h2>
				<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.screenTime.description') }}</p>
			</header>

			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-tx-main">{{ t('views.screenTime.record') }}</p>
					<p class="text-sm text-tx-muted">{{ t('views.screenTime.recordHint') }}</p>
				</div>
				<SwitchToggle
					:label="t('views.screenTime.record')"
					:model-value="enabled"
					:disabled="busy"
					@update:model-value="(value) => settings.toggle(value)"
				/>
			</div>

			<!-- Borrar: destructivo y no se deshace, así que pide confirmación en el
			     lugar, como en la sección del tiempo de pantalla. -->
			<div class="flex flex-col gap-2 border-t border-ui-line pt-3">
				<p class="text-sm text-tx-muted">{{ t('views.screenTime.clear.description') }}</p>
				<div v-if="!confirmingClear" class="flex flex-wrap gap-2">
					<ActionButton
						:label="t('views.screenTime.clear.button')"
						variant="secondary"
						:disabled="busy"
						@click="confirmingClear = true"
					/>
					<ActionButton
						:label="t('views.privacySecurity.screenTime.open')"
						variant="ghost"
						icon="go-next-symbolic"
						icon-type="symbol"
						icon-right
						@click="openSection"
					/>
				</div>
				<div v-else class="flex flex-wrap items-center gap-3" data-screen-time-confirm>
					<p class="min-w-0 flex-1 text-sm text-tx-main">{{ t('views.screenTime.clear.confirm') }}</p>
					<div class="flex shrink-0 gap-2">
						<ActionButton
							:label="t('views.screenTime.clear.confirmButton')"
							variant="danger"
							:loading="busy"
							@click="settings.clear()"
						/>
						<ActionButton
							:label="t('common.cancel')"
							variant="secondary"
							:disabled="busy"
							@click="confirmingClear = false"
						/>
					</div>
				</div>
			</div>
		</Panel>
	</div>
</template>
