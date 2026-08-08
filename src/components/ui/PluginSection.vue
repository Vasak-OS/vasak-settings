<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted } from 'vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
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
const [iconSrc] = useReactiveIcon(() => props.icon ?? 'application-x-addon');

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
	<article class="rounded-corner border border-ui-border bg-ui-surface/40">
		<header class="flex items-start gap-3 p-4">
			<img :src="iconSrc" alt="" class="mt-0.5 h-5 w-5 shrink-0" />

			<div class="min-w-0 flex-1">
				<h3 class="truncate text-sm font-semibold text-tx-primary">{{ heading }}</h3>
				<p v-if="summary" class="mt-0.5 text-xs text-tx-muted">{{ summary }}</p>
			</div>

			<!-- Required plugins get no switch at all: the desktop depends on them. -->
			<span
				v-if="isRequired"
				class="shrink-0 rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[11px] font-medium text-tx-muted"
				:title="requiredReason"
			>
				{{ t('common.required') }}
			</span>
			<SwitchToggle v-else :is-on="isEnabled" @toggle="handleToggle" />
		</header>

		<p v-if="isRequired" class="px-4 pb-3 text-[11px] leading-relaxed text-tx-muted">
			{{ requiredReason }}
		</p>

		<div v-if="isEnabled || isRequired" class="border-t border-ui-border p-4">
			<slot />
		</div>
		<p v-else class="border-t border-ui-border px-4 py-3 text-xs text-tx-muted">
			{{ t('wayfire.plugins.enableToConfigure') }}
		</p>
	</article>
</template>
