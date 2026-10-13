<script lang="ts" setup>
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	AlertMessage,
	ConfigSection,
	EmptyState,
	PageHeader,
	SearchSelect,
	SelectField,
	SortableList,
	SwitchToggle,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, type Ref, ref } from 'vue';
import AppIcon from '@/components/permissions/AppIcon.vue';
import { listInstalledApps } from '@/services/installed-apps.service';
import {
	hasPanelPinned,
	PANEL_ANIMATIONS,
	PANEL_LAYOUTS,
	PANEL_POSITIONS,
	PANEL_STYLES,
	type PanelAnimation,
	type PanelLayout,
	type PanelPosition,
	type PanelStyle,
	type PinnedApp,
	readPanelAnimation,
	readPanelAutohide,
	readPanelIndicators,
	readPanelLayout,
	readPanelPinned,
	readPanelPosition,
	readPanelStyle,
	writePanelAppearance,
	writePanelIndicators,
	writePanelPinned,
	writePanelPosition,
} from '@/utils/config-values';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);

/**
 * Todo arranca encendido.
 *
 * La sección `panel` no existe en la configuración hasta que alguien apaga
 * algo, así que la ausencia de una clave significa «mostralo». El escritorio lee
 * exactamente con este criterio (`!== false`), y si acá se leyera al revés, el
 * panel y esta pantalla se contradirían en cada instalación nueva.
 */
const weather = ref(true);
const music = ref(true);
const transfer = ref(true);
const tray = ref(true);
const privacy = ref(true);

/**
 * Los indicadores que se sumaron con el panel configurable. `workspaces` y
 * `windows` son píldoras enteras; `networkName`, `volumeNumber` y
 * `batteryNumber` son el detalle que cada indicador muestra de más. Todos
 * arrancan encendidos, con el mismo criterio que los de arriba.
 */
const workspaces = ref(true);
const windows = ref(true);
const networkName = ref(true);
const volumeNumber = ref(true);
const batteryNumber = ref(true);

/**
 * De qué lado queda la barra.
 *
 * Arriba por omisión, que es donde estuvo siempre. El escritorio la reancla y
 * reacomoda lo de adentro al recibir `config-changed`, así que moverla no pide
 * reiniciar la sesión.
 */
const position = ref<PanelPosition>('top');

/**
 * El aspecto de la barra: su tipo, su densidad y su animación. Son las claves
 * que el escritorio lee en `panel-appearance.ts`; acá se leen y se escriben con
 * los mismos valores y los mismos de fábrica. Al guardar, el panel se reacomoda
 * solo con `config-changed`, sin reiniciar la sesión.
 */
const style = ref<PanelStyle>('pills');
const layout = ref<PanelLayout>('distributed');
const animation = ref<PanelAnimation>('off');

/**
 * Si el panel se esconde solo y se revela al rozar el borde. Apagado por
 * omisión. El escritorio deja de reservar su franja —las ventanas la ocupan— y
 * lo esconde; es sólo apariencia/conducta, no pide reiniciar.
 */
const autohide = ref(false);

/**
 * Las aplicaciones ancladas y las que se pueden anclar.
 *
 * `pinned` arranca con lo que diga `panel.pinned` —o los dos de siempre si la
 * clave no existe— y `installedApps` con todo lo instalado, que es de donde se
 * agregan. Cada anclado se refresca contra la lista instalada por su
 * identificador: así los dos de fábrica salen con el nombre en el idioma de la
 * sesión y el icono del tema, y no con los de respaldo que trae `DEFAULT_PINNED`.
 */
const installedApps = ref<PinnedApp[]>([]);
const pinned = ref<PinnedApp[]>([]);
const addSelection = ref('');

/**
 * Si la persona tocó los anclados en esta pantalla, y si la configuración ya
 * traía una lista propia. Con cualquiera de las dos se escribe `panel.pinned`;
 * sin ninguna, no se toca: guardar sólo un indicador no debe materializar los
 * dos de fábrica como lista fija, porque eso congela al usuario en los defaults
 * de hoy y le tapa cualquier cambio futuro de los predeterminados del escritorio
 * (y, si `listInstalledApps` falló, guardaría los nombres de respaldo).
 */
