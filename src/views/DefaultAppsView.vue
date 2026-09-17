<script lang="ts" setup>
/**
 * Con qué abre el sistema cada cosa.
 *
 * Hasta acá esto se cambiaba editando `~/.config/mimeapps.list` a mano, o no se
 * cambiaba: los valores por omisión los trae `vasak-desktop-settings` y no había
 * ninguna pantalla que los pisara.
 *
 * Cada fila lista **sólo** las aplicaciones que declaran manejar ese tipo, y no
 * todo lo instalado. Una lista con las doscientas entradas del sistema obliga a
 * buscar el navegador entre doscientos nombres, y deja elegir cosas que no van a
 * funcionar.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, ref } from 'vue';
import IconoDeApp from '@/components/permisos/IconoDeApp.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import {
	CATEGORIAS,
	type CategoriaDeAplicacion,
	TERMINAL,
	tipoPrincipal,
	tiposQueIdentifican,
} from '@/composables/categorias-de-aplicaciones';
import {
	aplicacionPorDefecto,
	type Candidata,
	candidatasPara,
	definirAplicacion,
	definirTerminal,
	terminalesDisponibles,
	terminalPorDefecto,
} from '@/services/aplicaciones-por-defecto.service';

/** Una fila, con lo que hace falta para dibujarla. */
interface Fila {
	categoria: CategoriaDeAplicacion;
	candidatas: Candidata[];
	/** El `.desktop` elegido, o vacío si no hay ninguno. */
	elegida: string;
}

const { t } = useI18n();

const filas = ref<Fila[]>([]);
const cargando = ref(true);
const error = ref('');
const aviso = ref('');

/** El icono que le toca a la elegida, para mostrarlo al lado del selector. */
function iconoDe(fila: Fila): string {
	return fila.candidatas.find((c) => c.id === fila.elegida)?.icono ?? '';
}

async function cargarFila(categoria: CategoriaDeAplicacion): Promise<Fila> {
	if (categoria.id === TERMINAL) {
		const [candidatas, elegida] = await Promise.all([
			terminalesDisponibles(),
			terminalPorDefecto(),
		]);

		return { categoria, candidatas, elegida: elegida ?? '' };
	}

	const tipo = tipoPrincipal(categoria);
	const [candidatas, elegida] = await Promise.all([
		candidatasPara(tiposQueIdentifican(categoria)),
		tipo ? aplicacionPorDefecto(tipo) : Promise.resolve(null),
	]);

	return { categoria, candidatas, elegida: elegida ?? '' };
}

onMounted(async () => {
	try {
		filas.value = await Promise.all(CATEGORIAS.map(cargarFila));
	} catch (err) {
		error.value = t('views.defaultApps.errorCargando').replace('{0}', String(err));
		console.error(err);
	} finally {
		cargando.value = false;
	}
});

async function elegir(fila: Fila, id: string) {
	const anterior = fila.elegida;
	// Se mueve el selector antes de guardar y se vuelve atrás si falla: dejarlo
	// en el valor viejo mientras se escribe hace que el clic parezca ignorado.
	fila.elegida = id;
	error.value = '';
	aviso.value = '';

	try {
		if (fila.categoria.id === TERMINAL) {
			const elegida = fila.candidatas.find((c) => c.id === id);

			if (!elegida) return;

			await definirTerminal(elegida.id, elegida.programa);
			// La variable la lee systemd al iniciar la sesión, así que lo que se
			// acaba de elegir no rige para lo que ya está abierto. Decirlo es la
			// diferencia entre «no funcionó» y «funciona en el próximo inicio».
			aviso.value = t('views.defaultApps.terminalEnLaProxima');
		} else {
			await definirAplicacion(fila.categoria.tipos, id);
		}
	} catch (err) {
		fila.elegida = anterior;
		error.value = t('views.defaultApps.errorGuardando').replace('{0}', String(err));
		console.error(err);
	}
}
</script>

<template>
	<section class="flex flex-col gap-6">
		<PageHeader
			:section="t('sidebar.general')"
			:title="t('views.defaultApps.title')"
			:description="t('views.defaultApps.description')" />

		<AlertMessage v-if="error" :message="error" tone="error" />
		<AlertMessage v-if="aviso" :message="aviso" tone="info" />

		<p v-if="cargando" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

		<SectionCard v-else>
			<div class="flex flex-col gap-5">
				<div v-for="fila in filas" :key="fila.categoria.id" class="flex items-center gap-4">
					<IconoDeApp :nombre="iconoDe(fila) || fila.categoria.icono" />

					<FormGroup
						:label="t(`views.defaultApps.categorias.${fila.categoria.id}`)"
						:html-for="`app-${fila.categoria.id}`"
						custom-class="flex-1">
						<SelectInput
							v-if="fila.candidatas.length"
							:id="`app-${fila.categoria.id}`"
							:model-value="fila.elegida"
							:options="fila.candidatas.map((c) => ({ label: c.nombre, value: c.id }))"
							@update:model-value="elegir(fila, $event)" />

						<!-- Sin candidatas no hay nada que elegir, y un selector vacío
						     se lee como que la pantalla está rota. -->
						<EmptyStateBox v-else :message="t('views.defaultApps.sinCandidatas')" />
					</FormGroup>
				</div>
			</div>
		</SectionCard>
	</section>
</template>
