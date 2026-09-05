<script setup lang="ts">
/**
 * Qué aplicaciones pueden usar la cámara y el micrófono.
 *
 * # Por qué esta pantalla existe y por qué se llama así
 *
 * Hubo una pantalla «Privacidad y seguridad» y se quitó porque prometía más de
 * lo que el sistema podía cumplir: quien la abría esperaba control sobre la
 * cámara, y de eso no había nada. La advertencia que quedó escrita entonces
 * sigue valiendo: un interruptor que parece protección y no lo es, es peor que
 * no tener interruptor.
 *
 * Ahora sí hay algo que cumplir, pero **a medias**, y por eso esta pantalla se
 * llama por los dos dispositivos que administra y no por una promesa amplia:
 *
 *  - Un perfil de AppArmor le niega la cámara y el micrófono a las aplicaciones
 *    que el sistema no instaló, y permitir acá le escribe una excepción. Eso el
 *    kernel lo hace cumplir sin importar quién la haya abierto.
 *  - Pero sólo cubre el acceso **directo** al dispositivo. Una aplicación que
 *    se los pida a PipeWire —que es como los piden las aplicaciones modernas—
 *    todavía no se detiene.
 *
 * Eso último está dicho en la propia pantalla. Callarlo sería repetir el error
 * que llevó a quitar la anterior.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import {
	forgetPermission,
	listPermissions,
	type PermissionEntry,
	setPermission,
} from '@/services/permissions.service';

const { t } = useI18n();

/** Los dos dispositivos que el perfil de AppArmor niega, y por eso los únicos
 * sobre los que decidir acá cambia algo. */
const RESOURCES = ['camera', 'microphone'] as const;

const entries = ref<PermissionEntry[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const busyPath = ref('');

const load = async () => {
	loading.value = true;
	errorMessage.value = '';
	try {
		entries.value = await listPermissions();
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		loading.value = false;
	}
};

const decisionOf = (entry: PermissionEntry, resource: string) =>
	entry.decisions[resource] ?? 'unknown';

/**
 * Sólo las aplicaciones que pidieron alguno de estos dos dispositivos.
 *
 * La lista completa incluye permisos de cuentas, que se administran en su
 * propia pantalla: mostrarlos acá sería repetirlos en dos lugares y dejar dudas
 * sobre cuál manda.
 */
const visible = computed(() =>
	entries.value.filter((entry) =>
		RESOURCES.some((resource) => decisionOf(entry, resource) !== 'unknown')
	)
);

/**
 * Si un perfil confina a esta aplicación.
 *
 * El perfil cubre lo que el sistema no instaló. Para un programa que vino con
 * el sistema no hay nada que exceptuar, así que su interruptor no haría nada —y
 * eso hay que decirlo en vez de ofrecerlo igual.
 */
const estaConfinada = (entry: PermissionEntry) => entry.application.provenance === 'unverified';

const change = async (entry: PermissionEntry, resource: string, allowed: boolean) => {
	busyPath.value = entry.application.binary_path;
	errorMessage.value = '';
	try {
		await setPermission(entry.application.binary_path, resource, allowed);
	} catch (error) {
		// Una autenticación rechazada es lo normal, no una falla que valga una
		// alarma — pero el estado que se ve tiene que volver a la verdad.
		errorMessage.value = String(error);
	} finally {
		await load();
		busyPath.value = '';
	}
};

const forget = async (entry: PermissionEntry) => {
	busyPath.value = entry.application.binary_path;
	errorMessage.value = '';
	try {
		await forgetPermission(entry.application.binary_path);
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		await load();
		busyPath.value = '';
	}
};

onMounted(load);
</script>

<template>
	<div class="flex flex-col gap-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.cameraMicrophone.title')"
			:description="t('views.cameraMicrophone.description')"
		/>

		<SectionCard>
			<!-- El alcance, a la vista y no en una nota al pie: mientras la vía de
			     PipeWire siga abierta, esta pantalla no puede presentarse como
			     protección completa. -->
			<AlertMessage type="info" :message="t('views.cameraMicrophone.scope')" />

			<AlertMessage v-if="errorMessage" type="error" :message="errorMessage" />
			<p v-if="loading" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

			<EmptyStateBox
				v-else-if="visible.length === 0"
				padding="lg"
				:message="t('views.cameraMicrophone.empty')"
			/>

			<article
				v-for="entry in visible"
				v-else
				:key="entry.application.binary_path"
				class="rounded-corner border border-ui-border bg-ui-surface/40 p-4 flex flex-col gap-3"
			>
				<header class="flex flex-wrap items-start gap-3">
					<div class="min-w-0 flex-1">
						<h3 class="font-semibold text-tx-main truncate">
							{{ entry.application.display_name }}
						</h3>
						<p class="text-xs text-tx-muted break-all">
							{{ entry.application.binary_path }}
						</p>
						<p
							v-if="!estaConfinada(entry)"
							class="mt-1 text-xs text-status-warning"
						>
							{{ t('views.cameraMicrophone.notConfined') }}
						</p>
					</div>
					<button
						type="button"
						:disabled="busyPath === entry.application.binary_path"
						class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-main hover:bg-ui-surface disabled:opacity-50"
						@click="forget(entry)"
					>
						{{ t('views.cameraMicrophone.forget') }}
					</button>
				</header>

				<ul class="flex flex-col gap-2">
					<li
						v-for="resource in RESOURCES"
						:key="resource"
						class="flex items-center justify-between gap-3"
					>
						<span class="min-w-0 text-sm text-tx-main">
							{{ t(`views.cameraMicrophone.resources.${resource}`) }}
						</span>
						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decisionOf(entry, resource) === 'allowed'
										? 'bg-status-success/20 text-status-success font-semibold'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, resource, true)"
							>
								{{ t('views.cameraMicrophone.allow') }}
							</button>
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decisionOf(entry, resource) === 'denied'
										? 'bg-status-error/20 text-status-error font-semibold'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, resource, false)"
							>
								{{ t('views.cameraMicrophone.deny') }}
							</button>
						</div>
					</li>
				</ul>
			</article>
		</SectionCard>
	</div>
</template>
