import { invoke } from '@tauri-apps/api/core';

export interface AccountInfo {
	id: string;
	provider: string;
	display_name: string;
	metadata: Record<string, unknown>;
	created_at: string;
}

export const registerNewAccount = (
	provider: string,
	metadata: Record<string, unknown>,
	secret: string
): Promise<void> => {
	return invoke<void>('register_new_account', {
		provider,
		metadata,
		secret,
	});
};

export const listAccounts = (): Promise<AccountInfo[]> => {
	return invoke<AccountInfo[]>('list_accounts');
};

export const removeAccount = (accountId: string): Promise<void> => {
	return invoke<void>('remove_account', { accountId });
};

export const accountManagerPing = (): Promise<string> => {
	return invoke<string>('account_manager_ping');
};

export const getAccountData = (accountId: string, capability: string): Promise<string> => {
	return invoke<string>('get_account_data', { accountId, capability });
};

export const getAccessToken = (accountId: string, capability: string): Promise<string> => {
	return invoke<string>('get_access_token', { accountId, capability });
};
