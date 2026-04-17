<script setup lang="ts">
interface Props {
	modelValue: string | number;
	options: { label: string; value: string | number }[] | string[];
	id?: string;
	disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	id: '',
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: string | number];
}>();

const updateValue = (event: Event) => {
	const target = event.target as HTMLSelectElement;
	emit('update:modelValue', target.value);
};
</script>

<template>
	<select
		:id="id"
		:value="modelValue"
		:disabled="disabled"
		@change="updateValue"
		class="w-full appearance-none rounded-corner border border-ui-border bg-ui-surface/50 bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg_xmlns=%27http://www.w3.org/2000/svg%27_viewBox=%270_0_24_24%27_fill=%27none%27_stroke=%27white%27_stroke-width=%272%27_stroke-linecap=%27round%27_stroke-linejoin=%27round%27%3e%3cpolyline_points=%276_9_12_15_18_9%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:20px] bg-[right_8px_center] bg-no-repeat px-3 py-2.5 pr-9 text-sm text-tx-primary transition-all duration-200 hover:bg-ui-surface focus:border-[var(--primary-color,#0084ff)] focus:bg-ui-surface/80 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0084ff)]/20 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<template v-for="opt in options" :key="typeof opt === 'string' ? opt : opt.value">
			<option
				class="bg-ui-bg text-tx-primary"
				:value="typeof opt === 'string' ? opt : opt.value"
			>
				{{ typeof opt === 'string' ? opt : opt.label }}
			</option>
		</template>
	</select>
</template>
