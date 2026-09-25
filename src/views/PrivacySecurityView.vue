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
 *    a los AppImage de la carpeta del usuario, y permitir acá le escribe una
 *    excepción. Eso el kernel lo hace cumplir sin importar quién la haya
 *    abierto.
 *
 *    **A ésos y a nadie más**, que es más angosto de lo que parece y de lo que
 *    esta pantalla decía. `vasak-appimage` es el único perfil que niega estas
 *    tres cosas y se engancha a los AppImage de `@{HOME}`: un binario suelto en
 *    la carpeta del usuario tampoco tiene perfil, aunque el sistema no lo haya
 *    instalado. Decir «lo que no instaló el sistema» prometía de más.
 *  - Con la cámara y el micrófono sólo cubre el acceso **directo** al
 *    dispositivo. Una aplicación que se los pida a PipeWire —que es como los
 *    piden las aplicaciones modernas— todavía no se detiene.
 *  - Las credenciales sí quedan cubiertas enteras, porque son archivos y
 *    sockets y no hay un servicio intermedio que las reparta. Van los agentes
 *    de SSH y GPG además de las claves: con el socket del agente se firma sin
 *    leer ningún archivo, así que negar sólo la carpeta no serviría de nada.
 *  - Compartir la pantalla era la tercera cosa que la gente esperaba encontrar
 *    acá, y ahora está: el backend del portal pregunta, guarda la respuesta y
 *    la respeta, así que lo concedido se ve y se retira desde esta pantalla.
 *    Con una salvedad que la propia pantalla dice — por el portal la
 *    aplicación se identifica con un nombre que declara ella misma, no con la
 *    ruta de su ejecutable, así que vale menos que las otras identidades de
 *    esta lista.
 *
 * Callar cualquiera de esas tres cosas sería repetir el error que llevó a
 * quitar la pantalla anterior.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref } from 'vue';
import IconoDeApp from '@/components/permisos/IconoDeApp.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import {
	allowBlocked,
	type BlockedItem,
	dismissBlocked,
	forgetPermission,
	listBlocked,
	listPermissions,
	type PermissionEntry,
	setPermission,
} from '@/services/permissions.service';
import { groupByResource } from '@/tools/permissions-by-resource';
import {
	PRIVACY_RESOURCES,
	type PrivacyResource,
	resourceIcon,
	resourceLabelKey,
} from '@/tools/privacy-resources';

const { t } = useI18n();

/**
 * El nombre de un recurso en el idioma de la sesión.
 *
 * La lista, las claves y los iconos viven en `tools/privacy-resources.ts`,
 * probados aparte: acá sólo se traduce. Los ids con punto (`account.email`,
 * `store.email`) no pueden ir tal cual a la clave, y el mapa de ese módulo es
 * lo que lo evita.
 */
const labelOf = (id: string) => t(resourceLabelKey(id));

const entries = ref<PermissionEntry[]>([]);
/**
 * Lo que algún perfil del sistema bloqueó y todavía nadie decidió.
 *
 * Va aparte de `entries` porque es otra cosa: `entries` son decisiones sobre
 * recursos con nombre, y esto son hechos —tal perfil no dejó abrir tal ruta—
 * que existen hasta que alguien los resuelve. Sin esta lista, un perfil que
 * niega algo deja un programa que falla sin explicación y sin remedio, que es
 * lo que obliga a tener los perfiles del sistema en modo aviso.
 */
const blockedItems = ref<BlockedItem[]>([]);
/** El bloqueo sobre el que se está actuando, por `blockedKey`. */
const busyBlockedKey = ref('');
const loading = ref(true);
const errorMessage = ref('');
const busyPath = ref('');

/**
 * Trae la lista.
 *
 * `refresh` es para volver a leerla **después** de una acción que falló: sin
 * eso, esta función limpiaba el mensaje que el manejador acababa de escribir y
 * ningún fallo llegaba a verse. Una autenticación rechazada se veía igual que
 * un cambio aplicado, que es la peor forma de equivocarse en una pantalla de
 * permisos.
 */
const load = async (refresh = false) => {
	if (!refresh) {
		loading.value = true;
		errorMessage.value = '';
	}
	try {
		entries.value = await listPermissions();
		// Si esto falla no se pierde la lista de permisos: son dos cosas
		// independientes y una pantalla a medias es mejor que una vacía.
		blockedItems.value = await listBlocked().catch(() => blockedItems.value);
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		loading.value = false;
	}
};

/**
 * La lista dada vuelta: un recurso por pestaña, con las aplicaciones adentro.
 *
 * El servicio contesta por aplicación porque así es como decide, pero la
 * pregunta que alguien trae acá es «¿quién puede usar mi cámara?». Con la lista
 * por aplicación había que abrir una por una y recordar lo que decía la
 * anterior. La cuenta está en `tools/permissions-by-resource.ts`, probada aparte.
 */
const resourceGroups = computed(() => groupByResource(entries.value, PRIVACY_RESOURCES));

