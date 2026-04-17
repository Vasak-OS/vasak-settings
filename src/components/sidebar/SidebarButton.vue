<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { getIconSource } from '@vasakgroup/plugin-vicons';

const iconSrc = ref('')
const props = withDefaults(
	defineProps<{
		label: string;
		icon?: string;
		active?: boolean;
		collapsed?: boolean;
		disabled?: boolean;
		badge?: string | number;
	}>(),
	{
		icon: '',
		active: false,
		collapsed: false,
		disabled: false,
		badge: '',
	}
);

defineEmits<{
	click: [];
}>();

onMounted(async() => {
  if (props.icon) {
    iconSrc.value = await getIconSource(props.icon);
  }
});
</script>

<template>
  <button
    type="button"
    :title="collapsed ? label : undefined"
    :disabled="disabled"
    class="group relative flex w-full items-center gap-3 rounded-corner border px-3 py-2 text-left text-sm transition-all duration-200"
    :class="[
      active
        ? 'border-secondary bg-primary/15 text-tx-main shadow-sm'
        : 'border-transparent bg-ui-bg/30 hover:border-ui-border hover:bg-ui-surface/70',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      collapsed ? 'justify-center px-2' : '',
    ]"
    @click="$emit('click')"
  >
    <span
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-corner text-xs font-semibold uppercase tracking-wide"
      :class="active ? 'border-secondary bg-primary/20' : ''"
      aria-hidden="true"
    >
      <img v-if="iconSrc" :src="iconSrc" alt="Icono" class="h-8 w-8 object-contain" />
      <span v-else>{{ label.charAt(0).toUpperCase() }}</span>
    </span>

    <span v-if="!collapsed" class="min-w-0 flex-1 truncate font-medium">{{ label }}</span>

    <span
      v-if="!collapsed && badge !== ''"
      class="rounded-corner bg-ui-surface px-2 py-0.5 text-xs font-semibold text-tx-muted"
    >
      {{ badge }}
    </span>
  </button>
</template>
