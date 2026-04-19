<script setup lang="ts">
import type { VpnProfile } from '@/services/network.service';

interface Props {
	profile: VpnProfile;
	isActive: boolean;
	isConnected: boolean;
	isLoading: boolean;
	actionProfileUuid: string | null;
}

interface Emits {
	connect: [];
	disconnect: [];
	edit: [];
	delete: [];
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<template>
	<li class="rounded-corner border border-ui-border bg-ui-surface/35 p-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-sm font-medium text-tx-primary">{{ profile.id }}</p>
				<p class="text-xs text-tx-muted">
					{{ profile.vpn_type }} · UUID: {{ profile.uuid }}
					<span v-if="profile.autoconnect"> · autoconnect</span>
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					v-if="isActive && isConnected"
					class="rounded-corner border border-ui-border px-2 py-1 text-xs text-tx-muted hover:bg-ui-surface disabled:cursor-not-allowed disabled:opacity-50"
					@click="$emit('disconnect')"
					:disabled="actionProfileUuid === profile.uuid"
				>
					{{ actionProfileUuid === profile.uuid ? 'Desconectando...' : 'Desconectar' }}
				</button>
				<button
					v-else
					class="rounded-corner border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
					@click="$emit('connect')"
					:disabled="actionProfileUuid === profile.uuid"
				>
					{{ actionProfileUuid === profile.uuid ? 'Conectando...' : 'Conectar' }}
				</button>
				<button
					class="rounded-corner border border-ui-border px-2 py-1 text-xs text-tx-muted hover:bg-ui-surface"
					@click="$emit('edit')"
				>
					Editar
				</button>
				<button
					class="rounded-corner border border-status-danger/20 bg-status-danger/10 px-2 py-1 text-xs text-status-danger hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
					@click="$emit('delete')"
					:disabled="actionProfileUuid === profile.uuid"
				>
					Eliminar
				</button>
			</div>
		</div>
	</li>
</template>
