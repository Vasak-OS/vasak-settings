<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';

interface UserAccount {
	uid: number;
	username: string;
	real_name: string;
	is_admin: boolean;
	icon_file: string;
	locked: boolean;
	home_directory: string;
	shell: string;
	is_current: boolean;
}

const { t } = useI18n();

const users = ref<UserAccount[]>([]);
const error = ref('');
const success = ref('');
const busy = ref(false);
const expanded = ref<number | null>(null);

const showCreate = ref(false);
const newUser = ref({ username: '', realName: '', admin: false, password: '', confirm: '' });

const passwordDrafts = ref<Record<number, { password: string; confirm: string }>>({});
const deleteTarget = ref<UserAccount | null>(null);
const deleteFiles = ref(false);

const MIN_PASSWORD = 8;

const adminCount = computed(() => users.value.filter((user) => user.is_admin).length);

const createValid = computed(() => {
	const draft = newUser.value;
	return (
		draft.username.trim().length > 0 &&
		draft.password.length >= MIN_PASSWORD &&
		draft.password === draft.confirm
	);
});

function draftFor(uid: number) {
	if (!passwordDrafts.value[uid]) {
		passwordDrafts.value[uid] = { password: '', confirm: '' };
	}
	return passwordDrafts.value[uid];
}

function flash(message: string) {
	success.value = message;
	setTimeout(() => {
		success.value = '';
	}, 3000);
}

async function load() {
	try {
		users.value = await invoke<UserAccount[]>('list_users');
		error.value = '';
	} catch (err) {
		error.value = String(err);
	}
}

onMounted(load);

/** Every change goes through polkit, so a refusal is normal and must be shown. */
async function run(command: string, args: Record<string, unknown>, done: string): Promise<boolean> {
	busy.value = true;
	error.value = '';

	try {
		await invoke(command, args);
		await load();
		flash(done);
		return true;
	} catch (err) {
		error.value = String(err);
		await load();
		return false;
	} finally {
		busy.value = false;
	}
}

async function createUser() {
	if (!createValid.value) return;

	const draft = newUser.value;
	const ok = await run(
		'create_user',
		{
			username: draft.username.trim(),
			realName: draft.realName.trim(),
			admin: draft.admin,
			password: draft.password,
		},
		t('views.users.created').replace('{0}', draft.username.trim())
	);

	if (ok) {
		newUser.value = { username: '', realName: '', admin: false, password: '', confirm: '' };
		showCreate.value = false;
	}
}

async function changePassword(user: UserAccount) {
	const draft = draftFor(user.uid);

	if (draft.password.length < MIN_PASSWORD || draft.password !== draft.confirm) return;

	const ok = await run(
		'set_user_password',
		{ uid: user.uid, password: draft.password },
		t('views.users.passwordUpdated').replace('{0}', user.username)
	);

	if (ok) {
		passwordDrafts.value[user.uid] = { password: '', confirm: '' };
	}
}

function renameUser(user: UserAccount, realName: string) {
	if (realName === user.real_name) return;
	void run('set_user_real_name', { uid: user.uid, realName }, t('views.users.nameUpdated'));
}

function toggleAdmin(user: UserAccount, value: boolean) {
	void run(
		'set_user_admin',
		{ uid: user.uid, admin: value },
		value ? t('views.users.nowAdmin') : t('views.users.nowStandard')
	);
}

function toggleLocked(user: UserAccount, value: boolean) {
	void run(
		'set_user_locked',
		{ uid: user.uid, locked: value },
		value ? t('views.users.accountLocked') : t('views.users.accountUnlocked')
	);
}

async function confirmDelete() {
	const target = deleteTarget.value;
	if (!target) return;

	const ok = await run(
		'delete_user',
		{ uid: target.uid, removeFiles: deleteFiles.value },
		t('views.users.deleted').replace('{0}', target.username)
	);

	if (ok) {
		deleteTarget.value = null;
		deleteFiles.value = false;
	}
}

