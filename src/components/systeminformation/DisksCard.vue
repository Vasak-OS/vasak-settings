<script setup lang="ts">
import MountedDiskCard from '@/components/systeminformation/MountedDiskCard.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import type { DiskInfo } from '@/types/system';

defineProps<{
	disks: DiskInfo[];
}>();
</script>

<template>
	<SectionCard>
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Discos</h2>
			<span class="text-sm text-tx-muted">{{ disks.length }} discos agrupados</span>
		</div>

		<div class="mt-4 grid gap-3">
			<MountedDiskCard v-for="disk in disks" :key="`${disk.device}-${disk.mountpoint}-${disk.mountpoints.join('|')}`" :disk="disk" />
		</div>
	</SectionCard>
</template>
