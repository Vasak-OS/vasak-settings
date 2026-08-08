<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, type Ref } from 'vue';
import { useReactiveSymbol } from '@/composables/useReactiveIcon';
import { SPECIAL_KEYS, type SpecialKeyDef } from '@/config/specialKeys';
import type { ShortcutRule } from '@/types/shortcuts';

interface Props {
	shortcuts: ShortcutRule[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
	edit: [def: SpecialKeyDef];
	editCustom: [index: number];
}>();

const { t } = useI18n();

const iconRefs: Record<string, Ref<string>> = {};
for (const sk of SPECIAL_KEYS) {
	const [icon] = useReactiveSymbol(() => sk.icon);
	iconRefs[sk.keyToken] = icon;
}

interface SpecialKeyEntry {
	def: SpecialKeyDef;
	exists: boolean;
	index: number;
	shortcut: ShortcutRule | null;
}

const entries = computed<SpecialKeyEntry[]>(() => {
	const map = new Map<string, number>();
	props.shortcuts.forEach((s, i) => {
		map.set(s.keys, i);
	});

	return SPECIAL_KEYS.map((def) => {
		const idx = map.get(def.keyToken);
		const exists = idx !== undefined;
		return {
			def,
			exists,
			index: idx ?? -1,
			shortcut: idx !== undefined ? (props.shortcuts[idx] ?? null) : null,
		};
	});
});

const currentTarget = (entry: SpecialKeyEntry): string => {
	if (entry.shortcut) return entry.shortcut.target;
	return entry.def.defaultTarget || '—';
};

const handleEdit = (entry: SpecialKeyEntry) => {
	if (entry.exists && entry.index >= 0) {
		emit('editCustom', entry.index);
	} else {
		emit('edit', entry.def);
	}
};
</script>

<template>
	<div class="rounded-corner border border-ui-border bg-ui-surface/40 p-4">
		<h3 class="mb-4 text-lg font-medium text-tx-primary">{{ t('views.shortcuts.specialKeys.title') }}</h3>
		<p class="mb-4 text-sm text-tx-muted">
			{{ t('views.shortcuts.specialKeys.description') }}
		</p>

		<div class="grid gap-2">
			<div
				v-for="entry in entries"
				:key="entry.def.keyToken"
				class="flex items-center justify-between gap-3 rounded-corner border border-ui-border/60 bg-ui-surface/30 px-3 py-2.5"
			>
				<div class="flex min-w-0 items-center gap-3">
					<img
						v-if="iconRefs[entry.def.keyToken]?.value"
						:src="iconRefs[entry.def.keyToken].value"
						:alt="t(`shortcutKeys.${entry.def.keyToken}.label`)"
						class="h-5 w-5 shrink-0"
					/>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-tx-primary">
							{{ t(`shortcutKeys.${entry.def.keyToken}.label`) }}
						</span>
							<span
								class="rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase"
								:class="entry.exists
									? 'border-primary/30 bg-primary/10 text-primary'
									: 'border-ui-border/50 bg-ui-surface/50 text-tx-muted'"
							>
								{{ entry.def.keyToken.replace('KEY_', '') }}
							</span>
						</div>
						<p class="mt-0.5 truncate text-xs text-tx-muted" :title="currentTarget(entry)">
							<template v-if="entry.shortcut">
								{{ entry.shortcut.target }}
							</template>
							<template v-else>
								<span class="italic">
									{{
										t('views.shortcuts.specialKeys.default').replace(
											'{0}',
											entry.def.defaultTarget || t('views.shortcuts.specialKeys.noCommand')
										)
									}}
								</span>
							</template>
						</p>
					</div>
				</div>

				<button
					type="button"
					class="shrink-0 rounded-corner border border-ui-border bg-ui-surface/70 px-2.5 py-1.5 text-xs font-medium text-tx-primary transition-colors hover:bg-ui-surface"
					@click="handleEdit(entry)"
				>
					{{ entry.exists ? t('common.edit') : t('views.shortcuts.specialKeys.assign') }}
				</button>
			</div>
		</div>
	</div>
</template>
