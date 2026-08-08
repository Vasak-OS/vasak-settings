<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import ProfileIcon from '@/components/ui/ProfileIcon.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useBattery, usePowerProfiles } from '@/composables/useBattery';
import { useReactiveIcon } from '@/composables/useReactiveIcon';

interface IdleConfig {
	enabled: boolean;
	available: boolean;
	can_screen_off: boolean;
	lock_enabled: boolean;
	lock_minutes: number;
	screen_off_enabled: boolean;
	screen_off_minutes: number;
	lock_before_sleep: boolean;
	legacy_found: boolean;
}

const idle = ref<IdleConfig | null>(null);
const idleError = ref('');
const idleSaved = ref(false);
const savingIdle = ref(false);

async function loadIdle() {
	try {
		idle.value = await invoke<IdleConfig>('get_idle_config');
		idleError.value = '';
	} catch (err) {
		idleError.value = String(err);
	}
}

async function saveIdle() {
	if (!idle.value) return;

	savingIdle.value = true;
	idleError.value = '';

	try {
		idle.value = await invoke<IdleConfig>('set_idle_config', { config: idle.value });
		idleSaved.value = true;
		setTimeout(() => {
			idleSaved.value = false;
		}, 3000);
	} catch (err) {
		idleError.value = String(err);
		await loadIdle();
	} finally {
		savingIdle.value = false;
	}
}

function toggleIdle(value: boolean) {
	if (!idle.value) return;
	idle.value.enabled = value;
	void saveIdle();
}

const { info, error, start: startPolling } = useBattery(5000);
const {
	profiles,
	active,
	loading: profilesLoading,
	error: profilesError,
	load: loadProfiles,
	setActive,
} = usePowerProfiles();

const [batteryIcon] = useReactiveIcon(() => {
	if (!info.value.has_battery) return 'battery';
	const s = info.value.status;
	if (s === 'Charging') return 'battery-charging';
	if (s === 'FullyCharged') return 'battery-full';
	if (s === 'Discharging')
		return info.value.percentage > 50
			? 'battery-good'
			: info.value.percentage > 20
				? 'battery-low'
				: 'battery-caution';
	return 'battery';
});

onMounted(() => {
	startPolling();
	loadProfiles();
	loadIdle();
});

