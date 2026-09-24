<script lang="ts" setup>
/**
 * Dónde va la barra de las ventanas.
 *
 * La barra de una aplicación —la que lleva el icono, el título y los botones de
 * la ventana— puede quedar arriba, abajo, a la izquierda o a la derecha. Lo
 * dibuja el marco compartido de `@vasakgroup/vue-libvasak`, que es el mismo en
 * todas las ventanas del escritorio, y lo lee de `window.barPosition`.
 *
 * No hay que reiniciar nada: el plugin de configuración emite `config-changed`
 * al guardar, y el marco escucha ese aviso y se acomoda con las ventanas
 * abiertas.
 */
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, SelectField } from '@vasakgroup/vue-libvasak';
import { onMounted, type Ref, ref } from 'vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import {
	escribirPosicionDeLaBarra,
	POSICIONES_DE_LA_BARRA,
	type PosicionDeLaBarra,
	posicionDeLaBarra,
} from '@/tools/valores-de-config';

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);
const posicion = ref<PosicionDeLaBarra>('top');

onMounted(async () => {
	try {
		await useConfigStore().loadConfig();
		vskConfig.value = await readConfig();
		posicion.value = posicionDeLaBarra(vskConfig.value);
	} catch (err) {
		error.value = t('views.appearanceWindows.errorLoading').replace('{0}', String(err));
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

		escribirPosicionDeLaBarra(
			vskConfig.value as unknown as Record<string, unknown>,
			posicion.value
		);
		await writeConfig(vskConfig.value);

		successMessage.value = t('views.appearanceWindows.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearanceWindows.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			:section="t('sidebar.appearance')"
			:title="t('views.appearanceWindows.title')"
			:description="t('views.appearanceWindows.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearanceWindows.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.appearanceWindows.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<SectionCard>
				<h3 class="mb-4 font-medium text-lg text-tx-main">
					{{ t('views.appearanceWindows.bar') }}
				</h3>

				<div class="flex items-start justify-between gap-4">
					<!-- Sólo la explicación: el nombre del control lo dice el `label`
					     del propio desplegable, y repetirlo acá lo escribe dos veces
					     una al lado de la otra. -->
					<p class="text-tx-muted text-xs">
						{{ t('views.appearanceWindows.barPositionHint') }}
					</p>
					<!-- La etiqueta va **dentro** del componente: un `<label>` suelto
					     al lado no está asociado a nada, y un lector de pantalla
					     anuncia un desplegable sin nombre. -->
					<SelectField
						v-model="posicion"
						:label="t('views.appearanceWindows.barPosition')"
						class="w-48 shrink-0"
					>
						<option v-for="lado in POSICIONES_DE_LA_BARRA" :key="lado" :value="lado">
							{{ t(`views.appearanceWindows.lados.${lado}`) }}
						</option>
					</SelectField>
				</div>
			</SectionCard>
		</div>
	</div>
</template>
