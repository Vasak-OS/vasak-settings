<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';
import { normalizeShortcutKeys } from '@/services/shortcuts.service';
import type { ShortcutRule } from '@/types/shortcuts';

interface Props {
	open: boolean;
	shortcut?: ShortcutRule | null;
	defaultShortcut?: ShortcutRule | null;
}

const props = withDefaults(defineProps<Props>(), {
	shortcut: null,
	defaultShortcut: null,
});

const emit = defineEmits<{
	'update:open': [boolean];
	submit: [ShortcutRule];
	cancel: [];
}>();

const keys = ref('');
const action = ref('launch');
const target = ref('');
const formError = ref('');
const liveKeys = ref<string[]>([]);
const pressedKeys = ref<string[]>([]);
const clearPreviewTimer = ref<number | null>(null);

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
	VolumeDown: 'KEY_VOLUMEDOWN',
	VolumeUp: 'KEY_VOLUMEUP',
	VolumeMute: 'KEY_MUTE',
	MicrophoneMuteToggle: 'KEY_MICMUTE',
	CameraToggle: 'KEY_CAMERA',
	BrightnessDown: 'KEY_BRIGHTNESSDOWN',
	BrightnessUp: 'KEY_BRIGHTNESSUP',
	MediaPlayPause: 'KEY_PLAYPAUSE',
	MediaStop: 'KEY_STOPCD',
	MediaPreviousTrack: 'KEY_PREVIOUSSONG',
	MediaNextTrack: 'KEY_NEXTSONG',
	MediaSelect: 'KEY_MEDIA',
	Mail: 'KEY_EMAIL',
	Calculator: 'KEY_CALCULATOR',
	Sleep: 'KEY_SLEEP',
};

const isEditing = computed(() => Boolean(props.shortcut));

const dialogTitle = computed(() => (isEditing.value ? 'Editar shortcut' : 'Nuevo shortcut'));
const dialogDescription = computed(() =>
	isEditing.value
		? 'Ajusta la combinación, la acción o el comando asociado.'
		: 'Define la combinación de teclas y el comando que se ejecutará.'
);

const resetForm = () => {
	const src = props.shortcut || props.defaultShortcut;
	keys.value = src?.keys || '';
	action.value = src?.action || 'launch';
	target.value = src?.target || '';
	formError.value = '';
	liveKeys.value = [];
	pressedKeys.value = [];
	if (clearPreviewTimer.value !== null) {
		window.clearTimeout(clearPreviewTimer.value);
		clearPreviewTimer.value = null;
	}
};

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			resetForm();
		}
	}
);

watch(
	() => props.shortcut,
	() => {
		if (props.open) {
			resetForm();
		}
	}
);

const handleSubmit = () => {
	const normalizedKeys = normalizeShortcutKeys(keys.value);
	const normalizedAction = action.value.trim();
	const normalizedTarget = target.value.trim();

	if (!normalizedKeys) {
		formError.value = 'Debes indicar una combinación de teclas';
		return;
	}

	if (!normalizedAction) {
		formError.value = 'Debes indicar una acción';
		return;
	}

	if (!normalizedTarget) {
		formError.value = 'Debes indicar un target o comando';
		return;
	}

	emit('submit', {
		keys: normalizedKeys,
		action: normalizedAction,
		target: normalizedTarget,
	});
};

const keyTokenFromEvent = (event: KeyboardEvent): string | null => {
	const { key, code } = event;

	if (key === 'Control') return null;
	if (key === 'Shift') return null;
	if (key === 'Alt') return null;
	if (key === 'Meta') return null;

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
};

