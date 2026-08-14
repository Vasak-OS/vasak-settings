<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import {
	getAvailableKeyboardLayouts,
	getAvailableKeyboardSwitchOptions,
	getAvailableKeyboardVariants,
	getAvailableLocales,
	getCurrentLocale,
	getKeyboardLayoutsFromWayfire,
	type KeyboardLayout,
	setKeyboardLayouts,
	setSystemLocale,
} from '@/services/language.service';

/** What a second layout gets by default: the shortcut everyone knows. */
const DEFAULT_SWITCH_OPTION = 'grp:alt_shift_toggle';

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const availableLocales = ref<string[]>([]);
const currentLocaleMap = ref<Record<string, string>>({});

const availableLayouts = ref<KeyboardLayout[]>([]);
const availableVariants = ref<KeyboardLayout[]>([]);
const availableSwitchOptions = ref<KeyboardLayout[]>([]);
const layout1 = ref('');
const layout2 = ref('');
const layoutVariant = ref('');
const switchOption = ref('');

const currentLocale = computed(() => currentLocaleMap.value.LANG || '');

const localeOptions = computed(() => availableLocales.value.map((l) => ({ label: l, value: l })));

const layoutOptions = computed(() =>
	availableLayouts.value.map((l) => ({
		label: `${l.description} (${l.code})`,
		value: l.code,
	}))
);

const layout1Options = computed(() => {
	const other = layout2.value;
	return layoutOptions.value.filter((o) => !other || o.value !== other);
});

const layout2Options = computed(() => {
	const other = layout1.value;
	return [
		{ label: t('views.languageKeyboard.none'), value: '' },
		...layoutOptions.value.filter((o) => !other || o.value !== other),
	];
});

const variantOptions = computed(() => [
	{ label: t('views.languageKeyboard.noVariant'), value: '' },
	...availableVariants.value.map((l) => ({ label: l.description, value: l.code })),
]);

const switchOptionChoices = computed(() => {
	const known = availableSwitchOptions.value.map((o) => ({ label: o.description, value: o.code }));

	// A shortcut already in wayfire.ini that this system's option list doesn't
	// mention would otherwise show as an empty select, and saving would quietly
	// throw it away.
	if (switchOption.value && !known.some((o) => o.value === switchOption.value)) {
		known.unshift({ label: switchOption.value, value: switchOption.value });
	}

	return [{ label: t('views.languageKeyboard.noSwitchShortcut'), value: '' }, ...known];
});

async function loadData() {
	loading.value = true;
	error.value = '';
	try {
		const [locales, localeMap, layouts, switchOptions, wayfire] = await Promise.all([
			getAvailableLocales(),
			getCurrentLocale(),
			getAvailableKeyboardLayouts(),
			getAvailableKeyboardSwitchOptions(),
			getKeyboardLayoutsFromWayfire(),
		]);
		availableLocales.value = locales;
		currentLocaleMap.value = localeMap;
		availableLayouts.value = layouts;
		availableSwitchOptions.value = switchOptions;

		const parts = wayfire.layouts
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		layout1.value = parts[0] || '';
		layout2.value = parts[1] || '';
		layoutVariant.value = wayfire.variant;
		switchOption.value = wayfire.switch_option;

		await loadVariants();
	} catch (e) {
		error.value = t('views.languageKeyboard.loadError').replace('{0}', String(e));
	} finally {
		loading.value = false;
	}
}

/** The variant belongs to the primary layout, so the list follows it. */
async function loadVariants() {
	if (!layout1.value) {
		availableVariants.value = [];
		return;
	}

	availableVariants.value = await getAvailableKeyboardVariants(layout1.value);
}

async function selectLayout1(value: string) {
	layout1.value = value;
	// A variant of the previous layout is meaningless under the new one, and
	// applying the pair would leave XKB unable to build the keymap at all.
	layoutVariant.value = '';
	try {
		await loadVariants();
	} catch (e) {
		error.value = t('views.languageKeyboard.loadError').replace('{0}', String(e));
	}
}

