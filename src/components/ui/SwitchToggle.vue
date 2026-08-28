<script setup lang="ts">
/**
 * Un interruptor de dos estados.
 *
 * `label` es **obligatorio** y no un extra: un botón que sólo tiene un círculo
 * adentro no tiene nombre, y un lector de pantalla anuncia «botón» y nada más.
 * Como la etiqueta ya está escrita al lado del interruptor en todos los usos, el
 * consumidor pasa la misma cadena y no hay que inventar nada.
 *
 * Y va con `role="switch"` más `aria-checked`: sin eso, un `<button>` se anuncia
 * como botón y no dice si está encendido o apagado, que es la única información
 * que este control transmite.
 */
interface Props {
	/** Qué controla este interruptor. Es su nombre accesible. */
	label: string;
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
		role="switch"
		:aria-checked="isOn"
		:aria-label="label"
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
				'inline-block h-4 w-4 transform rounded-full bg-tx-main shadow transition-transform duration-200',
				isOn ? 'translate-x-[1.375rem]' : 'translate-x-1',
			]"
		></span>
	</button>
</template>
