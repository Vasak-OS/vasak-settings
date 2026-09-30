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
import { AlertMessage, FormGroup } from '@vasakgroup/vue-libvasak';
import { onMounted, ref } from 'vue';
import AppIcon from '@/components/permissions/AppIcon.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
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
interface Row {
	category: CategoriaDeAplicacion;
	candidates: Candidata[];
	/** El `.desktop` elegido, o vacío si no hay ninguno. */
	selected: string;
	/**
	 * Si hay una escritura en curso para esta fila.
	 *
	 * Mientras la hay, el selector queda deshabilitado. Sin eso se puede cambiar
	 * la misma fila dos veces antes de que termine la primera: las dos llamadas
	 * son independientes, así que la primera puede terminar **después** de la
	 * segunda y dejar guardada la elección vieja — y si la primera falla, su
	 * vuelta atrás pisa la segunda elección, que ya se había dibujado.
	 */
	saving: boolean;
}

const { t } = useI18n();

const rows = ref<Row[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

/** El icono que le toca a la elegida, para mostrarlo al lado del selector. */
function selectedIcon(row: Row): string {
	return row.candidates.find((c) => c.id === row.selected)?.icono ?? '';
}

async function loadRow(category: CategoriaDeAplicacion): Promise<Row> {
	if (category.id === TERMINAL) {
		const [candidates, selected] = await Promise.all([
			terminalesDisponibles(),
			terminalPorDefecto(),
		]);

		return { category, candidates, selected: selected ?? '', saving: false };
	}

	const primaryType = tipoPrincipal(category);
	const [candidates, selected] = await Promise.all([
		candidatasPara(tiposQueIdentifican(category)),
		primaryType ? aplicacionPorDefecto(primaryType) : Promise.resolve(null),
	]);

	return { category, candidates, selected: selected ?? '', saving: false };
}

onMounted(async () => {
	try {
		rows.value = await Promise.all(CATEGORIAS.map(loadRow));
	} catch (err) {
		error.value = t('views.defaultApps.errorCargando').replace('{0}', String(err));
		console.error(err);
	} finally {
		loading.value = false;
	}
});

async function choose(row: Row, id: string) {
	if (row.saving) return;

	const previous = row.selected;
	// Se mueve el selector antes de guardar y se vuelve atrás si falla: dejarlo
	// en el valor viejo mientras se escribe hace que el clic parezca ignorado.
	row.selected = id;
	row.saving = true;
	error.value = '';
	notice.value = '';

	try {
		if (row.category.id === TERMINAL) {
			const terminal = row.candidates.find((c) => c.id === id);

			if (!terminal) return;

			await definirTerminal(terminal.id, terminal.programa);
			// La variable la lee systemd al iniciar la sesión, así que lo que se
			// acaba de elegir no rige para lo que ya está abierto. Decirlo es la
			// diferencia entre «no funcionó» y «funciona en el próximo inicio».
			notice.value = t('views.defaultApps.terminalEnLaProxima');
		} else {
			await definirAplicacion(row.category.tipos, id);
		}
	} catch (err) {
		row.selected = previous;
		error.value = t('views.defaultApps.errorGuardando').replace('{0}', String(err));
		console.error(err);
	} finally {
		row.saving = false;
	}
}
</script>

<template>
	<section class="flex flex-col gap-6">
		<PageHeader
			:section="t('sidebar.general')"
			:title="t('views.defaultApps.title')"
			:description="t('views.defaultApps.description')" />

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
		<AlertMessage v-if="notice" tone="info">{{ notice }}</AlertMessage>

		<p v-if="loading" class="text-sm text-tx-muted">{{ t('common.loading') }}</p>

		<SectionCard v-else>
			<div class="flex flex-col gap-5">
				<div v-for="row in rows" :key="row.category.id" class="flex items-center gap-4">
					<AppIcon :name="selectedIcon(row) || row.category.icono" />

					<FormGroup
						:label="t(`views.defaultApps.categorias.${row.category.id}`)"
						:html-for="`app-${row.category.id}`"
						custom-class="flex-1">
						<SelectInput
							v-if="row.candidates.length"
							:id="`app-${row.category.id}`"
							:model-value="row.selected"
							:disabled="row.saving"
							:options="row.candidates.map((c) => ({ label: c.nombre, value: c.id }))"
							@update:model-value="choose(row, $event)" />

						<!-- Sin candidatas no hay nada que elegir, y un selector vacío
						     se lee como que la pantalla está rota. -->
						<EmptyStateBox v-else :message="t('views.defaultApps.sinCandidatas')" />
					</FormGroup>
				</div>
			</div>
		</SectionCard>
	</section>
</template>
