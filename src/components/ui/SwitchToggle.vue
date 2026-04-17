<script setup lang="ts">
interface Props {
	isOn: boolean;
	disabled?: boolean;
	activeClass?: string;
	inactiveClass?: string;
	customClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	activeClass: 'bg-primary border-secondary',
	inactiveClass: 'bg-ui-surface/70 border border-ui-border',
	customClass: '',
});

const emit = defineEmits<{
	toggle: [value: boolean];
}>();

const handleClick = () => {
	emit('toggle', !props.isOn);
};
</script>

<template>
	<button
		type="button"
		@click="handleClick"
		:disabled="disabled"
		:class="[
			'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
			isOn ? activeClass : inactiveClass,
			disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
			customClass,
		]"
	>
		<span
			:class="[
				'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
				isOn ? 'translate-x-[1.375rem]' : 'translate-x-1',
			]"
		></span>
	</button>
</template>
