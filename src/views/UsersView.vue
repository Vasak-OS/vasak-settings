<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

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
		`Cuenta «${draft.username.trim()}» creada`
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
		`Contraseña de «${user.username}» actualizada`
	);

	if (ok) {
		passwordDrafts.value[user.uid] = { password: '', confirm: '' };
	}
}

function renameUser(user: UserAccount, realName: string) {
	if (realName === user.real_name) return;
	void run('set_user_real_name', { uid: user.uid, realName }, 'Nombre actualizado');
}

function toggleAdmin(user: UserAccount, value: boolean) {
	void run(
		'set_user_admin',
		{ uid: user.uid, admin: value },
		value ? 'Ahora es administrador' : 'Ahora es cuenta estándar'
	);
}

function toggleLocked(user: UserAccount, value: boolean) {
	void run(
		'set_user_locked',
		{ uid: user.uid, locked: value },
		value ? 'Cuenta bloqueada' : 'Cuenta desbloqueada'
	);
}

async function confirmDelete() {
	const target = deleteTarget.value;
	if (!target) return;

	const ok = await run(
		'delete_user',
		{ uid: target.uid, removeFiles: deleteFiles.value },
		`Cuenta «${target.username}» eliminada`
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
			section="Sistema"
			title="Usuarios"
			description="Cuentas del equipo, contraseñas y permisos de administración."
		>
			<template #actions>
				<button
					type="button"
					class="rounded-corner bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
					@click="showCreate = !showCreate"
				>
					{{ showCreate ? 'Cancelar' : 'Añadir usuario' }}
				</button>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" tone="error" :message="error" />
		<AlertMessage v-if="success" tone="success" :message="success" />

		<SectionCard v-if="showCreate">
			<h3 class="text-base font-medium">Nueva cuenta</h3>
			<div class="mt-3 grid gap-4 sm:grid-cols-2">
				<FormGroup label="Nombre de usuario">
					<input
						v-model="newUser.username"
						type="text"
						autocomplete="off"
						placeholder="maria"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</FormGroup>
				<FormGroup label="Nombre completo">
					<input
						v-model="newUser.realName"
						type="text"
						autocomplete="off"
						placeholder="María Pérez"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</FormGroup>
				<FormGroup :label="`Contraseña (mínimo ${MIN_PASSWORD})`">
					<input
						v-model="newUser.password"
						type="password"
						autocomplete="new-password"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
					/>
				</FormGroup>
				<FormGroup label="Repetir contraseña">
					<input
						v-model="newUser.confirm"
						type="password"
						autocomplete="new-password"
						class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
						:class="{ '!border-status-danger': newUser.confirm && newUser.confirm !== newUser.password }"
					/>
				</FormGroup>
			</div>

			<div class="mt-4 flex items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<SwitchToggle :is-on="newUser.admin" @toggle="newUser.admin = $event" />
					<span class="text-sm text-tx-primary">Administrador</span>
				</div>
				<button
					type="button"
					:disabled="!createValid || busy"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="createUser"
				>
					Crear cuenta
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
							Administrador
						</span>
						<span
							v-if="user.is_current"
							class="rounded-full border border-ui-border bg-ui-surface/70 px-2 py-0.5 text-[11px] text-tx-muted"
						>
							Tu cuenta
						</span>
						<span
							v-if="user.locked"
							class="rounded-full border border-status-danger/30 bg-status-danger/10 px-2 py-0.5 text-[11px] text-status-danger"
						>
							Bloqueada
						</span>
					</div>
					<p class="mt-0.5 text-xs text-tx-muted">{{ user.home_directory }}</p>
				</div>

				<button
					type="button"
					class="shrink-0 rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-1.5 text-xs font-medium hover:bg-ui-surface"
					@click="expanded = expanded === user.uid ? null : user.uid"
				>
					{{ expanded === user.uid ? 'Cerrar' : 'Editar' }}
				</button>
			</div>

			<div v-if="expanded === user.uid" class="mt-4 border-t border-ui-border pt-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<FormGroup label="Nombre completo">
						<input
							type="text"
							:value="user.real_name"
							:disabled="busy"
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							@change="renameUser(user, ($event.target as HTMLInputElement).value)"
						/>
					</FormGroup>
					<FormGroup label="Shell">
						<input
							type="text"
							:value="user.shell"
							readonly
							class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm opacity-60"
						/>
					</FormGroup>
				</div>

				<div class="mt-4 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h4 class="text-sm font-medium">Administrador</h4>
						<p class="text-xs text-tx-muted">
							<template v-if="user.is_current">
								No podés cambiar los permisos de tu propia cuenta.
							</template>
							<template v-else-if="user.is_admin && adminCount <= 1">
								Es el único administrador del equipo.
							</template>
							<template v-else>Puede instalar software y cambiar ajustes del sistema.</template>
						</p>
					</div>
					<SwitchToggle
						:is-on="user.is_admin"
						:disabled="busy || (user.is_admin && !canDemote(user))"
						@toggle="toggleAdmin(user, $event)"
					/>
				</div>

				<div class="mt-4 flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<h4 class="text-sm font-medium">Cuenta bloqueada</h4>
						<p class="text-xs text-tx-muted">Impide iniciar sesión sin borrar nada.</p>
					</div>
					<SwitchToggle
						:is-on="user.locked"
						:disabled="busy || user.is_current"
						@toggle="toggleLocked(user, $event)"
					/>
				</div>

				<div class="mt-4 border-t border-ui-border pt-4">
					<h4 class="text-sm font-medium">Cambiar contraseña</h4>
					<div class="mt-2 grid gap-4 sm:grid-cols-2">
						<FormGroup :label="`Nueva (mínimo ${MIN_PASSWORD})`">
							<input
								v-model="draftFor(user.uid).password"
								type="password"
								autocomplete="new-password"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>
						<FormGroup label="Repetir">
							<input
								v-model="draftFor(user.uid).confirm"
								type="password"
								autocomplete="new-password"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
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
							Cambiar contraseña
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
						Eliminar cuenta
					</button>
				</div>
			</div>
		</SectionCard>

		<SectionCard v-if="deleteTarget">
			<h3 class="text-base font-medium text-status-danger">
				Eliminar «{{ deleteTarget.username }}»
			</h3>
			<p class="mt-1 text-sm text-tx-muted">Esta acción no se puede deshacer.</p>

			<label class="mt-3 flex items-center gap-2 text-sm">
				<input v-model="deleteFiles" type="checkbox" />
				Borrar también su carpeta personal ({{ deleteTarget.home_directory }})
			</label>

			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-corner border border-ui-border bg-ui-surface/70 px-4 py-2 text-sm font-medium hover:bg-ui-surface"
					@click="deleteTarget = null"
				>
					Cancelar
				</button>
				<button
					type="button"
					:disabled="busy"
					class="rounded-corner bg-status-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="confirmDelete"
				>
					Eliminar
				</button>
			</div>
		</SectionCard>
	</div>
</template>
