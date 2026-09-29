import { invoke } from '@tauri-apps/api/core';

type UserAccountSummary = {
	username: string;
	real_name: string;
	is_current: boolean;
};

/**
 * El nombre de quien tiene la sesión abierta: el nombre real si lo cargó, y si
 * no, el de la cuenta.
 *
 * Sale de la misma lista que usa la pantalla de Usuarios (accountsservice por
 * D-Bus). Si no se puede leer devuelve una cadena vacía: es para firmar un
 * esquema, y un esquema sin autor sigue siendo un esquema.
 */
export async function getCurrentUserName(): Promise<string> {
	try {
		const users = await invoke<UserAccountSummary[]>('list_users');
		const current = users.find((user) => user.is_current);
		return current?.real_name.trim() || current?.username || '';
	} catch {
		return '';
	}
}
