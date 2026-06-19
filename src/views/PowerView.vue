<script setup lang="ts">
import { onMounted } from 'vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import { useBattery, usePowerProfiles } from '@/composables/useBattery';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import ProfileIcon from '@/components/ui/ProfileIcon.vue';

const { info, loading, error, start: startPolling } = useBattery(5000);
const { profiles, active, loading: profilesLoading, error: profilesError, load: loadProfiles, setActive } = usePowerProfiles();

const [batteryIcon] = useReactiveIcon(() => {
	if (!info.value.has_battery) return 'battery';
	const s = info.value.status;
	if (s === 'Charging') return 'battery-charging';
	if (s === 'FullyCharged') return 'battery-full';
	if (s === 'Discharging') return info.value.percentage > 50 ? 'battery-good' : info.value.percentage > 20 ? 'battery-low' : 'battery-caution';
	return 'battery';
});

onMounted(() => {
	startPolling();
	loadProfiles();
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
		case 'Charging': return 'text-status-success';
		case 'Discharging': return 'text-tx-primary';
		case 'FullyCharged': return 'text-status-success';
		case 'Empty': return 'text-status-error';
		default: return 'text-tx-muted';
	}
}

function label(profile: string): string {
	switch (profile) {
		case 'performance': return 'Rendimiento';
		case 'balanced': return 'Balanceado';
		case 'power-saver': return 'Ahorro de energía';
		default: return profile;
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
	</div>
</template>
