<script setup lang="ts">
/**
 * Las filas de la sección «Modo juego», una por acción del registro.
 *
 * No sabe leer ni escribir el archivo: recibe el estado y avisa qué se tocó.
 * Así se puede montar en una prueba sin Tauri, y la vista se queda con el
 * cableado.
 *
 * Cada fila es un `SettingRow` de la librería, que ya se acomoda por el ancho
 * que le dan (`@container`): a la derecha el interruptor cuando entra, debajo
 * del texto cuando la columna es angosta.
 *
 * Una acción que necesita algo que no está instalado **no se esconde ni se
 * rompe**: se ve con su interruptor deshabilitado y, debajo de toda la fila, la
 * marca «no disponible» y cómo instalarlo —debajo y no al lado del interruptor,
 * para no robarle ancho a la explicación en una columna angosta—. La fila no se atenúa entera —sólo el interruptor— para que
 * la indicación de cómo instalarlo se lea con todo su contraste.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Badge, SettingRow, SwitchToggle, ThemeIcon } from '@vasakgroup/vue-libvasak';
import {
	type GameModeAction,
	type GameModeActionKey,
	type GameModeRequirement,
	type GameModeRequirements,
	type GameModeSettings,
	isActionAvailable,
	needsInstall,
} from '@/utils/game-mode';

interface Props {
	actions: readonly GameModeAction[];
	settings: GameModeSettings;
	installed: GameModeRequirements;
	/** La acción que se está guardando, para no aceptar otro clic encima. */
	saving: GameModeActionKey | null;
	/**
	 * Si ya se leyó el archivo. Antes, los interruptores muestran los valores
	 * por omisión pero no se pueden tocar: un clic ahí escribiría sobre algo
	 * que todavía no se vio.
	 */
	loaded?: boolean;
}

const props = withDefaults(defineProps<Props>(), { loaded: true });

const emit = defineEmits<{ toggle: [key: GameModeActionKey, enabled: boolean] }>();

const { t } = useI18n();

/** El comando que instala lo que falta, por requisito. No se traduce. */
const INSTALL_COMMANDS: Record<GameModeRequirement, string> = {
	gamemode: 'sudo pacman -S gamemode',
};

function available(action: GameModeAction): boolean {
	return isActionAvailable(action, props.installed);
}

/** Una acción no disponible se muestra apagada: no va a hacer nada. */
function isOn(action: GameModeAction): boolean {
	return available(action) && props.settings[action.key as GameModeActionKey];
}
</script>

<template>
	<ul class="flex min-w-0 flex-col divide-y divide-ui-line" :aria-busy="!loaded">
		<li
			v-for="action in actions"
			:key="action.key"
			class="min-w-0 py-3 first:pt-0 last:pb-0"
			:data-game-mode-action="action.key"
			:data-available="available(action)"
		>
			<SettingRow
				:label="t(action.titleKey)"
				:description="t(action.descriptionKey)"
			>
				<template #leading>
					<ThemeIcon :name="action.icon" :size="24" />
				</template>

				<SwitchToggle
					:label="t(action.titleKey)"
					:model-value="isOn(action)"
					:disabled="!loaded || !available(action) || saving !== null"
					@update:model-value="emit('toggle', action.key as GameModeActionKey, $event)"
				/>

				<template v-if="!available(action)" #footer>
					<div class="flex min-w-0 flex-col items-start gap-1" data-unavailable>
						<Badge tone="neutral" size="sm" :label="t('views.gameMode.unavailable')" />
						<p
							v-if="action.requires && needsInstall(action, installed)"
							data-install-hint
							class="min-w-0 break-words text-body-xs text-tx-muted"
						>
							{{ t('views.gameMode.installHint') }}
							<code class="block break-words font-mono text-tx-main">{{
								INSTALL_COMMANDS[action.requires]
							}}</code>
						</p>
					</div>
				</template>
			</SettingRow>
		</li>
	</ul>
</template>