/** Demoting the last administrator would leave nobody able to administer. */
function canDemote(user: UserAccount): boolean {
	if (user.is_current) return false;
	return !(user.is_admin && adminCount.value <= 1);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.users.title')"
			:description="t('views.users.description')"
		>
			<template #actions>
				<button
					type="button"
					class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
					@click="showCreate = !showCreate"
				>
					{{ showCreate ? t('common.cancel') : t('views.users.addUser') }}
				</button>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" tone="error" :message="error" />
		<AlertMessage v-if="success" tone="success" :message="success" />

		<SectionCard v-if="showCreate">
			<h3 class="text-base font-medium">{{ t('views.users.newAccount') }}</h3>
			<div class="mt-3 grid gap-4 sm:grid-cols-2">
				<FormGroup :label="t('views.users.username')">
					<TextInput
						v-model="newUser.username"
						autocomplete="off"
						:placeholder="t('views.users.usernamePlaceholder')"
					/>
				</FormGroup>
				<FormGroup :label="t('views.users.fullName')">
					<TextInput
						v-model="newUser.realName"
						autocomplete="off"
						:placeholder="t('views.users.fullNamePlaceholder')"
					/>
				</FormGroup>
				<FormGroup :label="t('views.users.passwordMin').replace('{0}', String(MIN_PASSWORD))">
					<TextInput
						v-model="newUser.password"
						type="password"
						autocomplete="new-password"
					/>
				</FormGroup>
				<FormGroup :label="t('views.users.repeatPassword')">
					<TextInput
						v-model="newUser.confirm"
						type="password"
						autocomplete="new-password"
						:invalid="Boolean(newUser.confirm && newUser.confirm !== newUser.password)"
					/>
				</FormGroup>
			</div>

			<div class="mt-4 flex items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<SwitchToggle :label="t('views.users.admin')" :is-on="newUser.admin" @toggle="newUser.admin = $event" />
					<span class="text-sm text-tx-primary">{{ t('views.users.admin') }}</span>
				</div>
				<button
					type="button"
					:disabled="!createValid || busy"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="createUser"
				>
					{{ t('views.users.createAccount') }}
				</button>
			</div>
		</SectionCard>

		<SectionCard v-for="user in users" :key="user.uid">
			<div class="flex items-center gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="truncate text-base font-medium text-tx-primary">
							{{ user.real_name || user.username }}
						</span>
						<code class="rounded bg-ui-surface/70 px-1.5 py-0.5 text-[11px] text-tx-muted">
							{{ user.username }}
						</code>
						<span
							v-if="user.is_admin"
							class="rounded-full border border-ui-border bg-primary/15 px-2 py-0.5 text-[11px] font-medium"
						>
							{{ t('views.users.admin') }}
						</span>
						<span
							v-if="user.is_current"
							class="rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[11px] text-tx-muted"
						>
							{{ t('views.users.yourAccount') }}
						</span>
						<span
							v-if="user.locked"
							class="rounded-full border border-status-danger/30 bg-status-danger/10 px-2 py-0.5 text-[11px] text-status-danger"
						>
							{{ t('views.users.lockedBadge') }}
						</span>
					</div>
					<p class="mt-0.5 text-xs text-tx-muted">{{ user.home_directory }}</p>
				</div>

				<button
					type="button"
					class="shrink-0 rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-xs font-medium hover:bg-ui-surface"
					@click="expanded = expanded === user.uid ? null : user.uid"
				>
					{{ expanded === user.uid ? t('common.close') : t('common.edit') }}
				</button>
			</div>

			<div v-if="expanded === user.uid" class="mt-4 border-t border-ui-border pt-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup :label="t('views.users.fullName')">
						<TextInput
							lazy
							:model-value="user.real_name"
							:disabled="busy"
							@update:model-value="renameUser(user, $event)"
						/>
					</FormGroup>
					<FormGroup label="Shell">
						<TextInput :model-value="user.shell" readonly />
					</FormGroup>
				</div>

				<div class="mt-4 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h4 class="text-sm font-medium">{{ t('views.users.admin') }}</h4>
						<p class="text-xs text-tx-muted">
							<template v-if="user.is_current">
								{{ t('views.users.adminOwnAccount') }}
							</template>
							<template v-else-if="user.is_admin && adminCount <= 1">
								{{ t('views.users.adminOnlyOne') }}
							</template>
							<template v-else>{{ t('views.users.adminExplanation') }}</template>
						</p>
					</div>
					<SwitchToggle :label="t('views.users.admin')"
						:is-on="user.is_admin"
						:disabled="busy || (user.is_admin && !canDemote(user))"
						@toggle="toggleAdmin(user, $event)"
					/>
				</div>

				<div class="mt-4 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h4 class="text-sm font-medium">{{ t('views.users.lockedTitle') }}</h4>
						<p class="text-xs text-tx-muted">{{ t('views.users.lockedDescription') }}</p>
					</div>
					<SwitchToggle :label="t('views.users.lockedTitle')"
						:is-on="user.locked"
						:disabled="busy || user.is_current"
						@toggle="toggleLocked(user, $event)"
					/>
				</div>

				<div class="mt-4 border-t border-ui-border pt-4">
					<h4 class="text-sm font-medium">{{ t('views.users.changePassword') }}</h4>
					<div class="mt-2 grid gap-4 sm:grid-cols-2">
						<FormGroup :label="t('views.users.newPasswordMin').replace('{0}', String(MIN_PASSWORD))">
							<TextInput
								v-model="draftFor(user.uid).password"
								type="password"
								autocomplete="new-password"
							/>
						</FormGroup>
						<FormGroup :label="t('views.users.repeat')">
							<TextInput
								v-model="draftFor(user.uid).confirm"
								type="password"
								autocomplete="new-password"
							/>
						</FormGroup>
					</div>
					<div class="mt-3 flex justify-end">
						<button
							type="button"
							:disabled="
								busy ||
								draftFor(user.uid).password.length < MIN_PASSWORD ||
								draftFor(user.uid).password !== draftFor(user.uid).confirm
							"
							class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
							@click="changePassword(user)"
						>
							{{ t('views.users.changePassword') }}
						</button>
					</div>
				</div>

				<div v-if="!user.is_current" class="mt-4 border-t border-ui-border pt-4">
					<button
						type="button"
						:disabled="busy"
						class="rounded-corner border border-status-danger/30 bg-status-danger/10 px-4 py-2 text-sm font-medium text-status-danger hover:bg-status-danger/20 disabled:opacity-50"
						@click="deleteTarget = user"
					>
						{{ t('views.users.deleteAccount') }}
					</button>
				</div>
			</div>
		</SectionCard>

		<SectionCard v-if="deleteTarget">
			<h3 class="text-base font-medium text-status-danger">
				{{ t('views.users.deleteTitle').replace('{0}', deleteTarget.username) }}
			</h3>
			<p class="mt-1 text-sm text-tx-muted">{{ t('views.users.deleteWarning') }}</p>

			<label class="mt-3 flex items-center gap-2 text-sm">
				<input v-model="deleteFiles" type="checkbox" />
				{{ t('views.users.deleteHome').replace('{0}', deleteTarget.home_directory) }}
			</label>

			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface"
					@click="deleteTarget = null"
				>
					{{ t('common.cancel') }}
				</button>
				<button
					type="button"
					:disabled="busy"
					class="rounded-corner bg-status-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="confirmDelete"
				>
					{{ t('common.delete') }}
				</button>
			</div>
		</SectionCard>
	</div>
</template>
