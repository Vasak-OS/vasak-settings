<script lang="ts" setup>
/**
 * El aspecto del menú de inicio del escritorio.
 *
 * Edita la sección `menu` de `vasak.conf`: la variante de esqueleto y sus
 * opciones. El escritorio (`vasak-desktop`) lee las mismas claves para armar el
 * menú — el contrato está en `menu-variants-spec.md` y se lee/escribe con los
 * ayudantes de `config-values.ts`, que validan el tipo porque el archivo se
 * puede editar a mano.
 *
 * Al guardar se conserva el resto de la sección (`{ ...config.menu, ...nuevo }`):
 * los favoritos se fijan desde el menú contextual de cada aplicación, no desde
 * acá, y reemplazar la sección entera los borraría.
 *
 * Una vista previa dibuja el esqueleto elegido —una ilustración, no el menú en
 * vivo— para que se vea el efecto de cada control.
 */
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
	readConfig,
	useConfigStore,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	ConfigSection,
	EmptyState,
	PageHeader,
	SegmentedControl,
	type SegmentedOption,
	SelectField,
	type SelectOption,
	SettingRow,
	SliderControl,
	SwitchRow,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, type Ref, ref } from 'vue';
import StartMenuPreview from '@/components/startmenu/StartMenuPreview.vue';
import {
	DEFAULT_HEADER_STRENGTH,
	DEFAULT_MENU_SEARCH_POSITION,
	DEFAULT_MENU_VARIANT,
	DEFAULT_MENU_WIDGET,
	MAX_HEADER_STRENGTH,
	MENU_SEARCH_POSITIONS,
	MENU_VARIANTS,
	MENU_WIDGETS,
	type MenuSearchPosition,
	type MenuSettings,
	type MenuVariant,
	type MenuWidget,
	MIN_HEADER_STRENGTH,
	readMenuSettings,
	writeMenuSettings,
} from '@/utils/config-values';

const { t } = useI18n();

const configStore = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const vskConfig: Ref<VSKConfig | null> = ref(null);

/**
 * El estado de la pantalla, con los valores de fábrica hasta que se lee el
 * archivo. Son los mismos que el escritorio toma cuando una clave falta.
 */
const settings = ref<MenuSettings>({
	variant: DEFAULT_MENU_VARIANT,
	widget: DEFAULT_MENU_WIDGET,
	showUser: true,
	showSessionActions: true,
	searchPosition: DEFAULT_MENU_SEARCH_POSITION,
	showPlaces: false,
	showFavorites: false,
	header: 'none',
	headerImage: '',
	headerStrength: DEFAULT_HEADER_STRENGTH,
	showGreeting: true,
	showWeather: true,
	favorites: [],
});

/** El hero muestra sus opciones sólo cuando está encendido. */
const heroOn = computed({
	get: () => settings.value.header === 'hero',
	set: (on: boolean) => {
		settings.value.header = on ? 'hero' : 'none';
	},
});

/** El nombre de archivo de la imagen del hero, para mostrarlo sin la ruta entera. */
const headerImageName = computed(() => {
	const path = settings.value.headerImage;
	return path ? (path.split('/').pop() ?? path) : '';
});

const variantOptions = computed<SegmentedOption<MenuVariant>[]>(() =>
	MENU_VARIANTS.map((value) => ({ value, label: t(`views.startMenu.variants.${value}`) }))
);

const searchPositionOptions = computed<SegmentedOption<MenuSearchPosition>[]>(() =>
	MENU_SEARCH_POSITIONS.map((value) => ({
		value,
		label: t(`views.startMenu.searchPositions.${value}`),
	}))
);

const widgetOptions = computed<SelectOption<MenuWidget>[]>(() =>
	MENU_WIDGETS.map((value) => ({ value, label: t(`views.startMenu.widgets.${value}`) }))
);

/** El nombre de la variante elegida, para anunciar la vista previa. */
const variantLabel = computed(() => t(`views.startMenu.variants.${settings.value.variant}`));

