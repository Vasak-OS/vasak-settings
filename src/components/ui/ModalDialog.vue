<script setup lang="ts">
/**
 * Un modal de Configuración: el de la librería, con la forma de acá.
 *
 * Lo difícil ya no vive en este archivo. El foco que entra al abrir, el Tab
 * que da la vuelta adentro en vez de seguir recorriendo la pantalla que quedó
 * detrás del velo, el foco que vuelve a donde estaba al cerrar, Escape, y el
 * nombre atado al título: todo eso es de `Dialog`. Esta copia no hacía ninguna
 * de las cinco cosas —ni siquiera se anunciaba como diálogo— y su única salida
 * con teclado era llegar al botón de cerrar con el Tab desde el principio de
 * la página.
 *
 * Lo que Configuración pone encima es su forma: más ancho que el diálogo por
 * omisión, con el ancho elegible por quien lo usa, y el botón de cerrar
 * escrito arriba a la derecha en vez de en un pie.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@vasakgroup/vue-libvasak';

const { t } = useI18n();

interface Props {
	open: boolean;
	title: string;
	description?: string;
	maxWidthClass?: string;
}

withDefaults(defineProps<Props>(), {
	description: '',
	maxWidthClass: 'max-w-2xl',
});

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Dialog :open="open" @update:open="(sigue: boolean) => !sigue && emit('close')">
    <DialogContent :class="['w-full', maxWidthClass]">
      <DialogHeader class="flex items-start justify-between gap-4">
        <div>
          <DialogTitle class="font-semibold text-lg text-tx-primary">{{ title }}</DialogTitle>
          <DialogDescription v-if="description" class="mt-1 text-sm">
            {{ description }}
          </DialogDescription>
        </div>

        <button
          type="button"
          class="rounded-corner border border-ui-border bg-ui-surface/60 px-3 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface hover:text-tx-primary"
          @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </DialogHeader>

      <div class="mt-4">
        <slot />
      </div>
    </DialogContent>
  </Dialog>
</template>
