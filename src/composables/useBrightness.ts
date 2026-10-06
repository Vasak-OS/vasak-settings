import { computed, onUnmounted, ref } from 'vue';
import {
	type BrightnessReport,
	getBrightness,
	onBrightnessChanged,
} from '@/services/display-manager';
import { ddcNotices } from '@/utils/ddc-status';

/**
 * El brillo de las pantallas, del plugin `display-manager`.
 *
 * Una lectura que no espera a DDC/CI y, después, el evento del plugin: los
 * monitores externos llegan cuando terminan de buscarse, y un cambio hecho con
 * las teclas o desde el centro de control se ve sin volver a preguntar. Lo usan
 * *Pantallas* y *Brillo y luz nocturna*.
 *
 * `translate` es el `t` de la vista: los avisos de DDC/CI llegan como códigos.
 */
export function useBrightness(translate: (key: string) => string) {
	const report = ref<BrightnessReport | null>(null);
	const error = ref('');
	let stop: (() => void) | null = null;
	let unmounted = false;

	const ddcMessages = computed(() =>
		report.value
			? ddcNotices(report.value.ddc).map(({ key, args }) =>
					args.reduce((text, arg, i) => text.replace(`{${i}}`, arg), translate(key))
				)
			: []
	);

	function apply(next: BrightnessReport) {
		report.value = next;
	}

	async function load() {
		try {
			apply(await getBrightness());
			error.value = '';
			if (!stop) {
				const unlisten = await onBrightnessChanged(apply);
				// Si la vista se cerró mientras se registraba, se suelta enseguida.
				if (unmounted) unlisten();
				else stop = unlisten;
			}
		} catch (e) {
			error.value = String(e);
		}
	}

	onUnmounted(() => {
		unmounted = true;
		stop?.();
		stop = null;
	});

	return { report, error, ddcMessages, load };
}
