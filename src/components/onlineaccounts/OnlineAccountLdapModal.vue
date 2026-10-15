<script setup lang="ts">
/**
 * Dar de alta un directorio LDAP / Active Directory: la libreta de contactos de
 * la empresa, de sólo lectura.
 *
 * Es el gemelo del alta «Otro servidor (CalDAV/CardDAV)»: un alta manual, sin
 * flujo de navegador ni nada que registrar. La persona escribe la dirección del
 * servidor, el usuario con el que buscar (el DN de enlace), su contraseña y la
 * base de búsqueda; opcionalmente, un filtro y la lista de atributos. Lo que se
 * arma acá se registra por el mismo camino que IMAP/SMTP y DAV
 * (`register_password_account`): el servicio guarda la configuración y la
 * contraseña aparte, cifrada en el llavero.
 *
 * La contraseña **jamás** va en la configuración: sale por el campo `password`
 * del evento `submit` y el servicio la guarda bajo la clave `access`. La lógica
 * de armado vive en `utils/ldap-account.ts`, que es lo que se prueba.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	FormGroup,
	PasswordField,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed, reactive, ref, watch } from 'vue';
import {
	buildLdapCapabilities,
	canBuildLdap,
	isValidLdapUrl,
	type LdapCapabilities,
	ldapUrlCanBePlaintext,
} from '@/utils/ldap-account';

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
			capabilities: LdapCapabilities;
			password: string;
		},
	];
}>();

const { t } = useI18n();

const form = reactive({
	displayName: '',
	url: '',
	bindDn: '',
	password: '',
	searchBase: '',
	searchFilter: '',
	attributes: '',
	allowInsecure: false,
});

const formError = ref('');

/** Sólo `ldap://` puede ir en claro: para él tiene sentido la casilla y su aviso. */
const canBePlaintext = computed(() => ldapUrlCanBePlaintext(form.url));

const canSubmit = computed(
	() => form.displayName.trim().length > 0 && canBuildLdap(form) && form.password.length > 0
);

const reset = () => {
	form.displayName = '';
	form.url = '';
	form.bindDn = '';
	form.password = '';
	form.searchBase = '';
	form.searchFilter = '';
	form.attributes = '';
	form.allowInsecure = false;
	formError.value = '';
};

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) reset();
	}
);

const handleSubmit = () => {
	if (!form.displayName.trim()) {
		formError.value = t('views.onlineAccounts.errors.nameRequired');
		return;
	}
	if (!isValidLdapUrl(form.url)) {
		formError.value = t('views.onlineAccounts.ldap.errors.invalidUrl');
		return;
	}
	if (!form.bindDn.trim()) {
		formError.value = t('views.onlineAccounts.ldap.errors.bindDnRequired');
		return;
	}
	if (!form.password) {
		formError.value = t('views.onlineAccounts.errors.passwordRequired');
		return;
	}
	if (!form.searchBase.trim()) {
		formError.value = t('views.onlineAccounts.ldap.errors.searchBaseRequired');
		return;
	}

	emit('submit', {
		providerType: 'ldap',
		displayName: form.displayName.trim(),
		capabilities: buildLdapCapabilities(form),
		password: form.password,
	});
};

const handleCancel = () => {
	emit('update:open', false);
};
</script>

<template>
	<Dialog :open="open" @update:open="(stillOpen: boolean) => { if (!stillOpen) handleCancel(); }">
		<DialogContent size="lg">
			<DialogHeader close-style="label" :close-label="t('common.close')">
				<DialogTitle>{{ t('views.onlineAccounts.ldap.title') }}</DialogTitle>
				<DialogDescription>{{ t('views.onlineAccounts.ldap.description') }}</DialogDescription>
			</DialogHeader>

			<div class="mt-4 flex flex-col gap-4">
				<AlertMessage v-if="formError" tone="error">{{ formError }}</AlertMessage>

				<FormGroup :label="t('views.onlineAccounts.displayName')" html-for="ldap-display-name">
					<TextInput
						id="ldap-display-name"
						v-model="form.displayName"
						:placeholder="t('views.onlineAccounts.ldap.displayNamePlaceholder')"
						autocomplete="off"
						:spellcheck="false"
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.ldap.url')"
					html-for="ldap-url"
					:help="t('views.onlineAccounts.ldap.urlHelp')"
				>
					<TextInput
						id="ldap-url"
						v-model="form.url"
						:placeholder="t('views.onlineAccounts.ldap.urlPlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.ldap.bindDn')"
					html-for="ldap-bind-dn"
					:help="t('views.onlineAccounts.ldap.bindDnHelp')"
				>
					<TextInput
						id="ldap-bind-dn"
						v-model="form.bindDn"
						:placeholder="t('views.onlineAccounts.ldap.bindDnPlaceholder')"
						autocomplete="username"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<FormGroup :label="t('views.onlineAccounts.password')" html-for="ldap-password">
					<PasswordField
						id="ldap-password"
						v-model="form.password"
						:placeholder="t('views.onlineAccounts.ldap.passwordPlaceholder')"
						autocomplete="current-password"
						revealable
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.ldap.searchBase')"
					html-for="ldap-search-base"
					:help="t('views.onlineAccounts.ldap.searchBaseHelp')"
				>
					<TextInput
						id="ldap-search-base"
						v-model="form.searchBase"
						:placeholder="t('views.onlineAccounts.ldap.searchBasePlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.ldap.searchFilter')"
					html-for="ldap-search-filter"
					:help="t('views.onlineAccounts.ldap.searchFilterHelp')"
				>
					<TextInput
						id="ldap-search-filter"
						v-model="form.searchFilter"
						:placeholder="t('views.onlineAccounts.ldap.searchFilterPlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<FormGroup
					:label="t('views.onlineAccounts.ldap.attributes')"
					html-for="ldap-attributes"
					:help="t('views.onlineAccounts.ldap.attributesHelp')"
				>
					<TextInput
						id="ldap-attributes"
						v-model="form.attributes"
						:placeholder="t('views.onlineAccounts.ldap.attributesPlaceholder')"
						autocomplete="off"
						:spellcheck="false"
						mono
					/>
				</FormGroup>

				<div class="flex flex-col gap-2">
					<Checkbox
						v-model="form.allowInsecure"
						:label="t('views.onlineAccounts.ldap.allowInsecure')"
						:description="t('views.onlineAccounts.ldap.allowInsecureHelp')"
					/>
					<!-- El aviso sólo cuando de verdad aplica: con `ldaps://` o
					     `ldapi://` la casilla no tiene efecto, así que marcarla ahí no
					     expone nada y no hay por qué alarmar. -->
					<AlertMessage v-if="form.allowInsecure && canBePlaintext" tone="warning">
						{{ t('views.onlineAccounts.ldap.allowInsecureWarning') }}
					</AlertMessage>
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
						class="rounded-corner-m border border-primary bg-primary px-4 py-2 text-sm font-medium text-tx-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
						:disabled="!canSubmit"
						@click="handleSubmit"
					>
						{{ t('views.onlineAccounts.ldap.connect') }}
					</button>
				</div>
			</div>
		</DialogContent>
	</Dialog>
</template>