const pinsTouched = ref(false);
const pinnedExisted = ref(false);

/** Un anclado con el nombre, el icono y la ejecución frescos, si está instalado. */
function refreshed(app: PinnedApp): PinnedApp {
	const found = installedApps.value.find((a) => a.id === app.id);
	return found ? { ...found } : { ...app };
}

/** Lo que todavía se puede agregar: lo instalado que no esté ya anclado. */
const addableApps = computed(() =>
	installedApps.value.filter((app) => !pinned.value.some((p) => p.id === app.id))
);

/** Las opciones del selector de agregar, ordenadas por nombre. */
const addOptions = computed(() =>
	[...addableApps.value]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((app) => ({ valor: app.id, etiqueta: app.name, detalle: app.exec }))
);

/**
 * Las opciones de cada desplegable, como `{ value, label }`.
 *
 * Desde vue-libvasak 2.19.0 `SelectField` es un listbox propio que recibe las
 * opciones por propiedad y ya no por una ranura de `<option>`: van calculadas
 * acá para que la etiqueta siga el idioma de la sesión.
 */
const positionOptions = computed(() =>
	PANEL_POSITIONS.map((side) => ({ value: side, label: t(`views.appearancePanel.lados.${side}`) }))
);
const styleOptions = computed(() =>
	PANEL_STYLES.map((name) => ({ value: name, label: t(`views.appearancePanel.styles.${name}`) }))
);
const layoutOptions = computed(() =>
	PANEL_LAYOUTS.map((name) => ({ value: name, label: t(`views.appearancePanel.layouts.${name}`) }))
);
const animationOptions = computed(() =>
	PANEL_ANIMATIONS.map((name) => ({
		value: name,
		label: t(`views.appearancePanel.animations.${name}`),
	}))
);

function addApp(id: string) {
	if (!id) return;
	const app = installedApps.value.find((a) => a.id === id);
	if (!app || pinned.value.some((p) => p.id === id)) return;
	pinned.value.push({ ...app });
	pinsTouched.value = true;
	// El selector se devuelve a vacío: queda listo para elegir la siguiente, y
	// no muestra una elegida que ya salió de la lista.
	addSelection.value = '';
}

function removeApp(index: number) {
	pinned.value.splice(index, 1);
	pinsTouched.value = true;
}

/**
 * El nuevo orden que emite `SortableList` al arrastrar una fila.
 *
 * Reemplaza los botones de subir y bajar: el componente de la librería ya trae
 * el asa y el arrastre, y entrega la lista reordenada por `v-model`. Se marca
 * tocado para que el guardado materialice `panel.pinned` (ver `pinsTouched`).
 */
function reorderPinned(items: PinnedApp[]) {
	pinned.value = items;
	pinsTouched.value = true;
}

/**
 * Cómo identifica `SortableList` cada anclado: por el id del `.desktop`, que es
 * único. Va como función y no como nombre de campo porque el componente valida
 * `itemKey` como `Function` en ejecución.
 */
