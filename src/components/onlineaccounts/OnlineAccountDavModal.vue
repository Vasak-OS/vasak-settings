<script setup lang="ts">
/**
 * Conectar un servidor CalDAV/CardDAV con contraseña: iCloud, Fastmail, Yahoo,
 * Zimbra, Baïkal y cualquier servidor que hable el estándar.
 *
 * Es el camino de sólo calendario y contactos, al lado del de correo. El de
 * correo exige servidor IMAP y SMTP, así que una cuenta que sólo tiene DAV
 * —iCloud sin el correo de Apple, un Baïkal de la casa— no entraba por ahí.
 *
 * La dirección se escribe a mano, o se busca con `discover_dav`: la persona pone
 * su usuario y su contraseña de aplicación, y el proveedor dice dónde viven sus
 * colecciones. Los presets traen el dominio contra el que buscar cada capacidad,
 * porque iCloud y Yahoo reparten el calendario y los contactos en hosts
 * distintos. Lo que se arma acá se registra por el mismo camino que IMAP/SMTP.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	FormGroup,
	PasswordField,
	SelectField,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed, reactive, ref, watch } from 'vue';
import { type DavDiscovery, discoverDav } from '@/services/accounts.service';
import {
	buildDavCapabilities,
	DAV_PRESETS,
	type DavCapabilities,
	discoverPresetDav,
	getDavPreset,
	hasAnyDavUrl,
	isSecureDavUrl,
} from '@/utils/dav-account';

interface Props {
	open: boolean;
}
const props = defineProps<Props>();

const emit = defineEmits<{
	'update:open': [boolean];
	submit: [
		{
			providerType: string;
			displayName: string;
			capabilities: DavCapabilities;
			password: string;
		},
	];
}>();

const { t } = useI18n();

const form = reactive({
	providerType: 'carddav',
	displayName: '',
	username: '',
	password: '',
	calendarUrl: '',
	contactsUrl: '',
});

const formError = ref('');
const discovering = ref(false);
const discovery = ref<DavDiscovery | null>(null);

const preset = computed(() => getDavPreset(form.providerType));

/** Las opciones del selector, con el nombre ya traducido. */
const presetOptions = computed(() =>
	DAV_PRESETS.map((item) => ({
		value: item.providerType,
		label: t(`views.onlineAccounts.dav.presets.${item.labelKey}`),
	}))
);

const canSubmit = computed(
	() =>
		form.displayName.trim().length > 0 &&
		form.username.trim().length > 0 &&
		form.password.length > 0 &&
		hasAnyDavUrl(form) &&
		isSecureDavUrl(form.calendarUrl || form.contactsUrl)
);

const reset = () => {
	form.providerType = 'carddav';
	form.displayName = '';
	form.username = '';
	form.password = '';
	form.calendarUrl = '';
	form.contactsUrl = '';
	formError.value = '';
	discovery.value = null;
	discovering.value = false;
};

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) reset();
	}
);

// Cambiar de proveedor descarta lo encontrado y las direcciones: son de otro
// servidor, y dejarlas pegaría la libreta de iCloud a un Fastmail.
watch(
	() => form.providerType,
	() => {
		discovery.value = null;
		form.calendarUrl = '';
		form.contactsUrl = '';
		formError.value = '';
	}
);

const lookUp = async () => {
	if (!form.username.trim() || !form.password) {
		formError.value = t('views.onlineAccounts.dav.errors.credentialsFirst');
		return;
	}

	discovering.value = true;
	formError.value = '';
	try {
		const found = await discoverPresetDav(
			preset.value,
			form.username.trim(),
			form.password,
			discoverDav
		);
		discovery.value = found;
		if (found.calendar.url) form.calendarUrl = found.calendar.url;
		if (found.contacts.url) form.contactsUrl = found.contacts.url;
	} catch (err) {
		formError.value = t('views.onlineAccounts.errors.discoverFailed').replace('{0}', String(err));
	} finally {
		discovering.value = false;
	}
};

const handleSubmit = () => {
	if (!form.displayName.trim()) {
		formError.value = t('views.onlineAccounts.errors.nameRequired');
		return;
	}
	if (!form.username.trim()) {
		formError.value = t('views.onlineAccounts.errors.usernameRequired');
		return;
	}
	if (!form.password) {
		formError.value = t('views.onlineAccounts.errors.passwordRequired');
		return;
	}
	if (!hasAnyDavUrl(form)) {
		formError.value = t('views.onlineAccounts.dav.errors.urlRequired');
		return;
	}
	for (const url of [form.calendarUrl, form.contactsUrl]) {
		if (url.trim() && !isSecureDavUrl(url)) {
			formError.value = t('views.onlineAccounts.dav.errors.insecureUrl');
			return;
		}
	}

	emit('submit', {
		providerType: form.providerType,
		displayName: form.displayName.trim(),
		capabilities: buildDavCapabilities(form),
		password: form.password,
	});
};