onMounted(async () => {
	try {
		configStore.value = useConfigStore();

		await configStore.value.loadConfig();
		vskConfig.value = await readConfig();

		settings.value = readMenuSettings(vskConfig.value);
	} catch (err) {
		error.value = t('views.startMenu.errorLoading').replace('{0}', String(err));
	} finally {
		loading.value = false;
	}
});

const pickHeaderImage = async () => {
	try {
		const picked = await openDialog({
			multiple: false,
			directory: false,
			title: t('views.startMenu.headerImagePick'),
			filters: [
				{
					name: t('views.startMenu.imageFilter'),
					extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'],
				},
			],
		});
		if (typeof picked === 'string') settings.value.headerImage = picked;
	} catch (err) {
		// No se guardó nada: el error es del selector, no del guardado.
		error.value = t('views.startMenu.headerImageError').replace('{0}', String(err));
	}
};

const clearHeaderImage = () => {
	settings.value.headerImage = '';
};

const saveConfig = async () => {
	saving.value = true;
	error.value = '';
	successMessage.value = '';

	try {
		// Se relee la configuración justo antes de escribir, en vez de guardar la
		// que se cargó al abrir. Entre medio pudieron cambiar claves que esta
		// pantalla no edita —sobre todo `menu.favorites`, que se fija y desfija
		// desde el menú contextual de cada aplicación—, y `writeConfig` escribe el
		// objeto tal cual, sin releer ni fusionar el archivo: guardar la copia vieja
		// las pisaría. `writeMenuSettings` conserva esas claves sobre la copia fresca.
		const latest = await readConfig();
		if (!latest) throw new Error('configuración no disponible');

		writeMenuSettings(latest as unknown as Record<string, unknown>, settings.value);
		await writeConfig(latest);
		vskConfig.value = latest;

		// El escritorio recarga la configuración al recibir `config-changed`, que
		// emite el propio plugin: el menú se arma de nuevo sin reiniciar la sesión.
		successMessage.value = t('views.startMenu.saved');
		setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (err) {
		error.value = t('views.startMenu.errorSaving').replace('{0}', String(err));
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
			:title="t('views.startMenu.title')"
			:description="t('views.startMenu.description')"
		>
			<template #actions>
				<button
					v-if="!loading"
					type="button"
					class="w-fit rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="saving"
					@click="saveConfig"
				>
					{{ saving ? t('common.saving') : t('views.startMenu.applyChanges') }}
				</button>
			</template>
		</PageHeader>

		<EmptyState icon="" size="sm" bordered v-if="loading" :title="t('views.startMenu.loading')" />

		<div v-else class="@container flex flex-col gap-4 pb-4">
			<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>

			<AlertMessage v-if="successMessage" tone="success">{{ successMessage }}</AlertMessage>

			<!-- En angosto todo queda en una columna; al ensancharse el contenedor,
			     la vista previa pasa al costado y se queda fija mientras se tocan los
			     controles. Es consulta de contenedor y no de pantalla: el componente
			     no sabe en qué ventana está (WebKitGTK no avisa del cambio de ancho). -->
			<div class="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_17rem] @xl:items-start">
				<div class="order-2 flex min-w-0 flex-col gap-4 @xl:order-1">
					<ConfigSection :title="t('views.startMenu.variant')" :description="t('views.startMenu.variantHint')">
						<SegmentedControl
							:model-value="settings.variant"
							variant="chips"
							:label="t('views.startMenu.variant')"
							:options="variantOptions"
							@update:model-value="(value) => { if (value) settings.variant = value; }"
						/>
					</ConfigSection>

					<ConfigSection :title="t('views.startMenu.content')">
						<div class="flex flex-col gap-4">
							<SettingRow
								:label="t('views.startMenu.widget')"
								:description="t('views.startMenu.widgetHint')"
								control-id="start-menu-widget"
							>
								<SelectField
									id="start-menu-widget"
									v-model="settings.widget"
									:options="widgetOptions"
									class="w-full @2xs:w-56"
								/>
							</SettingRow>

							<SwitchRow
								v-model="settings.showUser"
								:label="t('views.startMenu.showUser')"
								:description="t('views.startMenu.showUserHint')"
							/>
							<SwitchRow
								v-model="settings.showSessionActions"
								:label="t('views.startMenu.showSessionActions')"
								:description="t('views.startMenu.showSessionActionsHint')"
							/>
							<SwitchRow
								v-model="settings.showPlaces"
								:label="t('views.startMenu.showPlaces')"
								:description="t('views.startMenu.showPlacesHint')"
							/>
							<SwitchRow
								v-model="settings.showFavorites"
								:label="t('views.startMenu.showFavorites')"
								:description="t('views.startMenu.showFavoritesHint')"
							/>

							<SettingRow
								:label="t('views.startMenu.searchPosition')"
								:description="t('views.startMenu.searchPositionHint')"
							>
								<SegmentedControl
									:model-value="settings.searchPosition"
									:label="t('views.startMenu.searchPosition')"
									:options="searchPositionOptions"
									@update:model-value="(value) => { if (value) settings.searchPosition = value; }"
								/>
							</SettingRow>
						</div>
					</ConfigSection>

					<ConfigSection :title="t('views.startMenu.header')" :description="t('views.startMenu.headerHint')">
						<div class="flex flex-col gap-4">
							<SwitchRow
								v-model="heroOn"
								:label="t('views.startMenu.hero')"
								:description="t('views.startMenu.heroHint')"
							/>

							<template v-if="heroOn">
								<SettingRow
									:label="t('views.startMenu.headerImage')"
									:description="t('views.startMenu.headerImageHint')"
								>
									<div class="flex min-w-0 items-center gap-2">
										<span v-if="headerImageName" class="min-w-0 flex-1 truncate text-sm text-tx-muted">
											{{ headerImageName }}
										</span>
										<span v-else class="min-w-0 flex-1 truncate text-sm text-tx-muted">
											{{ t('views.startMenu.headerImageNone') }}
										</span>
										<button
											type="button"
											class="shrink-0 rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-sm font-medium hover:bg-ui-surface"
											@click="pickHeaderImage"
										>
											{{ t('views.startMenu.headerImageChoose') }}
										</button>
										<button
											v-if="headerImageName"
											type="button"
											class="shrink-0 rounded-corner-m border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-sm font-medium hover:bg-ui-surface"
											@click="clearHeaderImage"
										>
											{{ t('common.clear') }}
										</button>
									</div>
								</SettingRow>

								<SliderControl
									v-model="settings.headerStrength"
									:label="t('views.startMenu.headerStrength')"
									:min="MIN_HEADER_STRENGTH"
									:max="MAX_HEADER_STRENGTH"
									:show-button="false"
								/>

								<SwitchRow
									v-model="settings.showGreeting"
									:label="t('views.startMenu.showGreeting')"
									:description="t('views.startMenu.showGreetingHint')"
								/>
								<SwitchRow
									v-model="settings.showWeather"
									:label="t('views.startMenu.showWeather')"
									:description="t('views.startMenu.showWeatherHint')"
								/>
							</template>
						</div>
					</ConfigSection>
				</div>

				<div class="order-1 @xl:order-2 @xl:sticky @xl:top-0">
					<ConfigSection :title="t('views.startMenu.preview')">
						<StartMenuPreview
							:variant="settings.variant"
							:widget="settings.widget"
							:show-user="settings.showUser"
							:show-session-actions="settings.showSessionActions"
							:search-position="settings.searchPosition"
							:show-places="settings.showPlaces"
							:show-favorites="settings.showFavorites"
							:hero="heroOn"
							:label="variantLabel"
						/>
					</ConfigSection>
				</div>
			</div>
		</div>
	</div>
</template>
