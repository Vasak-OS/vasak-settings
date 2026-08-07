export interface SpecialKeyDef {
	keyToken: string;
	label: string;
	icon: string;
	defaultTarget: string;
	description: string;
}

export const SPECIAL_KEYS: SpecialKeyDef[] = [
	{
		keyToken: 'KEY_VOLUMEUP',
		label: 'Subir volumen',
		icon: 'audio-volume-high-symbolic',
		defaultTarget: 'pactl set-sink-volume @DEFAULT_SINK@ +5%',
		description: 'Aumenta el volumen del audio del sistema',
	},
	{
		keyToken: 'KEY_VOLUMEDOWN',
		label: 'Bajar volumen',
		icon: 'audio-volume-low-symbolic',
		defaultTarget: 'pactl set-sink-volume @DEFAULT_SINK@ -5%',
		description: 'Reduce el volumen del audio del sistema',
	},
	{
		keyToken: 'KEY_MUTE',
		label: 'Silenciar audio',
		icon: 'audio-volume-muted-symbolic',
		defaultTarget: 'pactl set-sink-mute @DEFAULT_SINK@ toggle',
		description: 'Activa o desactiva el silencio del audio',
	},
	{
		keyToken: 'KEY_MICMUTE',
		label: 'Silenciar micrófono',
		icon: 'microphone-sensitivity-muted-symbolic',
		defaultTarget: 'pactl set-source-mute @DEFAULT_SOURCE@ toggle',
		description: 'Activa o desactiva el silencio del micrófono',
	},
	{
		keyToken: 'KEY_CAMERA',
		label: 'Alternar cámara',
		icon: 'camera-web-symbolic',
		defaultTarget: '',
		description: 'Enciende o apaga la cámara integrada',
	},
	{
		keyToken: 'KEY_BRIGHTNESSUP',
		label: 'Subir brillo',
		icon: 'display-brightness-symbolic',
		defaultTarget: 'brightnessctl s +10%',
		description: 'Aumenta el brillo de la pantalla',
	},
	{
		keyToken: 'KEY_BRIGHTNESSDOWN',
		label: 'Bajar brillo',
		icon: 'display-brightness-symbolic',
		defaultTarget: 'brightnessctl s 10%-',
		description: 'Reduce el brillo de la pantalla',
	},
	{
		keyToken: 'KEY_PLAYPAUSE',
		label: 'Reproducir / Pausar',
		icon: 'media-playback-start-symbolic',
		defaultTarget: 'playerctl play-pause',
		description: 'Reproduce o pausa el reproductor multimedia activo',
	},
	{
		keyToken: 'KEY_STOPCD',
		label: 'Detener reproducción',
		icon: 'media-playback-stop-symbolic',
		defaultTarget: 'playerctl stop',
		description: 'Detiene la reproducción multimedia',
	},
	{
		keyToken: 'KEY_PREVIOUSSONG',
		label: 'Canción anterior',
		icon: 'media-skip-backward-symbolic',
		defaultTarget: 'playerctl previous',
		description: 'Salta a la canción o pista anterior',
	},
	{
		keyToken: 'KEY_NEXTSONG',
		label: 'Canción siguiente',
		icon: 'media-skip-forward-symbolic',
		defaultTarget: 'playerctl next',
		description: 'Salta a la canción o pista siguiente',
	},
];
