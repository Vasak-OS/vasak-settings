<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import { useWayfirePlugins } from '@/composables/useWayfirePlugins';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

interface Props {
	/** Wayfire plugin id, as it appears in `[core] plugins`. */
	pluginId: string;
	icon?: string;
	/** Overrides the label from the plugin registry. */
	title?: string;
	description?: string;
}

const props = defineProps<Props>();

const { get, setEnabled, load } = useWayfirePlugins();
const [icon] = useReactiveIcon(() => props.icon ?? 'application-x-addon');

onMounted(load);

const plugin = computed(() => get(props.pluginId));
const isEnabled = computed(() => plugin.value?.enabled ?? false);
const isRequired = computed(() => plugin.value?.required ?? false);
const title = computed(() => props.title ?? plugin.value?.label ?? props.pluginId);
const description = computed(() => props.description ?? plugin.value?.description ?? '');

function handleToggle(value: boolean) {
	void setEnabled(props.pluginId, value);
}
</script>

<template>
	<article class="rounded-corner border border-ui-border bg-ui-surface/40">
		<header class="flex items-start gap-3 p-4">
			<img :src="icon" alt="" class="mt-0.5 h-5 w-5 shrink-0" />

			<div class="min-w-0 flex-1">
				<h3 class="truncate text-sm font-semibold text-tx-primary">{{ title }}</h3>
				<p v-if="description" class="mt-0.5 text-xs text-tx-muted">{{ description }}</p>
			</div>

			<!-- Required plugins get no switch at all: the desktop depends on them. -->
			<span
				v-if="isRequired"
				class="shrink-0 rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[11px] font-medium text-tx-muted"
				:title="plugin?.required_reason ?? ''"
			>
				Requerido
			</span>
			<SwitchToggle v-else :is-on="isEnabled" @toggle="handleToggle" />
		</header>

		<p
			v-if="isRequired && plugin?.required_reason"
			class="px-4 pb-3 text-[11px] leading-relaxed text-tx-muted"
		>
			{{ plugin.required_reason }}
		</p>

		<div v-if="isEnabled || isRequired" class="border-t border-ui-border p-4">
			<slot />
		</div>
		<p v-else class="border-t border-ui-border px-4 py-3 text-xs text-tx-muted">
			Activá el plugin para configurar sus opciones.
		</p>
	</article>
</template>
