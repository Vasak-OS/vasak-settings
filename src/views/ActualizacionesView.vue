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
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	type Actualizacion,
	activarAviso,
	avisoActivo,
	informeDeActualizaciones,
	intervaloDeComprobacion,
	type Preflight,
	ponerIntervaloDeComprobacion,
} from '@/services/actualizaciones.service';

const { t } = useI18n();

const cargando = ref(true);
const pendientes = ref<Actualizacion[]>([]);
const preflight = ref<Preflight | null>(null);
/** Si `vasak-update` está instalado. Sin él no hay nada que mostrar. */
const hayPrograma = ref(true);

const avisa = ref(false);
const intervalo = ref(1);

/**
 * Cada cuánto se puede elegir comprobar.
 *
 * Tres opciones y no un número libre: entre «cada 4 días» y «cada 5» no hay
 * ninguna diferencia que a alguien le importe, y un campo numérico invita a
 * pensarlo. Quien de verdad quiera otro valor tiene el archivo de systemd, y
 * el README lo dice.
 */
const INTERVALOS = [1, 3, 7];

/** El nombre de un intervalo, que no es «cada N días» para los tres casos. */
function nombreDelIntervalo(dias: number): string {
	if (dias === 1) return t('views.actualizaciones.unDia');
	if (dias === 3) return t('views.actualizaciones.tresDias');
	return t('views.actualizaciones.unaSemana');
}

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

async function cambiarAviso(activo: boolean) {
	// Se pinta primero y se corrige si falla: un interruptor que tarda medio
	// segundo en moverse hace que lo aprieten dos veces.
	avisa.value = activo;
	try {
		await activarAviso(activo);
	} catch {
		avisa.value = !activo;
	}
}

async function cambiarIntervalo(dias: number) {
	const anterior = intervalo.value;
	intervalo.value = dias;
	try {
		await ponerIntervaloDeComprobacion(dias);
	} catch {
		intervalo.value = anterior;
	}
}

onMounted(async () => {
	// Las dos por separado y no una que devuelva todo: la lista se puede
	// mostrar en cuanto llega, y el preflight consulta `pacman -Qlq` por cada
	// paquete que se actualiza y tarda más.
	// Los ajustes primero: son instantáneos y no dependen de la red, así que
	// la pantalla tiene algo utilizable mientras se comprueba.
	try {
		avisa.value = await avisoActivo();
		intervalo.value = await intervaloDeComprobacion();
	} catch {
		// Sin systemd los ajustes no se pueden leer ni cambiar; el resto de la
		// pantalla sigue sirviendo.
	}

	try {
		const informe = await informeDeActualizaciones();
		hayPrograma.value = informe.disponible;
		pendientes.value = informe.datos?.pendientes ?? [];
		preflight.value = informe.datos?.preflight ?? null;
	} catch {
		hayPrograma.value = false;
	}
	cargando.value = false;
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
      <SectionCard>
        <header>
          <h2 class="mb-3 font-medium text-lg text-tx-main">
            {{ t('views.actualizaciones.ajustes') }}
          </h2>
        </header>

        <SwitchToggle
          :label="t('views.actualizaciones.avisar')"
          :is-on="avisa"
          @toggle="cambiarAviso"
        />
        <p class="mt-1 text-tx-muted text-xs">{{ t('views.actualizaciones.avisarAyuda') }}</p>

        <div v-if="avisa" class="mt-3 flex flex-wrap items-center gap-3">
          <label class="text-sm" for="intervalo-actualizaciones">
            {{ t('views.actualizaciones.cadaCuanto') }}
          </label>
          <SelectInput
            id="intervalo-actualizaciones"
            :model-value="intervalo"
            :options="INTERVALOS.map((d) => ({ value: d, label: nombreDelIntervalo(d) }))"
            @update:model-value="cambiarIntervalo(Number($event))"
          />
        </div>
      </SectionCard>

      <AlertMessage
        v-if="!hayPrograma"
        tone="warning"
        :message="t('views.actualizaciones.sinProgramaDetalle')"
      />

      <EmptyStateBox v-else-if="cargando" :message="t('views.actualizaciones.comprobando')" />

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
