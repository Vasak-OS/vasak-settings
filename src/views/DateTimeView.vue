<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

interface DateTimeInfo {
	timezone: string;
	ntp_enabled: boolean;
	ntp_synchronized: boolean;
	can_ntp: boolean;
	local_rtc: boolean;
	time_usec: number;
}

const info = ref<DateTimeInfo | null>(null);
const timezones = ref<string[]>([]);
const error = ref('');
const success = ref('');
const busy = ref(false);

const timezoneQuery = ref('');
const manualDate = ref('');
const manualTime = ref('');

/** Ticks the preview clock so the page doesn't show a frozen time. */
const now = ref(new Date());
let clockTimer: number | null = null;

const isAutomatic = computed(() => info.value?.ntp_enabled ?? false);

const formattedNow = computed(() =>
	new Intl.DateTimeFormat('es', {
		dateStyle: 'full',
		timeStyle: 'medium',
		timeZone: info.value?.timezone || undefined,
	}).format(now.value)
);

const syncLabel = computed(() => {
	if (!info.value) return '';
	if (!info.value.can_ntp) return 'No hay ningún servicio de hora en red instalado.';
	if (!info.value.ntp_enabled) return 'La hora se ajusta manualmente.';
	return info.value.ntp_synchronized
		? 'Reloj sincronizado con la red.'
		: 'Sincronizando con la red…';
});

/** The full tz database is ~600 entries; filter before rendering the list. */
const filteredTimezones = computed(() => {
	const query = timezoneQuery.value.trim().toLowerCase();
	if (!query) return timezones.value.slice(0, 200);

	return timezones.value.filter((zone) => zone.toLowerCase().includes(query)).slice(0, 200);
});

function flash(message: string) {
	success.value = message;
	setTimeout(() => {
		success.value = '';
	}, 3000);
}

async function refresh() {
	try {
		info.value = await invoke<DateTimeInfo>('get_datetime_info');
		error.value = '';

		const local = new Date(info.value.time_usec / 1000);
		manualDate.value = local.toISOString().slice(0, 10);
		manualTime.value = local.toTimeString().slice(0, 5);
	} catch (err) {
		error.value = String(err);
	}
}

onMounted(async () => {
	await refresh();

	try {
		timezones.value = await invoke<string[]>('list_timezones');
	} catch (err) {
		error.value = String(err);
	}

	clockTimer = window.setInterval(() => {
		now.value = new Date();
	}, 1000);
});

onUnmounted(() => {
	if (clockTimer !== null) {
		window.clearInterval(clockTimer);
		clockTimer = null;
	}
});

/** Every change needs polkit, so failures are expected and must be shown. */
async function run(command: string, args: Record<string, unknown>, done: string) {
	busy.value = true;
	error.value = '';

	try {
		await invoke(command, args);
		await refresh();
		flash(done);
	} catch (err) {
		error.value = String(err);
		await refresh();
	} finally {
		busy.value = false;
	}
}

function toggleAutomatic(value: boolean) {
	void run(
		'set_ntp',
		{ enabled: value },
		value ? 'Hora automática activada' : 'Hora manual activada'
	);
}

function applyTimezone(zone: string) {
	if (!zone || zone === info.value?.timezone) return;
	void run('set_timezone', { timezone: zone }, `Zona horaria: ${zone}`);
}

function applyManualTime() {
	if (!manualDate.value || !manualTime.value) return;

	const stamp = new Date(`${manualDate.value}T${manualTime.value}`);
	if (Number.isNaN(stamp.getTime())) {
		error.value = 'Fecha u hora inválida';
		return;
	}

	void run(
		'set_system_time',
		{ unixSeconds: Math.floor(stamp.getTime() / 1000) },
		'Hora actualizada'
	);
}

function toggleLocalRtc(value: boolean) {
	void run('set_local_rtc', { local: value }, 'Reloj de hardware actualizado');
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Sistema"
			title="Fecha y hora"
			description="Zona horaria y sincronización del reloj del sistema."
		/>

		<AlertMessage v-if="error" tone="error" :message="error" />
		<AlertMessage v-if="success" tone="success" :message="success" />

		<SectionCard>
			<p class="text-2xl font-semibold text-tx-primary">{{ formattedNow }}</p>
			<p class="mt-1 text-sm text-tx-muted">{{ syncLabel }}</p>
		</SectionCard>

		<SectionCard>
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-medium">Hora automática</h3>
					<p class="mt-0.5 text-sm text-tx-muted">
						Sincroniza el reloj con servidores de hora en red.
					</p>
				</div>
				<SwitchToggle
					:is-on="isAutomatic"
					:disabled="busy || !(info?.can_ntp ?? false)"
					@toggle="toggleAutomatic"
				/>
			</div>
		</SectionCard>

		<SectionCard>
			<h3 class="text-base font-medium">Zona horaria</h3>
			<p class="mt-0.5 mb-3 text-sm text-tx-muted">
				Actual: <strong>{{ info?.timezone ?? '—' }}</strong>
			</p>

			<FormGroup label="Buscar zona" html-for="tz-search">
				<input
					id="tz-search"
					v-model="timezoneQuery"
					type="text"
					placeholder="Ej: Buenos_Aires, Madrid, UTC"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
				/>
			</FormGroup>

			<ul class="mt-3 max-h-64 divide-y divide-ui-border overflow-y-auto rounded-corner border border-ui-border">
				<li v-for="zone in filteredTimezones" :key="zone">
					<button
						type="button"
						:disabled="busy"
						class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ui-surface disabled:opacity-50"
						:class="zone === info?.timezone ? 'bg-primary/15 font-medium' : ''"
						@click="applyTimezone(zone)"
					>
						<span>{{ zone }}</span>
						<span v-if="zone === info?.timezone" class="text-xs text-tx-muted">actual</span>
					</button>
				</li>
				<li v-if="filteredTimezones.length === 0" class="px-3 py-4 text-center text-sm text-tx-muted">
					Sin resultados
				</li>
			</ul>
		</SectionCard>

		<SectionCard>
			<h3 class="text-base font-medium">Ajustar manualmente</h3>
			<p class="mt-0.5 mb-3 text-sm text-tx-muted">
				Solo disponible con la hora automática desactivada.
			</p>

			<div class="grid gap-4 sm:grid-cols-3">
				<FormGroup label="Fecha" html-for="manual-date">
					<input
						id="manual-date"
						v-model="manualDate"
						type="date"
						:disabled="isAutomatic || busy"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm disabled:opacity-50"
					/>
				</FormGroup>
				<FormGroup label="Hora" html-for="manual-time">
					<input
						id="manual-time"
						v-model="manualTime"
						type="time"
						:disabled="isAutomatic || busy"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm disabled:opacity-50"
					/>
				</FormGroup>
				<div class="flex items-end">
					<button
						type="button"
						:disabled="isAutomatic || busy"
						class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
						@click="applyManualTime"
					>
						Aplicar
					</button>
				</div>
			</div>
		</SectionCard>

		<SectionCard>
			<details>
				<summary class="cursor-pointer text-sm font-medium text-tx-muted">Opciones avanzadas</summary>
				<div class="mt-3 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h3 class="text-sm font-medium">Reloj de hardware en hora local</h3>
						<p class="mt-0.5 text-xs text-tx-muted">
							Actívalo solo si compartís el equipo con Windows. En cualquier otro caso el reloj
							debe estar en UTC.
						</p>
					</div>
					<SwitchToggle
						:is-on="info?.local_rtc ?? false"
						:disabled="busy"
						@toggle="toggleLocalRtc"
					/>
				</div>
			</details>
		</SectionCard>
	</div>
</template>
