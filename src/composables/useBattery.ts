import { onUnmounted, type Ref, ref } from 'vue';
import {
	type BatteryInfo,
	getActivePowerProfile,
	getBatteryInfo,
	getPowerProfiles,
	setPowerProfile,
} from '@/services/battery.service';

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

export function usePowerProfiles() {
	const profiles: Ref<string[]> = ref([]);
	const active: Ref<string | null> = ref(null);
	const loading = ref(true);
	const error = ref('');

	async function load() {
		try {
			const [p, a] = await Promise.all([getPowerProfiles(), getActivePowerProfile()]);
			profiles.value = p;
			active.value = a;
			error.value = '';
		} catch (e) {
			error.value = `Error cargando perfiles: ${e}`;
		} finally {
			loading.value = false;
		}
	}

	async function setActive(profile: string) {
		error.value = '';
		try {
			await setPowerProfile(profile);
			active.value = profile;
		} catch (e) {
			error.value = `Error aplicando perfil: ${e}`;
			throw e;
		}
	}

	return { profiles, active, loading, error, load, setActive };
}
