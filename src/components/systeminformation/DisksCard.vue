<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Panel } from '@vasakgroup/vue-libvasak';
import MountedDiskCard from '@/components/systeminformation/MountedDiskCard.vue';
import type { DiskInfo } from '@/types/system';

const { t } = useI18n();

defineProps<{
	disks: DiskInfo[];
}>();
</script>

<template>
	<Panel as="article">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">{{ t('views.home.cards.disks') }}</h2>
			<span class="text-sm text-tx-muted">{{ disks.length }} discos agrupados</span>
		</div>

		<div class="mt-4 grid gap-3">
			<MountedDiskCard v-for="disk in disks" :key="`${disk.device}-${disk.mountpoint}-${disk.mountpoints.join('|')}`" :disk="disk" />
		</div>
	</Panel>
</template>