/**
 * Qué permiso se está mirando, o `null` para la lista.
 *
 * La pantalla entra por la lista y no por una pestaña abierta. Con nueve
 * recursos la fila de pestañas no entraba, y las que quedaban vacías —la cámara
 * y el micrófono lo están hasta que una aplicación confinada las pide— se leían
 * como «acá no hay nada» en vez de «todavía nadie pidió esto».
 *
 * En la lista cada permiso dice cuántas aplicaciones lo tienen concedido, que
 * es el número que alguien vino a mirar, y ninguno desaparece por estar en
 * cero: la lista es también el inventario de lo que el sistema sabe decidir.
 */
const openResource = ref<PrivacyResource | null>(null);

const activeGroup = computed(() =>
	resourceGroups.value.find((group) => group.id === openResource.value)
);

/**
 * Si cambiar esto acá va a servir de algo.
 *
 * Hay dos maneras de que una decisión se haga cumplir, y mirar sólo la
 * procedencia confundía una con la otra:
 *
 *  - A lo que el sistema **no** instaló lo confina un perfil, y permitirle algo
 *    le escribe una excepción. Lo hace cumplir el kernel, sin que el programa
 *    colabore.
 *  - Un programa del sistema no tiene perfil que lo limite, pero si **pregunta**
 *    —como `vasak-connect` antes de encender la cámara del teléfono— respeta lo
 *    que se le conteste, así que su decisión vale igual.
 *
 * Con la condición anterior, el segundo caso aparecía con el interruptor
 * apagado: un permiso concedido sin forma de retirarlo, que es justo lo que
 * esta pantalla existe para evitar.
 */
const canDecide = (entry: PermissionEntry) =>
	entry.application.provenance === 'unverified' || entry.asks;

/** Identifica un bloqueo: el par perfil+ruta es único en la lista. */
const blockedKey = (b: BlockedItem) => `${b.perfil}\u0000${b.ruta}`;

const allowBlockedItem = async (b: BlockedItem) => {
	busyBlockedKey.value = blockedKey(b);
	errorMessage.value = '';
	try {
		await allowBlocked(b.perfil, b.ruta);
	} catch (error) {
		// Una autenticación rechazada es lo normal, no una alarma.
		errorMessage.value = String(error);
	} finally {
		busyBlockedKey.value = '';
		await load(true);
	}
};

