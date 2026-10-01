<script setup lang="ts">
/**
 * La sección de un complemento de Wayfire: su nombre, qué hace, el interruptor
 * que lo enciende y, encendido, sus ajustes.
 *
 * La tarjeta es `ConfigSection` de la librería —el icono y la descripción van
 * en sus propiedades, el interruptor o la insignia «necesario» en `aside`— y
 * lo propio de acá es sólo lo de Wayfire: leer el estado del complemento,
 * prenderlo y apagarlo, y no ofrecer el interruptor de los que el escritorio
 * necesita. Antes vivía en `components/ui/` con la tarjeta dibujada a mano.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Badge, ConfigSection, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { computed, onMounted } from 'vue';
import { useWayfirePlugins } from '@/composables/useWayfirePlugins';

interface Props {
	/** Wayfire plugin id, as it appears in `[core] plugins`. */
	pluginId: string;
	icon?: string;
	/** Overrides the label from the plugin registry. */
	title?: string;
	description?: string;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { get, setEnabled, load } = useWayfirePlugins();

onMounted(load);

const plugin = computed(() => get(props.pluginId));
const isEnabled = computed(() => plugin.value?.enabled ?? false);
const isRequired = computed(() => plugin.value?.required ?? false);
// Falls back to the locale entry keyed by plugin id, so each view only has to
// name the plugin.
const heading = computed(() => props.title ?? t(`wayfire.plugins.${props.pluginId}.label`));
const summary = computed(
	() => props.description ?? t(`wayfire.plugins.${props.pluginId}.description`)
);
const requiredReason = computed(() => t(`wayfire.plugins.${props.pluginId}.requiredReason`));

function handleToggle(value: boolean) {
	void setEnabled(props.pluginId, value);
}
</script>

<template>
	<ConfigSection
		:title="heading"
		:description="summary"
		:icon="icon ?? 'application-x-addon'"
		icon-type="icon"
	>
		<template #aside>
			<!-- Required plugins get no switch at all: the desktop depends on them.
			     El globo va en un `span` alrededor: `Badge` no declara `title`. -->
			<span v-if="isRequired" :title="requiredReason">
				<Badge :label="t('common.required')" />
			</span>
			<SwitchToggle v-else :label="heading" :model-value="isEnabled" @update:model-value="handleToggle" />
		</template>

		<p v-if="isRequired" class="m-0 text-body-xs text-tx-muted">{{ requiredReason }}</p>

		<!-- El divisor va de canto a canto, como el de la tarjeta de antes: los
		     márgenes negativos deshacen el relleno de la sección. -->
		<div v-if="isEnabled || isRequired" class="-mx-4 -mb-4 border-t border-ui-line p-4">
			<slot />
		</div>
		<p v-else class="-mx-4 -mb-4 border-t border-ui-line px-4 py-3 text-body-xs text-tx-muted">
			{{ t('wayfire.plugins.enableToConfigure') }}
		</p>
	</ConfigSection>
</template>
