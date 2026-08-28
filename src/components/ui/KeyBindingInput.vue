<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onBeforeUnmount, ref } from 'vue';

interface Props {
	modelValue: string;
}

const { t } = useI18n();

const props = defineProps<Props>();
const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const pressedKeys = ref<string[]>([]);
const showPreview = ref(false);
let clearTimer: number | null = null;

const SPECIAL_CODE_MAP: Record<string, string> = {
	ArrowUp: 'KEY_UP',
	ArrowDown: 'KEY_DOWN',
	ArrowLeft: 'KEY_LEFT',
	ArrowRight: 'KEY_RIGHT',
	Space: 'KEY_SPACE',
	Enter: 'KEY_ENTER',
	Tab: 'KEY_TAB',
	Escape: 'KEY_ESC',
	Backspace: 'KEY_BACKSPACE',
	Delete: 'KEY_DELETE',
	Insert: 'KEY_INSERT',
	Home: 'KEY_HOME',
	End: 'KEY_END',
	PageUp: 'KEY_PAGEUP',
	PageDown: 'KEY_PAGEDOWN',
	Minus: 'KEY_MINUS',
	Equal: 'KEY_EQUAL',
	BracketLeft: 'KEY_LEFTBRACE',
	BracketRight: 'KEY_RIGHTBRACE',
	Backslash: 'KEY_BACKSLASH',
	Semicolon: 'KEY_SEMICOLON',
	Quote: 'KEY_APOSTROPHE',
	Comma: 'KEY_COMMA',
	Period: 'KEY_DOT',
	Slash: 'KEY_SLASH',
	Backquote: 'KEY_GRAVE',
};

function keyTokenFromEvent(event: KeyboardEvent): string | null {
	const { code } = event;

	if (code.startsWith('Key') && code.length === 4) {
		return `KEY_${code.slice(3).toUpperCase()}`;
	}
	if (code.startsWith('Digit') && code.length === 6) {
		return `KEY_${code.slice(5)}`;
	}
	if (/^F\d{1,2}$/.test(code)) {
		return `KEY_${code.toUpperCase()}`;
	}
	if (code.startsWith('Numpad') && code.length === 7 && /\d/.test(code.at(-1) || '')) {
		return `KEY_KP${code.slice(6)}`;
	}
	if (code === 'NumpadEnter') return 'KEY_KPENTER';
	if (code === 'NumpadAdd') return 'KEY_KPPLUS';
	if (code === 'NumpadSubtract') return 'KEY_KPMINUS';
	if (code === 'NumpadMultiply') return 'KEY_KPASTERISK';
	if (code === 'NumpadDivide') return 'KEY_KPSLASH';
	if (code === 'NumpadDecimal') return 'KEY_KPDOT';

	return SPECIAL_CODE_MAP[code] || null;
}

function captureBinding(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		pressedKeys.value = [];
		showPreview.value = false;
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const parts: string[] = [];
	if (event.ctrlKey) parts.push('<ctrl>');
	if (event.shiftKey) parts.push('<shift>');
	if (event.altKey) parts.push('<alt>');

	const keyLower = (event.key || '').toString().toLowerCase();
	const code = (event.code || '').toString();
	const metaDetected =
		event.metaKey || code.startsWith('Meta') || /^(super|win|\bmeta\b|os)$/i.test(keyLower);
	if (metaDetected) parts.push('<super>');

	const token = keyTokenFromEvent(event);
	if (token) {
		parts.push(token);
	}

	const newParts = parts.filter((p) => !pressedKeys.value.includes(p));
	for (const p of newParts) {
		pressedKeys.value.push(p);
	}
	if (pressedKeys.value.length > 5) {
		pressedKeys.value = pressedKeys.value.slice(-5);
	}

	const wayfireStr = pressedKeys.value.join(' ');
	emit('update:modelValue', wayfireStr);
	showPreview.value = true;

	if (clearTimer !== null) {
		window.clearTimeout(clearTimer);
	}
	clearTimer = window.setTimeout(() => {
		showPreview.value = false;
		pressedKeys.value = [];
		clearTimer = null;
	}, 1500);
}

function handleKeyDown(event: KeyboardEvent) {
	captureBinding(event);
}

const displayKeys = computed(() => {
	if (showPreview.value && pressedKeys.value.length > 0) {
		return pressedKeys.value;
	}
	if (props.modelValue) {
		return props.modelValue.split(/\s+/).filter(Boolean);
	}
	return [];
});

onBeforeUnmount(() => {
	if (clearTimer !== null) {
		window.clearTimeout(clearTimer);
		clearTimer = null;
	}
});

function clear() {
	emit('update:modelValue', '');
	pressedKeys.value = [];
	showPreview.value = false;
}
</script>

<template>
	<div class="space-y-1">
		<div
			tabindex="0"
			class="flex min-h-10 w-full flex-wrap items-center gap-2 rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
			@keydown="handleKeyDown"
		>
			<span
				v-for="key in displayKeys"
				:key="key"
				class="inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold"
				:class="
					showPreview && pressedKeys.length > 0
						? 'border-primary/50 bg-primary/20 text-primary opacity-70'
						: 'border-primary/30 bg-primary/10 text-primary'
				"
			>
				{{ key }}
			</span>
			<span v-if="displayKeys.length === 0" class="text-tx-muted/70">
				{{ t('common.keyBinding.prompt') }}
			</span>
		</div>
		<div class="flex items-center justify-between gap-2">
			<p class="text-xs text-tx-muted">
				{{ t('common.keyBinding.hint') }}
			</p>
			<button
				v-if="modelValue"
				type="button"
				class="rounded-corner border border-ui-border bg-ui-surface/60 px-2 py-1 text-xs font-medium transition-colors hover:bg-ui-surface"
				@click="clear"
			>
				{{ t('common.clear') }}
			</button>
		</div>
	</div>
</template>
