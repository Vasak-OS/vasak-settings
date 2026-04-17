<script lang="ts" setup>
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    collapsed?: boolean;
    defaultOpen?: boolean;
  }>(),
  {
    collapsed: false,
    defaultOpen: true,
  },
);

const isOpen = ref(props.defaultOpen);

watch(
  () => props.collapsed,
  (value) => {
    if (value) {
      isOpen.value = true;
    }
  },
);
</script>

<template>
  <section class="flex flex-col gap-2">
    <button
      v-if="!collapsed"
      type="button"
      class="group flex w-full items-center justify-between rounded-corner px-2 py-1 text-xs uppercase tracking-[0.08em] text-tx-muted hover:bg-ui-surface/60"
      @click="isOpen = !isOpen"
    >
      <span>{{ title }}</span>
      <span class="text-[10px] transition-transform duration-200" :class="isOpen ? 'rotate-180' : ''">v</span>
    </button>

    <div v-if="isOpen" class="flex flex-col gap-1">
      <slot />
    </div>
  </section>
</template>
