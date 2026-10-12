<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	DeviceCard,
	EmptyState,
	LoadingState,
	PageHeader,
	Panel,
	SwitchToggle,
} from '@vasakgroup/vue-libvasak';
import { onMounted } from 'vue';
import { bluetoothApi, useBluetooth } from '@/composables/useBluetooth';
import { deviceCardProps } from '@/utils/bluetooth-device-card';

const { t } = useI18n();

// Toda la lógica —adaptador, listas y el escaneo abierto— vive en el
// composable, que recibe sus dependencias por parámetro para poder probarse
// sin montar la vista. El armado de cada fila (de un dispositivo de BlueZ a las
// propiedades de `DeviceCard`) sigue en `@/utils/bluetooth-device-card`.
const {
	connectedDevices,
	availableDevices,
	loading,
	isTogglingBluetooth,
	isScanning,
	error,
	isBluetoothOn,
	start,
	toggleBT,
	startScanning,
	stopScanning,
	connect,
	disconnect,
} = useBluetooth({ ...bluetoothApi, t });

onMounted(() => {
	void start();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.network')"
			:title="t('views.networkBluetooth.title')"
			:description="t('views.networkBluetooth.description')"
		>
			<template #actions>
				<div class="flex items-center gap-3 rounded-corner-m border border-ui-border bg-ui-surface/60 px-4 py-2">
					<span class="text-sm font-medium">{{ isBluetoothOn ? t('views.networkBluetooth.on') : t('views.networkBluetooth.off') }}</span>
					<SwitchToggle :label="t('views.networkBluetooth.title')"
						:model-value="isBluetoothOn"
						:disabled="isTogglingBluetooth"
						@update:model-value="toggleBT"
					/>
				</div>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>

		<!-- Estado Apagado -->
		<div v-if="!isBluetoothOn && !loading && !isTogglingBluetooth" class="grid flex-1 place-items-center rounded-corner-m border border-dashed border-ui-border bg-ui-surface/20 p-6">
			<div class="text-center text-tx-muted">
				<div class="mx-auto mb-3 h-12 w-12 rounded-full bg-ui-surface flex items-center justify-center border border-ui-border">
					<svg class="h-6 w-6 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
				</div>
				<p class="text-base font-medium text-tx-main">{{ t('views.networkBluetooth.offTitle') }}</p>
				<p class="text-sm mt-1">{{ t('views.networkBluetooth.offHint') }}</p>
			</div>
		</div>

		<!-- Estado Cargando -->
		<EmptyState icon="" size="sm" bordered v-else-if="loading || isTogglingBluetooth" :title="t('views.networkBluetooth.syncing')" />

		<!-- Estado Listando Dispositivos -->
		<template v-else>
			<div class="grid gap-4 xl:grid-cols-2">
				<!-- Conectados -->
				<Panel as="article">
					<h3 class="mb-4 text-lg font-medium text-tx-main flex items-center justify-between">
						{{ t('views.networkBluetooth.connectedDevices') }}
						<span class="text-xs text-tx-muted rounded bg-ui-surface/50 px-2 py-0.5 border border-ui-border">
							{{ connectedDevices.length }}
						</span>
					</h3>
					
					<EmptyState icon="" size="sm" bordered v-if="connectedDevices.length === 0" :title="t('views.networkBluetooth.emptyConnected')" />
					
					<ul v-else class="flex flex-col gap-1">
						<li v-for="dev in connectedDevices" :key="dev.path">
							<DeviceCard
								v-bind="deviceCardProps(dev, t)"
								:action-label="t('views.networkBluetooth.disconnect')"
								action-kind="destructive"
								is-connected
								show-status-indicator
								@action="disconnect(dev)"
							/>
						</li>
					</ul>
				</Panel>

				<!-- Disponibles -->
				<Panel as="article">
					<div class="mb-4 flex items-center justify-between gap-3">
						<h3 class="min-w-0 truncate text-lg font-medium text-tx-main">{{ t('views.networkBluetooth.availableDevices') }}</h3>

						<!-- El botón alterna: arranca el escaneo abierto y, mientras busca,
						     lo detiene. Nunca se corta por un cronómetro. -->
						<button
							class="flex shrink-0 cursor-pointer items-center justify-center rounded-corner-m border border-transparent p-1.5 transition-colors hover:border-ui-border hover:bg-ui-surface"
							@click="isScanning ? stopScanning() : startScanning()"
							:title="isScanning ? t('views.networkBluetooth.stopScanTooltip') : t('views.networkBluetooth.scanTooltip')"
							:aria-label="isScanning ? t('views.networkBluetooth.stopScanTooltip') : t('views.networkBluetooth.scanTooltip')">
							<svg class="h-4 w-4 text-tx-muted" :class="{ 'animate-spin text-primary': isScanning }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>

					<!-- Mientras el escaneo está abierto: el indicador queda arriba de la
					     lista para que se vea que sigue buscando aunque ya haya algo. -->
					<LoadingState
						v-if="isScanning"
						size="sm"
						bordered
						:label="t('views.networkBluetooth.scanning')"
						class="mb-3"
					/>

					<EmptyState icon="" size="sm" bordered v-if="!isScanning && availableDevices.length === 0" :title="t('views.networkBluetooth.emptyAvailable')" />

					<ul v-if="availableDevices.length > 0" class="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-1">
						<li v-for="dev in availableDevices" :key="dev.path">
							<DeviceCard
								v-bind="deviceCardProps(dev, t)"
								:action-label="t('views.networkBluetooth.connect')"
								@action="connect(dev)"
							/>
						</li>
					</ul>
				</Panel>
			</div>
		</template>
	</div>
</template>
