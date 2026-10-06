import {
	getPowerState,
	onPowerStateChanged,
	type PowerState,
	setPowerProfile,
} from '@vasakgroup/plugin-power-profiles';
import { onUnmounted, type Ref, ref } from 'vue';
import { type BatteryInfo, getBatteryInfo } from '@/services/battery.service';

const EMPTY: BatteryInfo = {
	has_battery: false,
	status: '',
	percentage: 0,
	energy_rate: 0,
	health: 0,
	technology: '',
	model: '',
	manufacturer: '',
	time_to_empty: 0,
	time_to_full: 0,
	cycle_count: 0,
};

export function useBattery(pollIntervalMs = 5000) {
	const info: Ref<BatteryInfo> = ref({ ...EMPTY });
	const loading = ref(true);
	const error = ref('');
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;

	async function poll() {
		if (running) return;
		running = true;
		try {
			info.value = await getBatteryInfo();
			error.value = '';
		} catch (e) {
			error.value = `Error obteniendo info de batería: ${e}`;
		} finally {
			loading.value = false;
			running = false;
		}
	}

	async function tick() {
		await poll();
		if (timer !== null) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	}

	function start() {
		if (timer !== null) return;
		timer = setTimeout(tick, 0);
	}

	function stop() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	onUnmounted(stop);

	return { info, loading, error, start, stop };
}

/**
 * Los perfiles de energía, del plugin `power-profiles`.
 *
 * Una sola lectura al abrir —que no va al bus: el plugin guarda una copia— y
 * después el evento: si el perfil cambia desde el centro de control, desde
 * otra aplicación o porque el demonio limitó el rendimiento, la vista se
 * entera sin volver a preguntar.
 */
export function usePowerProfiles() {
	const profiles: Ref<string[]> = ref([]);
	const active: Ref<string | null> = ref(null);
	const available = ref(false);
	const loading = ref(true);
	const error = ref('');
	let unlisten: (() => void) | null = null;
	let disposed = false;

	function apply(state: PowerState) {
		available.value = state.available;
		profiles.value = state.profiles;
		active.value = state.activeProfile;
	}

	async function load() {
		try {
			apply(await getPowerState());
			error.value = '';
			if (!unlisten) {
				const stop = await onPowerStateChanged(apply);
				// Si la vista se cerró mientras se registraba, se suelta enseguida.
				if (disposed) stop();
				else unlisten = stop;
			}
		} catch (e) {
			error.value = `Error cargando perfiles: ${e}`;
		} finally {
			loading.value = false;
		}
	}

	async function setActive(profile: string) {
		error.value = '';
		try {
			apply(await setPowerProfile(profile));
		} catch (e) {
			error.value = `Error aplicando perfil: ${e}`;
			throw e;
		}
	}

	onUnmounted(() => {
		disposed = true;
		unlisten?.();
		unlisten = null;
	});

	return { profiles, active, available, loading, error, load, setActive };
}
