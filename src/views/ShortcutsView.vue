<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import ShortcutDeleteModal from '@/components/shortcuts/ShortcutDeleteModal.vue';
import ShortcutEditorModal from '@/components/shortcuts/ShortcutEditorModal.vue';
import SpecialKeysCard from '@/components/shortcuts/SpecialKeysCard.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import { SPECIAL_KEYS, type SpecialKeyDef } from '@/config/specialKeys';
import { getShortcuts, normalizeShortcutKeys, saveShortcuts } from '@/services/shortcuts.service';
import type { ShortcutRule } from '@/types/shortcuts';

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');
const shortcuts = ref<ShortcutRule[]>([]);
const searchQuery = ref('');
const showEditor = ref(false);
const showDelete = ref(false);
const editingIndex = ref<number | null>(null);
const shortcutToDelete = ref<ShortcutRule | null>(null);
const defaultShortcut = ref<ShortcutRule | null>(null);
const shortcutToDeleteIndex = ref<number | null>(null);

const visibleShortcuts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return shortcuts.value
		.map((shortcut, index) => ({ shortcut, index }))
		.filter(({ shortcut }) => {
			if (!query) return true;
			return [shortcut.keys, shortcut.action, shortcut.target].some((value) =>
				value.toLowerCase().includes(query)
			);
		});
});

const loadShortcuts = async () => {
	loading.value = true;
	error.value = '';

	try {
		const loaded = await getShortcuts();
		shortcuts.value = Array.isArray(loaded) ? loaded : [];
	} catch (loadError) {
		error.value = t('views.shortcuts.loadError').replace('{0}', String(loadError));
	} finally {
		loading.value = false;
	}
};

const persistShortcuts = async () => {
	saving.value = true;
	error.value = '';

	try {
		shortcuts.value = await saveShortcuts(shortcuts.value);
		successMessage.value = t('views.shortcuts.savedOk');
		window.setTimeout(() => {
			successMessage.value = '';
		}, 3000);
	} catch (saveError) {
		error.value = t('views.shortcuts.saveError').replace('{0}', String(saveError));
		throw saveError;
	} finally {
		saving.value = false;
	}
};

const openCreateModal = () => {
	editingIndex.value = null;
	showEditor.value = true;
};

const openEditModal = (index: number) => {
	editingIndex.value = index;
	showEditor.value = true;
};

const openDeleteModal = (shortcut: ShortcutRule, index: number) => {
	shortcutToDelete.value = shortcut;
	shortcutToDeleteIndex.value = index;
	showDelete.value = true;
};

const handleEditorSubmit = async (shortcut: ShortcutRule) => {
	if (editingIndex.value === null) {
		shortcuts.value.push(shortcut);
	} else {
		shortcuts.value.splice(editingIndex.value, 1, shortcut);
	}

	await persistShortcuts();
	showEditor.value = false;
	editingIndex.value = null;
};

const handleDeleteConfirm = async () => {
	if (!shortcutToDelete.value) return;

	if (shortcutToDeleteIndex.value === null || !shortcuts.value[shortcutToDeleteIndex.value]) {
		showDelete.value = false;
		shortcutToDelete.value = null;
		shortcutToDeleteIndex.value = null;
		return;
	}

	shortcuts.value.splice(shortcutToDeleteIndex.value, 1);
	await persistShortcuts();
	showDelete.value = false;
	shortcutToDelete.value = null;
	shortcutToDeleteIndex.value = null;
};

const closeEditor = () => {
	showEditor.value = false;
	editingIndex.value = null;
	defaultShortcut.value = null;
};

const closeDelete = () => {
	showDelete.value = false;
	shortcutToDelete.value = null;
	shortcutToDeleteIndex.value = null;
};

const handleSpecialKeyEdit = async (def: SpecialKeyDef) => {
	defaultShortcut.value = {
		keys: def.keyToken,
		action: 'launch',
		target: def.defaultTarget,
	};
	editingIndex.value = null;
	showEditor.value = true;
};

const handleSpecialKeyEditCustom = (index: number) => {
	editingIndex.value = index;
	showEditor.value = true;
};