const captureShortcut = (event: KeyboardEvent) => {
	if (event.key === 'Escape') {
		keys.value = '';
		liveKeys.value = [];
		pressedKeys.value = [];
		if (clearPreviewTimer.value !== null) {
			window.clearTimeout(clearPreviewTimer.value);
			clearPreviewTimer.value = null;
		}
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const parts: string[] = [];
	if (event.ctrlKey) parts.push('CTRL');
	if (event.shiftKey) parts.push('SHIFT');
	if (event.altKey) parts.push('ALT');

	const keyLower = (event.key || '').toString().toLowerCase();
	const code = (event.code || '').toString();
	const metaDetected =
		event.metaKey || code.startsWith('Meta') || /^(super|win|\bmeta\b|os)$/i.test(keyLower);
	if (metaDetected) parts.push('SUPER');

	const token = keyTokenFromEvent(event);
	if (token && !parts.includes(token)) {
		parts.push(token);
	}

	for (const part of parts) {
		if (!pressedKeys.value.includes(part)) {
			pressedKeys.value.push(part);
		}
	}

	if (pressedKeys.value.length > 4) {
		pressedKeys.value = pressedKeys.value.slice(-4);
	}

	keys.value = normalizeShortcutKeys(pressedKeys.value.join('+'));
	liveKeys.value = [...pressedKeys.value];
	if (clearPreviewTimer.value !== null) {
		window.clearTimeout(clearPreviewTimer.value);
	}
	clearPreviewTimer.value = window.setTimeout(() => {
		liveKeys.value = [];
		clearPreviewTimer.value = null;
	}, 1000);
	formError.value = '';
};

const handleKeyDown = (event: KeyboardEvent) => {
	captureShortcut(event);
};

const handleKeyUp = () => {
	if (clearPreviewTimer.value !== null) {
		window.clearTimeout(clearPreviewTimer.value);
	}
	clearPreviewTimer.value = window.setTimeout(() => {
		liveKeys.value = [];
		pressedKeys.value = [];
		clearPreviewTimer.value = null;
	}, 1000);
};

const displayKeys = computed(() => {
	if (keys.value) {
		return keys.value.split('+').filter(Boolean);
	}
	return liveKeys.value;
});

const clearShortcut = () => {
	keys.value = '';
	formError.value = '';
	liveKeys.value = [];
	pressedKeys.value = [];
};

const handleCancel = () => {
	formError.value = '';
	emit('cancel');
	emit('update:open', false);
};
</script>

<template>
	<ModalDialog :open="open" :title="dialogTitle" :description="dialogDescription" @close="handleCancel">
		<div class="space-y-4">
			<div v-if="formError" class="rounded border border-status-danger/30 bg-status-danger/10 p-2 text-xs text-status-danger">
				{{ formError }}
			</div>

			<FormGroup label="Combinación" html-for="shortcut-keys">
				<div class="space-y-2">
					<div
						id="shortcut-keys"
						tabindex="0"
						class="min-h-10 w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors focus:border-primary flex flex-wrap gap-2 items-center"
						@keydown="handleKeyDown"
						@keyup="handleKeyUp"
					>
						<span
							v-for="key in displayKeys"
							:key="key"
							class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap"
							:class="keys ? 'border-primary/30 bg-primary/10 text-primary' : 'border-primary/50 bg-primary/20 text-primary opacity-70'"
						>
							{{ key }}
						</span>
						<span v-if="displayKeys.length === 0" class="text-tx-muted/70">
							Presiona la combinación
						</span>
					</div>
					<div class="flex items-center justify-between gap-2">
						<p class="text-xs text-tx-muted">
							Presiona la combinación directamente. Ejemplo: mantén <strong>Ctrl</strong> y pulsa <strong>T</strong>.
						</p>
						<button
							type="button"
							class="rounded-corner border border-ui-border bg-ui-surface/60 px-2.5 py-1.5 text-xs font-medium text-tx-primary transition-colors hover:bg-ui-surface"
							@click="() => { keys.value = ''; formError.value = ''; }"
						>
							Limpiar
						</button>
					</div>
				</div>
			</FormGroup>

			<FormGroup label="Acción" html-for="shortcut-action">
				<input
					id="shortcut-action"
					v-model="action"
					type="text"
					placeholder="launch"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
				/>
			</FormGroup>

			<FormGroup label="Target / comando" html-for="shortcut-target">
				<textarea
					id="shortcut-target"
					v-model="target"
					rows="3"
					placeholder="firefox"
					class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary outline-none transition-colors placeholder:text-tx-muted/70 focus:border-primary"
				/>
			</FormGroup>

			<p class="text-xs text-tx-muted">La combinación se normaliza automáticamente para que el orden de las teclas no importe.</p>

			<div class="flex justify-end gap-2 pt-2">
				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-primary transition-colors hover:bg-ui-surface"
					@click="handleCancel"
				>
					Cancelar
				</button>
				<button
					type="button"
					class="rounded-corner border border-primary bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
					@click="handleSubmit"
				>
					{{ isEditing ? 'Guardar cambios' : 'Agregar shortcut' }}
				</button>
			</div>
		</div>
	</ModalDialog>
</template>