const handleCancel = () => {
	emit('update:open', false);
};

const findings = computed(() =>
	discovery.value
		? [
				{ key: 'calendar', result: discovery.value.calendar },
				{ key: 'contacts', result: discovery.value.contacts },
			]
		: []
);
</script>

<template>
	<Dialog :open="open" @update:open="(stillOpen: boolean) => { if (!stillOpen) handleCancel(); }">
		<DialogContent size="lg">
			<DialogHeader close-style="label" :close-label="t('common.close')">
				<DialogTitle>{{ t('views.onlineAccounts.dav.title') }}</DialogTitle>
				<DialogDescription>{{ t('views.onlineAccounts.dav.description') }}</DialogDescription>
			</DialogHeader>

			<div class="mt-4 flex flex-col gap-4">
				<AlertMessage v-if="formError" tone="error">{{ formError }}</AlertMessage>

				<FormGroup :label="t('views.onlineAccounts.dav.provider')" html-for="dav-provider">
					<SelectField
						id="dav-provider"
						v-model="form.providerType"
						:options="presetOptions"
					/>
				</FormGroup>

				<FormGroup :label="t('views.onlineAccounts.displayName')" html-for="dav-display-name">
					<TextInput
						id="dav-display-name"
						v-model="form.displayName"
						:placeholder="t('views.onlineAccounts.displayNamePlaceholder')"
						autocomplete="off"
						:spellcheck="false"
					/>
				</FormGroup>

				<FormGroup :label="t('views.onlineAccounts.username')" html-for="dav-username">
					<TextInput
						id="dav-username"
						v-model="form.username"
						type="email"
						:placeholder="t('views.onlineAccounts.usernamePlaceholder')"
						autocomplete="username"
						:spellcheck="false"
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.password')"
					html-for="dav-password"
					:help="preset.appPassword ? t('views.onlineAccounts.dav.appPasswordNote') : undefined"
				>
					<PasswordField
						id="dav-password"
						v-model="form.password"
						:placeholder="t('views.onlineAccounts.passwordPlaceholder')"
						autocomplete="current-password"
						revealable
					/>
				</FormGroup>

				<p class="text-xs text-tx-muted">{{ t('views.onlineAccounts.dav.urlHelp') }}</p>

				<FormGroup :label="t('views.onlineAccounts.dav.calendarUrl')" html-for="dav-calendar-url">
					<TextInput
						id="dav-calendar-url"
						v-model="form.calendarUrl"
						type="url"
						:placeholder="t('views.onlineAccounts.dav.calendarUrlPlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<FormGroup :label="t('views.onlineAccounts.dav.contactsUrl')" html-for="dav-contacts-url">
					<TextInput
						id="dav-contacts-url"
						v-model="form.contactsUrl"
						type="url"
						:placeholder="t('views.onlineAccounts.dav.contactsUrlPlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<!-- Lo que el autodescubrimiento encontró, una capacidad por vez:
				     es muy común que un servidor tenga una y no la otra. -->
				<div v-if="findings.length" class="flex flex-col gap-2">
					<div
						v-for="finding in findings"
						:key="finding.key"
						class="rounded-corner-m border px-3 py-2 text-xs"
						:class="
							finding.result.url
								? 'border-status-success/30 bg-status-success/10 text-status-success'
								: 'border-ui-border bg-ui-surface/70 text-tx-muted'
						"
					>
						<span class="font-medium">
							{{ finding.result.url ? '✓' : '—' }}
							{{ t(`views.onlineAccounts.capabilities.${finding.key}`) }}
						</span>
						<span v-if="finding.result.url" class="break-all"> — {{ finding.result.url }}</span>
						<span v-else-if="finding.result.detail"> — {{ finding.result.detail }}</span>
					</div>
				</div>

				<div class="flex flex-wrap justify-end gap-2 pt-1">
					<button
						type="button"
						class="rounded-corner-m border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface disabled:opacity-50"
						@click="handleCancel"
					>
						{{ t('common.cancel') }}
					</button>
					<button
						type="button"
						class="rounded-corner-m border border-ui-border bg-ui-surface/60 px-4 py-2 text-sm font-medium text-tx-main transition-colors hover:bg-ui-surface disabled:opacity-50"
						:disabled="discovering"
						@click="lookUp"
					>
						{{
							discovering
								? t('views.onlineAccounts.dav.searching')
								: t('views.onlineAccounts.dav.discover')
						}}
					</button>
					<button
						type="button"
						class="rounded-corner-m border border-primary bg-primary px-4 py-2 text-sm font-medium text-tx-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
						:disabled="!canSubmit || discovering"
						@click="handleSubmit"
					>
						{{ t('views.onlineAccounts.dav.connect') }}
					</button>
				</div>
			</div>
		</DialogContent>
	</Dialog>
</template>
