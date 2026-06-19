import { ref, type Ref } from 'vue';
import { readWayfireSection, writeWayfireSection } from '@/services/wayfire.service';

export function useWayfireSection(section: string) {
	const values = ref<Record<string, string>>({}) as Ref<Record<string, string>>;
	const loading = ref(false);
	const saving = ref(false);
	const error = ref('');
	const success = ref('');

	async function load() {
		loading.value = true;
		error.value = '';
		try {
			values.value = await readWayfireSection(section);
		} catch (e) {
			error.value = `Error cargando sección [${section}]: ${e}`;
		} finally {
			loading.value = false;
		}
	}

	async function save() {
		saving.value = true;
		error.value = '';
		try {
			await writeWayfireSection(section, values.value);
			success.value = 'Configuración guardada correctamente';
			setTimeout(() => { success.value = ''; }, 3000);
		} catch (e) {
			error.value = `Error guardando sección [${section}]: ${e}`;
		} finally {
			saving.value = false;
		}
	}

	function initDefaults(defaults: Record<string, string>) {
		for (const [key, val] of Object.entries(defaults)) {
			if (!(key in values.value)) {
				values.value[key] = val;
			}
		}
	}

	function getVal(key: string, defaultVal = ''): string {
		return values.value[key] ?? defaultVal;
	}

	function setVal(key: string, val: string | number | boolean) {
		values.value[key] = String(val);
	}

	function getBool(key: string, defaultVal = false): boolean {
		const v = values.value[key];
		if (v === undefined) return defaultVal;
		return v === 'true' || v === '1' || v === 'yes';
	}

	function setBool(key: string, val: boolean) {
		values.value[key] = val ? 'true' : 'false';
	}

	function getInt(key: string, defaultVal = 0): number {
		const v = values.value[key];
		if (v === undefined) return defaultVal;
		const n = parseInt(v, 10);
		return isNaN(n) ? defaultVal : n;
	}

	function getFloat(key: string, defaultVal = 0): number {
		const v = values.value[key];
		if (v === undefined) return defaultVal;
		const n = parseFloat(v);
		return isNaN(n) ? defaultVal : n;
	}

	return {
		values, loading, saving, error, success,
		load, save, initDefaults,
		getVal, setVal,
		getBool, setBool,
		getInt, getFloat,
	};
}
