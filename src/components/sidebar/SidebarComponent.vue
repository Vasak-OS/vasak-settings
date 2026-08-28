<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarCategoryGroup from '@/components/sidebar/SidebarCategoryGroup.vue';
import { SidebarCategory } from '@/types/sidebar';

const { t } = useI18n();

const props = withDefaults(
	defineProps<{
		title?: string;
		subtitle?: string;
		categories?: SidebarCategory[];
		modelValue?: string;
	}>(),
	{
		title: 'Centro de Control',
		subtitle: 'VasakOS',
		categories: () => [],
		modelValue: '',
	}
);

const emit = defineEmits<{
	'update:modelValue': [value: string];
	change: [value: string];
}>();

const isCollapsed = ref(false);
const isMobileViewport = ref(false);
let mobileMediaQuery: MediaQueryList | null = null;

const hasCategories = computed(() => props.categories.length > 0);
const effectiveCollapsed = computed(() => isMobileViewport.value || isCollapsed.value);

const syncMobileViewport = () => {
	isMobileViewport.value = mobileMediaQuery?.matches ?? false;
};

const selectItem = (id: string) => {
	emit('update:modelValue', id);
	emit('change', id);
};

onMounted(() => {
	mobileMediaQuery = window.matchMedia('(max-width: 767px)');
	syncMobileViewport();
	mobileMediaQuery.addEventListener('change', syncMobileViewport);
});

onBeforeUnmount(() => {
	mobileMediaQuery?.removeEventListener('change', syncMobileViewport);
});
</script>

<template>
	<div class="contents">
		<aside
			class="relative z-30 flex h-full shrink-0 flex-col border border-ui-border bg-ui-bg/80 transition-all duration-300 rounded-corner"
			:class="['w-[84px]', effectiveCollapsed ? 'md:w-[84px]' : 'md:w-72']"
		>
			<header class="flex items-center gap-2 border-b border-ui-border p-2">
				<button
					type="button"
					class="hidden h-10 w-10 items-center justify-center rounded-corner border border-ui-border bg-ui-surface/70 text-sm font-semibold md:inline-flex"
					@click="isCollapsed = !isCollapsed"
				>
					{{ effectiveCollapsed ? '>' : '<' }}
				</button>

				<div v-if="!effectiveCollapsed" class="min-w-0 flex-1">
					<p class="truncate text-sm font-semibold">{{ title }}</p>
					<p class="truncate text-xs text-tx-muted">{{ subtitle }}</p>
				</div>
			</header>

			<div class="flex-1 space-y-3 overflow-y-auto p-2">
				<SidebarCategoryGroup
					v-for="category in categories"
					:key="category.id"
					:title="category.title"
					:collapsed="effectiveCollapsed"
				>
					<SidebarButton
						v-for="item in category.items"
						:key="item.id"
						:label="item.label"
						:icon="item.icon"
						:badge="item.badge"
						:disabled="item.disabled"
						:collapsed="effectiveCollapsed"
						:active="modelValue === item.id"
						@click="selectItem(item.id)"
					/>
				</SidebarCategoryGroup>

				<div
					v-if="!hasCategories"
					class="rounded-corner border border-dashed border-ui-border bg-ui-surface/40 p-3 text-xs text-tx-muted"
				>
					{{ t('sidebar.noCategories') }}
				</div>
			</div>
		</aside>
	</div>
</template>
