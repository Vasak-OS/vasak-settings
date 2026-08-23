<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * El menú del clic derecho de la configuración.
 *
 * El del motor del navegador ofrece «Recargar» e «Inspeccionar elemento» —que no
 * corresponden en una aplicación del escritorio— y de paso es lo único que da
 * copiar y pegar en un campo de texto. Así que apagarlo sin más le quitaría algo
 * que sí se usa: acá está el reemplazo, con lo que tiene sentido sobre texto.
 *
 * Se monta una sola vez, en el marco de la ventana, y escucha en el documento:
 * las pantallas van y vienen con el router y ninguna tiene que acordarse de
 * nada. Si en el lugar del clic no hay nada que ofrecer, no aparece ningún menú.
 */
const { t } = useI18n();

const ANCHO = 200;
const MARGEN = 8;

const abierto = ref(false);
const x = ref(0);
const y = ref(0);
const campo = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const seleccion = ref('');
const soloPegar = ref(false);

const editable = computed(() => campo.value !== null && !campo.value.readOnly);
const haySeleccion = computed(() => seleccion.value.length > 0);

/** Las contraseñas no se copian.
 *
 * Un campo de contraseña es la única cosa de esta aplicación que no debería
 * poder salir al portapapeles con dos clics: queda pegar, que es para lo que
 * alguien abre el menú sobre un campo así. */
const puedeCopiar = computed(() => haySeleccion.value && !soloPegar.value);

const cerrar = () => {
	abierto.value = false;
	campo.value = null;
	seleccion.value = '';
};

const esCampoDeTexto = (
	elemento: EventTarget | null
): HTMLInputElement | HTMLTextAreaElement | null => {
	if (elemento instanceof HTMLTextAreaElement) return elemento;

	if (elemento instanceof HTMLInputElement) {
		// Los deslizadores, las casillas y los interruptores son `input` y no
		// tienen texto que copiar.
		const escribibles = ['text', 'search', 'url', 'email', 'tel', 'number', 'password'];
		if (escribibles.includes(elemento.type)) return elemento;
	}

	return null;
};

const abrir = (evento: MouseEvent) => {
	const destino = esCampoDeTexto(evento.target);
	const seleccionado = destino
		? destino.value.slice(destino.selectionStart ?? 0, destino.selectionEnd ?? 0)
		: (window.getSelection()?.toString() ?? '');

	// Sin campo y sin texto seleccionado no hay nada que ofrecer, y un menú con
	// todo deshabilitado es peor que ningún menú.
	if (!destino && !seleccionado) return;

	campo.value = destino;
	soloPegar.value = destino?.type === 'password';
	seleccion.value = seleccionado;

	// Contra el borde: el menú se corre hacia adentro en vez de cortarse.
	x.value = Math.min(evento.clientX, window.innerWidth - ANCHO - MARGEN);
	y.value = Math.min(evento.clientY, window.innerHeight - 180);
	abierto.value = true;
};

/** Reemplaza la selección del campo respetando a Vue.
 *
 * `setRangeText` cambia el valor del elemento sin que `v-model` se entere, así
 * que hay que avisar con un evento `input`: sin eso lo escrito se ve en pantalla
 * y se pierde al guardar. */
const insertar = (texto: string) => {
	const destino = campo.value;
	if (!destino) return;

	const desde = destino.selectionStart ?? destino.value.length;
	const hasta = destino.selectionEnd ?? destino.value.length;

	destino.focus();
	destino.setRangeText(texto, desde, hasta, 'end');
	destino.dispatchEvent(new Event('input', { bubbles: true }));
};

const copiar = async () => {
	try {
		await navigator.clipboard.writeText(seleccion.value);
	} catch (error) {
		console.warn('No se pudo copiar al portapapeles:', error);
	}
};

const acciones = {
	async copiar() {
		await copiar();
		cerrar();
	},
	async cortar() {
		await copiar();
		insertar('');
		cerrar();
	},
	async pegar() {
		try {
			insertar(await navigator.clipboard.readText());
		} catch (error) {
			console.warn('No se pudo leer el portapapeles:', error);
		}
		cerrar();
	},
	seleccionarTodo() {
		campo.value?.select();
		cerrar();
	},
};

const alTeclado = (evento: KeyboardEvent) => {
	if (evento.key === 'Escape') cerrar();
};

onMounted(() => {
	// En captura, igual que la supresión del menú nativo, y antes que cualquier
	// elemento de la página.
	document.addEventListener('contextmenu', abrir, { capture: true });
	document.addEventListener('keydown', alTeclado);
	window.addEventListener('blur', cerrar);
	window.addEventListener('resize', cerrar);
});

onBeforeUnmount(() => {
	document.removeEventListener('contextmenu', abrir, { capture: true });
	document.removeEventListener('keydown', alTeclado);
	window.removeEventListener('blur', cerrar);
	window.removeEventListener('resize', cerrar);
});
</script>

<template>
	<!-- La capa que cierra al hacer clic afuera: cubre todo, incluido el propio
	     menú, que está por encima. -->
	<div v-if="abierto" class="fixed inset-0 z-50" @pointerdown="cerrar" @contextmenu.prevent="cerrar">
		<div
			class="absolute flex flex-col gap-0.5 rounded-corner border border-ui-border bg-ui-bg/95 p-1 shadow-2xl backdrop-blur-md"
			:style="{ left: `${x}px`, top: `${y}px`, width: `${ANCHO}px` }"
			@pointerdown.stop
		>
			<button
				v-if="puedeCopiar"
				type="button"
				class="rounded-corner px-3 py-1.5 text-left text-sm text-tx-primary hover:bg-primary hover:text-tx-on-primary"
				@click="acciones.copiar()"
			>
				{{ t('textMenu.copy') }}
			</button>
			<button
				v-if="puedeCopiar && editable"
				type="button"
				class="rounded-corner px-3 py-1.5 text-left text-sm text-tx-primary hover:bg-primary hover:text-tx-on-primary"
				@click="acciones.cortar()"
			>
				{{ t('textMenu.cut') }}
			</button>
			<button
				v-if="editable"
				type="button"
				class="rounded-corner px-3 py-1.5 text-left text-sm text-tx-primary hover:bg-primary hover:text-tx-on-primary"
				@click="acciones.pegar()"
			>
				{{ t('textMenu.paste') }}
			</button>
			<button
				v-if="campo"
				type="button"
				class="rounded-corner px-3 py-1.5 text-left text-sm text-tx-primary hover:bg-primary hover:text-tx-on-primary"
				@click="acciones.seleccionarTodo()"
			>
				{{ t('textMenu.selectAll') }}
			</button>
		</div>
	</div>
</template>
