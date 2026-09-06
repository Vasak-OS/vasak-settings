<script setup lang="ts">
/**
 * Qué aplicaciones pueden usar la cámara y el micrófono, y cuáles pueden leer
 * tus claves.
 *
 * # Por qué vuelve a llamarse así
 *
 * Esta pantalla existió, se quitó en 41d5d68 porque prometía lo que el sistema
 * no controlaba —quien la abría esperaba la cámara, el micrófono y la pantalla,
 * y de las tres no había ninguna— y vuelve ahora que dos de esas tres sí se
 * controlan.
 *
 * Se intentó llamarla «Cámara y micrófono» para no prometer de más, y el nombre
 * creaba otra expectativa equivocada: quien lee eso espera **configurar** los
 * dispositivos —el nivel del micrófono, la resolución de la cámara— y no
 * administrar quién los usa. Un apartado de seguridad es lo que corresponde a
 * lo que hace.
 *
 * La advertencia que motivó el borrado sigue valiendo igual: un interruptor que
 * parece protección y no lo es, es peor que no tener interruptor. Por eso lo
 * que **no** cubre está dicho en la pantalla y no acá:
 *
 *  - Un perfil de AppArmor le niega la cámara, el micrófono y tus credenciales
 *    a las aplicaciones que el sistema no instaló, y permitir acá le escribe
 *    una excepción. Eso el kernel lo hace cumplir sin importar quién la haya
 *    abierto.
 *  - Con la cámara y el micrófono sólo cubre el acceso **directo** al
 *    dispositivo. Una aplicación que se los pida a PipeWire —que es como los
 *    piden las aplicaciones modernas— todavía no se detiene.
 *  - Las credenciales sí quedan cubiertas enteras, porque son archivos y
 *    sockets y no hay un servicio intermedio que las reparta. Van los agentes
 *    de SSH y GPG además de las claves: con el socket del agente se firma sin
 *    leer ningún archivo, así que negar sólo la carpeta no serviría de nada.
 *  - Y la captura de pantalla, que era la tercera cosa que la gente esperaba
 *    encontrar acá, sigue sin control: el compositor se la entrega a cualquier
 *    cliente que la pida.
 *
 * Callar cualquiera de esas tres cosas sería repetir el error que llevó a
 * quitar la pantalla anterior.
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

/**
 * Lo que el perfil de AppArmor niega, y por eso lo único sobre lo que decidir
 * acá cambia algo.
 *
 * Las credenciales van primero a propósito. Es lo que más daño hace si se
 * pierde —una clave de SSH sin frase abre servidores, un token abre la cuenta
 * sin segundo factor— y lo que la persona menos espera que una aplicación
 * cualquiera pueda leer.
 */
const RESOURCES = ['credentials', 'camera', 'microphone'] as const;

const entries = ref<PermissionEntry[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const busyPath = ref('');

/**
 * Trae la lista.
 *
 * `refrescar` es para volver a leerla **después** de una acción que falló: sin
 * eso, esta función limpiaba el mensaje que el manejador acababa de escribir y
 * ningún fallo llegaba a verse. Una autenticación rechazada se veía igual que
 * un cambio aplicado, que es la peor forma de equivocarse en una pantalla de
 * permisos.
 */
const load = async (refrescar = false) => {
	if (!refrescar) {
		loading.value = true;
		errorMessage.value = '';
	}
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
 * Sólo las aplicaciones que pidieron alguna de estas tres cosas.
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
		await load(true);
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
		await load(true);
		busyPath.value = '';
	}
};

onMounted(load);
</script>

<template>
	<div class="flex flex-col gap-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.privacySecurity.title')"
			:description="t('views.privacySecurity.description')"
		/>

		<SectionCard>
			<!-- El alcance, a la vista y no en una nota al pie: mientras la vía de
			     PipeWire siga abierta, esta pantalla no puede presentarse como
			     protección completa. -->
			<AlertMessage type="info" :message="t('views.privacySecurity.scope')" />

			<AlertMessage v-if="errorMessage" type="error" :message="errorMessage" />
			<p v-if="loading" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

			<EmptyStateBox
				v-else-if="visible.length === 0"
				padding="lg"
				:message="t('views.privacySecurity.empty')"
			/>

			<template v-else>
			<article
				v-for="entry in visible"
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
							{{ t('views.privacySecurity.notConfined') }}
						</p>
					</div>
					<button
						type="button"
						:disabled="busyPath === entry.application.binary_path"
						class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-main hover:bg-ui-surface disabled:opacity-50"
						@click="forget(entry)"
					>
						{{ t('views.privacySecurity.forget') }}
					</button>
				</header>

				<ul class="flex flex-col gap-2">
					<li
						v-for="resource in RESOURCES"
						:key="resource"
						class="flex items-center justify-between gap-3"
					>
						<span class="min-w-0 text-sm text-tx-main">
							{{ t(`views.privacySecurity.resources.${resource}`) }}
						</span>
						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path || !estaConfinada(entry)"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decisionOf(entry, resource) === 'allowed'
										? 'bg-status-success/20 text-status-success font-semibold'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, resource, true)"
							>
								{{ t('views.privacySecurity.allow') }}
							</button>
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path || !estaConfinada(entry)"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decisionOf(entry, resource) === 'denied'
										? 'bg-status-error/20 text-status-error font-semibold'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, resource, false)"
							>
								{{ t('views.privacySecurity.deny') }}
							</button>
						</div>
					</li>
				</ul>
			</article>
			</template>
		</SectionCard>
	</div>
</template>