const resetSpecialDefaults = async () => {
	const existing = new Set(shortcuts.value.map((s) => s.keys));
	const toAdd: ShortcutRule[] = [];

	for (const sk of SPECIAL_KEYS) {
		if (!existing.has(sk.keyToken) && sk.defaultTarget) {
			toAdd.push({
				keys: sk.keyToken,
				action: 'launch',
				target: sk.defaultTarget,
			});
		}
	}

	if (toAdd.length === 0) {
		successMessage.value = t('views.shortcuts.defaultsAlreadySet');
		window.setTimeout(() => (successMessage.value = ''), 3000);
		return;
	}

	shortcuts.value.push(...toAdd);
	await persistShortcuts();
};

onMounted(loadShortcuts);
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.general')"
			:title="t('views.shortcuts.title')"
			:description="t('views.shortcuts.description')"
		>
			<template #actions>
				<button
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface disabled:opacity-50"
					:disabled="loading || saving"
					@click="openCreateModal"
				>
					{{ t('views.shortcuts.new') }}
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" :message="t('views.shortcuts.loading')" padding="lg" />

		<div v-else class="flex flex-col gap-4">
			<AlertMessage v-if="error" :message="error" tone="error" />
			<AlertMessage v-if="successMessage" :message="successMessage" tone="success" />

			<SectionCard>
				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 class="text-lg font-medium text-tx-primary">{{ t('views.shortcuts.listTitle') }}</h3>
							<p class="text-sm text-tx-muted">{{ t('views.shortcuts.listHint') }}</p>
						</div>

						<input
							v-model="searchQuery"
							type="text"
							:placeholder="t('views.shortcuts.searchPlaceholder')"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-2 text-sm text-tx-primary transition-colors placeholder:text-tx-muted/70 focus:border-primary sm:max-w-sm"
						/>
					</div>

					<div v-if="visibleShortcuts.length > 0" class="grid gap-3">
						<div
							v-for="item in visibleShortcuts"
							:key="`${item.index}-${item.shortcut.keys}-${item.shortcut.target}`"
							class="rounded-corner border border-ui-border bg-ui-surface/40 p-4"
						>
							<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<span
											v-for="key in normalizeShortcutKeys(item.shortcut.keys).split('+').filter(Boolean)"
											:key="`${item.index}-${key}`"
											class="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
										>
											{{ key }}
										</span>
										<span class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ item.shortcut.action }}</span>
									</div>
									<p class="mt-3 break-all text-sm text-tx-primary">{{ item.shortcut.target }}</p>
								</div>

								<div class="flex gap-2">
									<button
										type="button"
										class="rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium text-tx-primary transition-colors hover:bg-ui-surface"
										@click="openEditModal(item.index)"
									>
										{{ t('common.edit') }}
									</button>
									<button
										type="button"
										class="rounded-corner border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm font-medium text-status-danger transition-colors hover:bg-status-danger/20"
										@click="openDeleteModal(item.shortcut, item.index)"
									>
										{{ t('common.delete') }}
									</button>
								</div>
							</div>
						</div>
					</div>

					<EmptyStateBox v-else :message="t('views.shortcuts.empty')" padding="md" />
				</div>
			</SectionCard>

			<SpecialKeysCard
				:shortcuts="shortcuts"
				@edit="handleSpecialKeyEdit"
				@edit-custom="handleSpecialKeyEditCustom"
			/>

			<button
				type="button"
				class="self-start rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-primary transition-colors hover:bg-ui-surface"
				:disabled="saving"
				@click="resetSpecialDefaults"
			>
				{{ t('views.shortcuts.resetDefaults') }}
			</button>
		</div>

		<ShortcutEditorModal
			v-model:open="showEditor"
			:shortcut="editingIndex !== null ? shortcuts[editingIndex] : null"
			:default-shortcut="editingIndex === null ? defaultShortcut : null"
			@submit="handleEditorSubmit"
			@cancel="closeEditor"
		/>

		<ShortcutDeleteModal
			v-model:open="showDelete"
			:shortcut="shortcutToDelete"
			@confirm="handleDeleteConfirm"
			@cancel="closeDelete"
		/>
	</div>
</template>