const dismissBlockedItem = async (b: BlockedItem) => {
	busyBlockedKey.value = blockedKey(b);
	errorMessage.value = '';
	try {
		await dismissBlocked(b.perfil, b.ruta);
	} catch (error) {
		errorMessage.value = String(error);
	} finally {
		busyBlockedKey.value = '';
		await load(true);
	}
};

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

		<!-- Lo que un perfil del sistema bloqueó y espera decisión.
		     Va en su propia tarjeta y arriba de la lista de aplicaciones porque
		     es lo único de esta pantalla que pide una acción: lo demás es
		     estado que se consulta. -->
		<SectionCard v-if="blockedItems.length > 0">
			<header>
				<h2 class="text-lg font-medium text-tx-main">
					{{ t('views.privacySecurity.blocked.title') }}
				</h2>
				<p class="text-sm text-tx-muted">
					{{ t('views.privacySecurity.blocked.description') }}
				</p>
			</header>

			<article
				v-for="b in blockedItems"
				:key="blockedKey(b)"
				class="rounded-corner border border-ui-border bg-ui-surface/70 p-4 flex flex-col gap-3"
			>
				<div class="min-w-0">
					<h3 class="font-semibold text-tx-main truncate">{{ b.perfil }}</h3>
					<p v-if="b.programa" class="text-xs text-tx-muted break-all">{{ b.programa }}</p>
					<!-- La ruta completa, sin recortar: es lo que se está por
					     autorizar, y un «…» al final esconde justo la parte que
					     distingue un archivo tuyo de otro que no lo es. -->
					<p class="mt-2 text-sm text-tx-main break-all font-mono">{{ b.ruta }}</p>
					<p class="mt-1 text-xs text-tx-muted">
						{{ t('views.privacySecurity.blocked.permissions') }}: {{ b.mascara }}
						<span v-if="b.veces > 1">
							· {{ t('views.privacySecurity.blocked.times').replace('{0}', String(b.veces)) }}
						</span>
					</p>
				</div>

				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						:disabled="busyBlockedKey === blockedKey(b)"
						class="rounded-corner px-3 py-1 text-xs border border-ui-border text-tx-main hover:bg-ui-surface disabled:opacity-50"
						@click="allowBlockedItem(b)"
					>
						{{ t('views.privacySecurity.allow') }}
					</button>
					<button
						type="button"
						:disabled="busyBlockedKey === blockedKey(b)"
						class="rounded-corner px-3 py-1 text-xs border border-ui-border text-tx-muted hover:bg-ui-surface disabled:opacity-50"
						@click="dismissBlockedItem(b)"
					>
						{{ t('views.privacySecurity.blocked.dismiss') }}
					</button>
				</div>
			</article>
		</SectionCard>

		<SectionCard>
			<AlertMessage v-if="errorMessage" tone="error">{{ errorMessage }}</AlertMessage>
			<p v-if="loading" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

			<!-- La lista de permisos, que es por donde se entra. Antes era una
			     fila de pestañas: con nueve recursos no entraba, y las vacías
			     —cámara y micrófono, hasta que una aplicación confinada las
			     pide— se leían como «acá no hay nada». -->
			<ul v-else-if="!openResource" class="flex flex-col gap-2">
				<li v-for="group in resourceGroups" :key="group.id">
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-3 text-left hover:bg-ui-surface"
						@click="openResource = group.id"
					>
						<ThemeIcon :name="resourceIcon(group.id)" type="symbol" :size="24" />

						<span class="min-w-0 flex-1 truncate font-medium text-tx-main">{{ labelOf(group.id) }}</span>

						<!-- Cuántas lo tienen concedido, no cuántas lo pidieron: es
						     el número que alguien vino a mirar. En cero no se
						     dibuja nada, para que el ojo vaya a los que sí. -->
						<span
							v-if="group.allowedCount > 0"
							class="shrink-0 rounded-corner-sm bg-status-success/20 px-1.5 text-xs text-status-success"
						>
							{{ group.allowedCount }}
						</span>
						<span v-else class="shrink-0 text-xs text-tx-muted">
							{{ t('views.privacySecurity.none') }}
						</span>

						<span class="shrink-0 text-tx-muted" aria-hidden="true">›</span>
					</button>
				</li>
			</ul>

			<template v-else>
				<!-- Volver arriba de todo, antes del nombre: es lo primero que se
				     busca al entrar por error en el permiso equivocado. -->
				<div class="flex items-center gap-3 border-b border-ui-border pb-3">
					<button
						type="button"
						class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface"
						@click="openResource = null"
					>
						‹ {{ t('views.privacySecurity.back') }}
					</button>

					<ThemeIcon v-if="openResource" :name="resourceIcon(openResource)" type="symbol" :size="24" />
					<h3 class="min-w-0 flex-1 truncate font-semibold text-tx-main">
						{{ openResource ? labelOf(openResource) : '' }}
					</h3>
				</div>

				<EmptyStateBox
					v-if="activeGroup && activeGroup.apps.length === 0"
					padding="lg"
					:message="t('views.privacySecurity.noAppsForResource')"
				/>

				<ul v-else class="flex flex-col gap-2">
					<li
						v-for="{ entry, decision } in activeGroup?.apps ?? []"
						:key="entry.application.binary_path"
						class="flex flex-wrap items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-3"
					>
						<IconoDeApp :nombre="entry.application.icon" />

						<div class="min-w-0 flex-1">
							<h3 class="truncate font-semibold text-tx-main">
								{{ entry.application.display_name }}
							</h3>
							<p class="truncate text-xs text-tx-muted" :title="entry.application.binary_path">
								{{ entry.application.binary_path }}
							</p>
							<p
								v-if="!canDecide(entry)"
								class="mt-1 text-xs text-status-warning"
							>
								{{ t('views.privacySecurity.notConfined') }}
							</p>
						</div>

						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path || !canDecide(entry)"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decision === 'allowed'
										? 'bg-status-success/20 font-semibold text-status-success'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, openResource ?? '', true)"
							>
								{{ t('views.privacySecurity.allow') }}
							</button>
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path || !canDecide(entry)"
								class="rounded-corner px-3 py-1 text-xs disabled:opacity-50"
								:class="
									decision === 'denied'
										? 'bg-status-error/20 font-semibold text-status-error'
										: 'border border-ui-border text-tx-muted hover:bg-ui-surface'
								"
								@click="change(entry, openResource ?? '', false)"
							>
								{{ t('views.privacySecurity.deny') }}
							</button>
							<!-- Olvidar es por aplicación y no por recurso: borra lo
							     decidido sobre todos. Por eso dice qué hace y va
							     separado de los dos de arriba. -->
							<button
								type="button"
								:disabled="busyPath === entry.application.binary_path"
								:title="t('views.privacySecurity.forgetHint')"
								class="rounded-corner border border-ui-border px-3 py-1 text-xs text-tx-main hover:bg-ui-surface disabled:opacity-50"
								@click="forget(entry)"
							>
								{{ t('views.privacySecurity.forget') }}
							</button>
						</div>
					</li>
				</ul>
			</template>

			<!-- El alcance, al pie y en letra chica.
			     Tiene que estar —mientras las vías de PipeWire y de screencopy
			     sigan abiertas, esta pantalla no puede presentarse como
			     protección completa— pero no arriba de todo: un párrafo largo
			     encima de los permisos se lee una vez y después estorba cada vez
			     que se entra a cambiar algo, que es a lo que se viene.
			     Al pie sigue estando para quien lo busca.

			     Va en los dos lados, la lista y el detalle, y no sólo en la
			     lista: la salvedad importa más justo donde están los
			     interruptores. -->
			<p class="border-t border-ui-border pt-3 text-xs leading-relaxed text-tx-muted">
				{{ t('views.privacySecurity.scope') }}
			</p>
		</SectionCard>
	</div>
</template>