function formatTime(seconds: number): string {
	if (seconds <= 0) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

function getStatusColor(status: string): string {
	switch (status) {
		case 'Charging':
			return 'text-status-success';
		case 'Discharging':
			return 'text-tx-primary';
		case 'FullyCharged':
			return 'text-status-success';
		case 'Empty':
			return 'text-status-error';
		default:
			return 'text-tx-muted';
	}
}

function label(profile: string): string {
	switch (profile) {
		case 'performance':
			return 'Rendimiento';
		case 'balanced':
			return 'Balanceado';
		case 'power-saver':
			return 'Ahorro de energía';
		default:
			return profile;
	}
}

async function selectProfile(profile: string) {
	try {
		await setActive(profile);
	} catch {
		// setActive sets profilesError ref before throwing — alert is already shown via <AlertMessage v-if="profilesError">
	}
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Sistema"
			title="Energía"
			description="Estado de la batería y perfiles de energía."
		/>

		<AlertMessage v-if="error" :message="error" tone="error" />

		<!-- Battery info -->
		<SectionCard>
			<div class="flex items-start gap-3">
				<img v-if="batteryIcon" :src="batteryIcon" class="mt-0.5 h-10 w-10 shrink-0" />
				<div class="flex-1">
					<h3 class="text-base font-medium">Batería</h3>
					<p v-if="!info.has_battery" class="mt-2 text-sm text-tx-muted">
						No se detectó una batería en este equipo.
					</p>

					<template v-if="info.has_battery">
						<div class="mt-3 flex items-baseline gap-2">
							<span class="text-3xl font-bold">{{ Math.round(info.percentage) }}<span class="text-lg font-normal">%</span></span>
							<span class="text-sm font-medium" :class="getStatusColor(info.status)">{{ info.status }}</span>
						</div>

						<!-- Health bar -->
						<div class="mt-4">
							<div class="flex justify-between text-xs text-tx-muted mb-1">
								<span>Salud de la batería</span>
								<span>{{ Math.round(info.health) }}%</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-ui-surface">
								<div
									class="h-full rounded-full transition-all duration-500"
									:class="info.health > 80 ? 'bg-status-success' : info.health > 50 ? 'bg-status-warning' : 'bg-status-error'"
									:style="{ width: Math.max(0, Math.min(info.health, 100)) + '%' }"
								/>
							</div>
						</div>

						<div class="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
							<div v-if="info.time_to_full > 0 && info.status === 'Charging'" class="flex justify-between">
								<span class="text-tx-muted">Tiempo restante</span>
								<span class="font-medium">{{ formatTime(info.time_to_full) }}</span>
							</div>
							<div v-if="info.time_to_empty > 0 && info.status === 'Discharging'" class="flex justify-between">
								<span class="text-tx-muted">Tiempo restante</span>
								<span class="font-medium">{{ formatTime(info.time_to_empty) }}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-tx-muted">Consumo</span>
								<span class="font-medium">{{ info.energy_rate.toFixed(1) }} W</span>
							</div>
							<div class="flex justify-between">
								<span class="text-tx-muted">Ciclos</span>
								<span class="font-medium">{{ info.cycle_count }}</span>
							</div>
							<div v-if="info.technology" class="flex justify-between">
								<span class="text-tx-muted">Tecnología</span>
								<span class="font-medium">{{ info.technology }}</span>
							</div>
							<div v-if="info.model" class="flex justify-between">
								<span class="text-tx-muted">Modelo</span>
								<span class="font-medium truncate max-w-[180px]" :title="info.model">{{ info.model }}</span>
							</div>
						</div>
					</template>
				</div>
			</div>
		</SectionCard>

		<!-- Power profiles -->
		<SectionCard>
			<div class="flex items-start gap-3">
				<div class="flex-1">
					<h3 class="text-base font-medium">Perfiles de energía</h3>
					<p class="mt-0.5 text-sm text-tx-muted">
						Cambia el modo de rendimiento del sistema.
					</p>

					<AlertMessage v-if="profilesError" :message="profilesError" tone="error" />

					<div v-if="profilesLoading" class="mt-3 text-sm text-tx-muted">
						Cargando perfiles...
					</div>

					<div v-else-if="profiles.length === 0" class="mt-3 text-sm text-tx-muted">
						No hay perfiles de energía disponibles. ¿Está instalado power-profiles-daemon?
					</div>

					<div v-else class="mt-3 flex flex-wrap gap-2">
						<button
							v-for="profile in profiles"
							:key="profile"
							type="button"
							:class="[
								'flex items-center gap-2 rounded-corner border px-4 py-2.5 text-sm font-medium transition-all',
								active === profile
									? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/20'
									: 'border-ui-border bg-ui-surface/50 text-tx-primary hover:bg-ui-surface hover:border-ui-border-hover'
							]"
							@click="selectProfile(profile)"
						>
							<ProfileIcon :profile="profile" />
							<span>{{ label(profile) }}</span>
							<span
								v-if="active === profile"
								class="ml-1 h-2 w-2 rounded-full bg-primary"
							></span>
						</button>
					</div>
				</div>
			</div>
		</SectionCard>

		<SectionCard v-if="idle">
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-medium">Bloqueo por inactividad</h3>
					<p class="mt-0.5 text-sm text-tx-muted">
						Bloquea la pantalla cuando dejás el equipo sin usar.
					</p>
				</div>
				<SwitchToggle
					:is-on="idle.enabled"
					:disabled="savingIdle || !idle.available"
					@toggle="toggleIdle"
				/>
			</div>

			<AlertMessage v-if="idleError" tone="error" :message="idleError" class="mt-3" />
			<AlertMessage v-if="idleSaved" tone="success" message="Configuración guardada" class="mt-3" />
			<AlertMessage
				v-if="!idle.available"
				tone="warning"
				message="swayidle no está instalado; el bloqueo por inactividad no puede activarse."
				class="mt-3"
			/>
			<AlertMessage
				v-if="idle.legacy_found"
				tone="info"
				message="Se detectó la configuración antigua en wayfire.ini. Al guardar acá se migra a systemd y se elimina de allí."
				class="mt-3"
			/>

			<div class="mt-4 flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h4 class="text-sm font-medium">Bloquear la pantalla</h4>
					<p class="text-xs text-tx-muted">Tras un rato sin actividad.</p>
				</div>
				<SwitchToggle :is-on="idle.lock_enabled" @toggle="idle.lock_enabled = $event" />
			</div>
			<FormGroup v-if="idle.lock_enabled" label="Minutos hasta bloquear" class="mt-2">
				<input
					v-model.number="idle.lock_minutes"
					type="number" min="1" max="180"
					class="w-32 rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
				/>
			</FormGroup>

			<div class="mt-4 flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h4 class="text-sm font-medium">Apagar la pantalla</h4>
					<p class="text-xs text-tx-muted">
						<template v-if="idle.can_screen_off">Ahorra energía apagando la retroiluminación.</template>
						<template v-else>Requiere wlopm, que no está instalado.</template>
					</p>
				</div>
				<SwitchToggle
					:is-on="idle.screen_off_enabled"
					:disabled="!idle.can_screen_off"
					@toggle="idle.screen_off_enabled = $event"
				/>
			</div>
			<FormGroup v-if="idle.screen_off_enabled" label="Minutos hasta apagar" class="mt-2">
				<input
					v-model.number="idle.screen_off_minutes"
					type="number" min="1" max="180"
					class="w-32 rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
				/>
			</FormGroup>

			<div class="mt-4 flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h4 class="text-sm font-medium">Bloquear al suspender</h4>
					<p class="text-xs text-tx-muted">Pide la contraseña al volver de la suspensión.</p>
				</div>
				<SwitchToggle
					:is-on="idle.lock_before_sleep"
					@toggle="idle.lock_before_sleep = $event"
				/>
			</div>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					:disabled="savingIdle || !idle.available"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="saveIdle"
				>
					{{ savingIdle ? 'Guardando…' : 'Guardar cambios' }}
				</button>
			</div>
		</SectionCard>
	</div>
</template>
