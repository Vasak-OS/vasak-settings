import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onUnmounted, type Ref, ref } from 'vue';
import {
	readWayfireSection,
	replaceWayfireSection,
	writeWayfireSection,
} from '@/services/wayfire.service';

/**
 * @param exclusive when the view owns every key of the section, so saving must
 * also delete the entries the user removed (autostart). Option views leave this
 * off, which preserves keys no UI exposes.
 */
export function useWayfireSection(section: string, exclusive = false) {
	const { t } = useI18n();
	const values = ref<Record<string, string>>({}) as Ref<Record<string, string>>;
	const loading = ref(false);
	const saving = ref(false);
	const error = ref('');
	const success = ref('');
	let successTimer: ReturnType<typeof setTimeout> | null = null;

	onUnmounted(() => {
		if (successTimer !== null) {
			clearTimeout(successTimer);
			successTimer = null;
		}
	});

	async function load() {
		loading.value = true;
		error.value = '';
		try {
			values.value = await readWayfireSection(section);
		} catch (e) {
			error.value = `${t('common.loadSectionError').replace('{0}', section)}: ${e}`;
		} finally {
			loading.value = false;
		}
	}

	async function save() {
		saving.value = true;
		error.value = '';
		try {
			const write = exclusive ? replaceWayfireSection : writeWayfireSection;
			await write(section, values.value);
			success.value = t('common.saved');
			if (successTimer !== null) {
				clearTimeout(successTimer);
			}
			successTimer = setTimeout(() => {
				success.value = '';
				successTimer = null;
			}, 3000);
		} catch (e) {
			error.value = `${t('common.saveSectionError').replace('{0}', section)}: ${e}`;
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
		return Number.isNaN(n) ? defaultVal : n;
	}

	function getFloat(key: string, defaultVal = 0): number {
		const v = values.value[key];
		if (v === undefined) return defaultVal;
		const n = parseFloat(v);
		return Number.isNaN(n) ? defaultVal : n;
	}

	return {
		values,
		loading,
		saving,
		error,
		success,
		load,
		save,
		initDefaults,
		getVal,
		setVal,
		getBool,
		setBool,
		getInt,
		getFloat,
	};
}
