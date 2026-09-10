<script setup lang="ts">
/**
 * Qué hay para actualizar, y qué conviene mirar antes de hacerlo.
 *
 * # Por qué esta pantalla no actualiza
 *
 * Sólo mira. Aplicar necesita privilegios de administrador, y eso no va a
 * pasar por esta ventana: un `pkexec pacman -Syu` desde una interfaz gráfica
 * es una consola de root con los argumentos que ponga la interfaz. Va a ir por
 * un servicio del sistema con una interfaz acotada, como ya hacen
 * `vasak-permissions` y `vasak-accounts`. Mientras tanto la pantalla dice el
 * comando en vez de esconderlo.
 *
 * # Lo que se avisa, y con qué tono
 *
 * El aviso del espacio en la partición de arranque es de **riesgo**, no de
 * imposibilidad, y por eso no bloquea nada. mkinitcpio, cuando le sobra
 * espacio, escribe el arranque a un temporal y lo renombra: si se corta la
 * luz, el anterior queda entero. Cuando no le sobra escribe encima, y ahí una
 * interrupción deja el arranque a medio escribir y el equipo no enciende.
 *
 * Decirlo como «no hay espacio» sería mentir —la actualización funciona— y
 * decirlo como nada sería callar el único fallo de esta lista que deja un
 * equipo que no arranca.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import {
	type Actualizacion,
	actualizacionesPendientes,
	type Preflight,
	preflightActualizacion,
} from '@/services/actualizaciones.service';

const { t } = useI18n();

const cargando = ref(true);
const pendientes = ref<Actualizacion[]>([]);
const preflight = ref<Preflight | null>(null);

/** Bytes en algo que se pueda leer de un vistazo. */
function tamano(bytes: number): string {
	const unidades = ['B', 'KiB', 'MiB', 'GiB'];
	let n = bytes;
	let i = 0;
	while (n >= 1024 && i < unidades.length - 1) {
		n /= 1024;
		i++;
	}
	// Sin decimales a partir de los MiB: en un aviso sobre espacio de disco,
	// «286 MiB» se entiende y «286,4 MiB» sólo agrega ruido.
	return `${i >= 2 ? Math.round(n) : n.toFixed(1)} ${unidades[i]}`;
}

/** Si hay algo que decir antes de aplicar. */
const hayQueMirar = computed(
	() =>
		!!preflight.value &&
		(preflight.value.pide_reinicio ||
			!preflight.value.hay_lugar_con_red ||
			preflight.value.pacnew.length > 0)
);

/**
 * El aviso del arranque, con los dos números adentro.
 *
 * `AlertMessage` recibe el texto y no una ranura, así que se arma acá en vez
 * de en la plantilla — que con dos `replace` encadenados quedaba ilegible.
 */
const avisoDelArranque = computed(() =>
	t('views.actualizaciones.bootJustoDetalle')
		.replace('{0}', tamano(preflight.value?.boot_disponible_bytes ?? 0))
		.replace('{1}', tamano(preflight.value?.boot_necesario_bytes ?? 0))
);

onMounted(async () => {
	// Las dos por separado y no una que devuelva todo: la lista se puede
	// mostrar en cuanto llega, y el preflight consulta `pacman -Qlq` por cada
	// paquete que se actualiza y tarda más.
	try {
		pendientes.value = await actualizacionesPendientes();
	} catch {
		pendientes.value = [];
	}
	cargando.value = false;
	try {
		preflight.value = await preflightActualizacion();
	} catch {
		preflight.value = null;
	}
});
</script>

<template>
  <div>
    <PageHeader
      :section="t('sidebar.system')"
      :title="t('views.actualizaciones.titulo')"
      :description="t('views.actualizaciones.intro')"
    />

    <div class="space-y-4">
      <EmptyStateBox v-if="cargando" :message="t('views.actualizaciones.comprobando')" />

      <EmptyStateBox
        v-else-if="pendientes.length === 0"
        :message="`${t('views.actualizaciones.alDia')} ${t('views.actualizaciones.alDiaDetalle')}`"
      />

      <template v-else>
        <!--
          Lo que hay que mirar va **arriba** de la lista de paquetes. Una lista
          de cuatrocientos nombres con el aviso al pie es un aviso que no se
          lee.
        -->
        <SectionCard v-if="preflight && hayQueMirar">
          <header>
            <h2 class="font-medium text-lg text-tx-main">
              {{ t('views.actualizaciones.antesDeAplicar') }}
            </h2>
          </header>

          <div class="mt-3 space-y-3">
            <AlertMessage
              v-if="!preflight.hay_lugar_con_red"
              tone="warning"
              :message="avisoDelArranque"
            />

            <template v-if="preflight.pide_reinicio">
              <AlertMessage tone="info" :message="t('views.actualizaciones.kernelCambiaDetalle')" />
              <ul class="font-mono text-tx-muted text-xs">
                <li v-for="k in preflight.kernels" :key="k">{{ k }}</li>
              </ul>
            </template>

            <template v-if="preflight.pacnew.length">
              <AlertMessage tone="info" :message="t('views.actualizaciones.pacnewDetalle')" />
              <ul class="font-mono text-tx-muted text-xs">
                <li v-for="f in preflight.pacnew" :key="f">{{ f }}</li>
              </ul>
            </template>
          </div>
        </SectionCard>

        <SectionCard>
          <header>
            <h2 class="mb-3 font-medium text-lg text-tx-main">
              {{
                pendientes.length === 1
                  ? t('views.actualizaciones.unPaquete')
                  : t('views.actualizaciones.hayPaquetes').replace('{0}', String(pendientes.length))
              }}
            </h2>
          </header>
          <ul class="space-y-1 text-sm">
            <li
              v-for="a in pendientes"
              :key="a.nombre"
              class="flex flex-wrap items-baseline gap-x-2"
            >
              <span class="font-medium">{{ a.nombre }}</span>
              <span class="font-mono text-tx-muted text-xs">
                {{ a.version_vieja }} → {{ a.version_nueva }}
              </span>
            </li>
          </ul>
        </SectionCard>

        <SectionCard>
          <header>
            <h2 class="mb-2 font-medium text-lg text-tx-main">
              {{ t('views.actualizaciones.comoAplicar') }}
            </h2>
          </header>
          <p class="text-sm">{{ t('views.actualizaciones.comoAplicarDetalle') }}</p>
          <pre class="mt-2 rounded-corner bg-ui-surface/60 p-2 font-mono text-sm">sudo pacman -Syu</pre>
          <p class="mt-2 text-tx-muted text-xs">{{ t('views.actualizaciones.aplicarNota') }}</p>
        </SectionCard>
      </template>
    </div>
  </div>
</template>