const pinnedKey = (app: PinnedApp) => app.id;

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		const indicators = readPanelIndicators(vskConfig.value);
		weather.value = indicators.weather;
		music.value = indicators.music;
		transfer.value = indicators.transfer;
		tray.value = indicators.tray;
		privacy.value = indicators.privacy;
		workspaces.value = indicators.workspaces;
		windows.value = indicators.windows;
		networkName.value = indicators.networkName;
		volumeNumber.value = indicators.volumeNumber;
		batteryNumber.value = indicators.batteryNumber;
		position.value = readPanelPosition(vskConfig.value);
		style.value = readPanelStyle(vskConfig.value);
		layout.value = readPanelLayout(vskConfig.value);
		animation.value = readPanelAnimation(vskConfig.value);
		autohide.value = readPanelAutohide(vskConfig.value);

		// Un tropiezo del backend no debe dejar la pantalla en blanco: sin la
		// lista instalada, los anclados se siguen leyendo y editando con lo que
		// hay guardado, sólo que no se refrescan ni se pueden agregar nuevos.
		try {
			installedApps.value = await listInstalledApps();
		} catch (err) {
			console.error(err);
			installedApps.value = [];
		}
		pinnedExisted.value = hasPanelPinned(vskConfig.value);
		pinned.value = readPanelPinned(vskConfig.value).map(refreshed);
	} catch (err) {
		error.value = t('views.appearancePanel.errorLoading').replace('{0}', String(err));
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

		writePanelIndicators(vskConfig.value as any, {
			weather: weather.value,
			music: music.value,
			transfer: transfer.value,
			tray: tray.value,
			privacy: privacy.value,
			workspaces: workspaces.value,
			windows: windows.value,
			networkName: networkName.value,
			volumeNumber: volumeNumber.value,
			batteryNumber: batteryNumber.value,
		});

		writePanelPosition(vskConfig.value as unknown as Record<string, unknown>, position.value);

		writePanelAppearance(vskConfig.value as unknown as Record<string, unknown>, {
			style: style.value,
			layout: layout.value,
			animation: animation.value,
			autohide: autohide.value,
		});

		// Sólo se escribe `panel.pinned` si la persona tocó los anclados acá, o si
		// la configuración ya traía su propia lista. Guardar un indicador suelto no
		// debe materializar los dos de fábrica como lista fija: eso haría que el
		// escritorio dejara de usar sus predeterminados para esta cuenta, y le
		// taparía cualquier cambio futuro de ellos (ver `hasPanelPinned`).
		if (pinsTouched.value || pinnedExisted.value) {
			writePanelPinned(vskConfig.value as unknown as Record<string, unknown>, pinned.value);
			// Ya existe en el archivo: los guardados siguientes la mantienen al día.
			pinnedExisted.value = true;
			pinsTouched.value = false;
		}

		await writeConfig(vskConfig.value);

		// El escritorio recarga la configuración al recibir `config-changed`, que
		// emite el propio plugin: el panel se acomoda sin reiniciar la sesión.
		successMessage.value = t('views.appearancePanel.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.appearancePanel.errorSaving').replace('{0}', String(err));
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.appearance')"
			:title="t('views.appearancePanel.title')"
			:description="t('views.appearancePanel.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.appearancePanel.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.appearancePanel.loading')" />

		<div v-else class="flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>

			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<ConfigSection :title="t('views.appearancePanel.bar')">

				<div class="flex items-start justify-between gap-4">
					<!-- Sólo la explicación: el nombre del control lo dice el `label`
					     del propio desplegable, y repetirlo acá lo escribe dos veces
					     una al lado de la otra. -->
					<p class="text-xs text-tx-muted">
						{{ t('views.appearancePanel.positionHint') }}
					</p>
					<!-- La etiqueta va **dentro** del componente: un `<label>` suelto
					     al lado no está asociado a nada, y un lector de pantalla
					     anuncia un desplegable sin nombre. -->
					<SelectField
						v-model="position"
						:label="t('views.appearancePanel.position')"
						:options="positionOptions"
						class="w-60 shrink-0"
					/>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearancePanel.appearance')">
				<div class="flex flex-col gap-5">
					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.styleHint') }}
						</p>
						<SelectField
							v-model="style"
							:label="t('views.appearancePanel.style')"
							:options="styleOptions"
							class="w-60 shrink-0"
						/>
					</div>

					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.layoutHint') }}
						</p>
						<SelectField
							v-model="layout"
							:label="t('views.appearancePanel.layout')"
							:options="layoutOptions"
							class="w-60 shrink-0"
						/>
					</div>

					<div class="flex items-start justify-between gap-4">
						<p class="text-xs text-tx-muted">
							{{ t('views.appearancePanel.animationHint') }}
						</p>
						<SelectField
							v-model="animation"
							:label="t('views.appearancePanel.animation')"
							:options="animationOptions"
							class="w-60 shrink-0"
						/>
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.autohide') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.autohideHint') }}
							</span>
						</div>
						<SwitchToggle
							:label="t('views.appearancePanel.autohide')"
							:model-value="autohide"
							@update:model-value="(val) => (autohide = val)"
						/>
					</div>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearancePanel.indicators')">

				<div class="flex flex-col gap-5">
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.workspaces') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.workspacesHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.workspaces')" :model-value="workspaces" @update:model-value="(val) => (workspaces = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.windows') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.windowsHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.windows')" :model-value="windows" @update:model-value="(val) => (windows = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.weather') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.weatherHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.weather')" :model-value="weather" @update:model-value="(val) => (weather = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.music') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.musicHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.music')" :model-value="music" @update:model-value="(val) => (music = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.transfer') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.transferHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.transfer')" :model-value="transfer" @update:model-value="(val) => (transfer = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.networkName') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.networkNameHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.networkName')" :model-value="networkName" @update:model-value="(val) => (networkName = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.volumeNumber') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.volumeNumberHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.volumeNumber')" :model-value="volumeNumber" @update:model-value="(val) => (volumeNumber = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.batteryNumber') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.batteryNumberHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.batteryNumber')" :model-value="batteryNumber" @update:model-value="(val) => (batteryNumber = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.tray') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.trayHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.tray')" :model-value="tray" @update:model-value="(val) => (tray = val)" />
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-tx-main">
								{{ t('views.appearancePanel.privacy') }}
							</span>
							<span class="text-xs text-tx-muted">
								{{ t('views.appearancePanel.privacyHint') }}
							</span>
						</div>
						<SwitchToggle :label="t('views.appearancePanel.privacy')" :model-value="privacy" @update:model-value="(val) => (privacy = val)" />
					</div>
				</div>
			</ConfigSection>

			<ConfigSection :title="t('views.appearancePanel.pinned')">
				<div class="flex flex-col gap-4">
					<p class="text-xs text-tx-muted">
						{{ t('views.appearancePanel.pinnedHint') }}
					</p>

					<!-- La lista de anclados. El asa y el arrastre los pone
					     `SortableList`; cada fila es icono + nombre + el botón de
					     quitar. Reordenar llega por `v-model`. -->
					<SortableList
						v-if="pinned.length"
						:model-value="pinned"
						:item-key="pinnedKey"
						:label="t('views.appearancePanel.pinned')"
						:handle-label="t('views.appearancePanel.pinnedReorder')"
						@update:model-value="reorderPinned"
					>
						<template #item="{ item }">
							<div class="flex min-w-0 flex-1 items-center gap-3">
								<AppIcon :name="item.icon" />
								<span class="min-w-0 flex-1 truncate text-sm font-medium text-tx-main">
									{{ item.name }}
								</span>
								<ActionButton
									variant="danger"
									size="sm"
									icon="list-remove"
									:label="t('views.appearancePanel.pinnedRemove').replace('{0}', item.name)"
									:title="t('views.appearancePanel.pinnedRemove').replace('{0}', item.name)"
									@click="removeApp(pinned.indexOf(item))"
								/>
							</div>
						</template>
					</SortableList>

					<!-- Sin anclados la lista no se dibuja vacía: se dice que no hay
					     ninguno, que se lee mejor que una caja en blanco. -->
					<EmptyState
						v-else
						icon=""
						size="sm"
						bordered
						:title="t('views.appearancePanel.pinnedEmpty')"
					/>

					<!-- Agregar: elige una de las instaladas que todavía no esté
					     anclada. El menú se abre hacia arriba porque el control vive
					     al pie de la sección. -->
					<SearchSelect
						:model-value="addSelection"
						:options="addOptions"
						up
						:label="t('views.appearancePanel.pinnedAdd')"
						:placeholder="t('views.appearancePanel.pinnedAdd')"
						:search-placeholder="t('views.appearancePanel.pinnedSearch')"
						:empty-text="t('views.appearancePanel.pinnedNoApps')"
						@update:model-value="addApp"
					/>
				</div>
			</ConfigSection>
		</div>
	</div>
</template>