/**
 * A second layout is useless without a way to reach it, so adding one comes
 * with the usual shortcut already chosen; removing it drops the shortcut, which
 * would otherwise stay in wayfire.ini with nothing to switch to.
 */
function selectLayout2(value: string) {
	layout2.value = value;
	if (!value) {
		switchOption.value = '';
	} else if (!switchOption.value) {
		switchOption.value = DEFAULT_SWITCH_OPTION;
	}
}

async function saveLocale() {
	if (!currentLocale.value) return;
	saving.value = true;
	error.value = '';
	success.value = '';
	try {
		await setSystemLocale(currentLocale.value);
		success.value = t('views.languageKeyboard.localeSaved');
	} catch (e) {
		error.value = t('views.languageKeyboard.localeError').replace('{0}', String(e));
	} finally {
		saving.value = false;
	}
}

async function saveLayouts() {
	const layouts = [layout1.value, layout2.value].filter(Boolean).join(',');
	saving.value = true;
	error.value = '';
	success.value = '';
	try {
		await setKeyboardLayouts(layouts, layoutVariant.value, switchOption.value);
		success.value = t('views.languageKeyboard.layoutSaved');
	} catch (e) {
		error.value = t('views.languageKeyboard.layoutError').replace('{0}', String(e));
	} finally {
		saving.value = false;
	}
}

onMounted(loadData);
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.languageKeyboard.title')"
			:description="t('views.languageKeyboard.description')"
		/>

		<AlertMessage v-if="error" :message="error" tone="error" />
		<AlertMessage v-if="success" :message="success" tone="success" />

		<div v-if="loading" class="py-8 text-center text-sm text-tx-muted">
			{{ t('common.loading') }}
		</div>

		<template v-else>
			<SectionCard :title="t('views.languageKeyboard.systemLanguage')">
				<p class="mb-3 text-sm text-tx-muted">
					{{ t('views.languageKeyboard.systemLanguageDescription') }}
				</p>
				<div class="flex items-end gap-3">
					<div class="flex-1">
						<FormGroup :label="t('views.languageKeyboard.language')">
							<SelectInput
								:modelValue="currentLocale"
								:options="localeOptions"
								@update:modelValue="(v: string) => currentLocaleMap.LANG = v"
							/>
						</FormGroup>
					</div>
					<button
						type="button"
						:disabled="saving"
						class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
						@click="saveLocale"
					>
						{{ saving ? t('common.saving') : t('common.apply') }}
					</button>
				</div>
			</SectionCard>

			<SectionCard :title="t('views.languageKeyboard.keyboardLayout')">
				<p class="mb-3 text-sm text-tx-muted">
					{{ t('views.languageKeyboard.keyboardLayoutDescription') }}
				</p>

				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.languageKeyboard.primaryLayout')">
						<SelectInput
							:modelValue="layout1"
							:options="layout1Options"
							@update:modelValue="selectLayout1"
						/>
					</FormGroup>
					<FormGroup :label="t('views.languageKeyboard.secondaryLayout')">
						<SelectInput
							:modelValue="layout2"
							:options="layout2Options"
							@update:modelValue="selectLayout2"
						/>
					</FormGroup>
					<FormGroup :label="t('views.languageKeyboard.variant')">
						<SelectInput
							:modelValue="layoutVariant"
							:options="variantOptions"
							@update:modelValue="(v: string) => layoutVariant = v"
						/>
					</FormGroup>
					<FormGroup v-if="layout2" :label="t('views.languageKeyboard.switchShortcut')">
						<SelectInput
							:modelValue="switchOption"
							:options="switchOptionChoices"
							@update:modelValue="(v: string) => switchOption = v"
						/>
					</FormGroup>
				</div>

				<div class="mt-4 flex justify-end">
					<button
						type="button"
						:disabled="saving"
						class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
						@click="saveLayouts"
					>
						{{ saving ? t('common.saving') : t('views.languageKeyboard.saveLayout') }}
					</button>
				</div>
			</SectionCard>
		</template>
	</div>
</template>
