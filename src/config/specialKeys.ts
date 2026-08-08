/**
 * A well-known media/function key. The display text lives in the locale files
 * under `shortcutKeys.<keyToken>`, so only identity and behaviour live here.
 */
export interface SpecialKeyDef {
	keyToken: string;
	icon: string;
	defaultTarget: string;
}

export const SPECIAL_KEYS: SpecialKeyDef[] = [
	{
		keyToken: 'KEY_VOLUMEUP',
		icon: 'audio-volume-high-symbolic',
		defaultTarget: 'pactl set-sink-volume @DEFAULT_SINK@ +5%',
	},
	{
		keyToken: 'KEY_VOLUMEDOWN',
		icon: 'audio-volume-low-symbolic',
		defaultTarget: 'pactl set-sink-volume @DEFAULT_SINK@ -5%',
	},
	{
		keyToken: 'KEY_MUTE',
		icon: 'audio-volume-muted-symbolic',
		defaultTarget: 'pactl set-sink-mute @DEFAULT_SINK@ toggle',
	},
	{
		keyToken: 'KEY_MICMUTE',
		icon: 'microphone-sensitivity-muted-symbolic',
		defaultTarget: 'pactl set-source-mute @DEFAULT_SOURCE@ toggle',
	},
	{
		keyToken: 'KEY_CAMERA',
		icon: 'camera-web-symbolic',
		defaultTarget: '',
	},
	{
		keyToken: 'KEY_BRIGHTNESSUP',
		icon: 'display-brightness-symbolic',
		defaultTarget: 'brightnessctl s +10%',
	},
	{
		keyToken: 'KEY_BRIGHTNESSDOWN',
		icon: 'display-brightness-symbolic',
		defaultTarget: 'brightnessctl s 10%-',
	},
	{
		keyToken: 'KEY_PLAYPAUSE',
		icon: 'media-playback-start-symbolic',
		defaultTarget: 'playerctl play-pause',
	},
	{
		keyToken: 'KEY_STOPCD',
		icon: 'media-playback-stop-symbolic',
		defaultTarget: 'playerctl stop',
	},
	{
		keyToken: 'KEY_PREVIOUSSONG',
		icon: 'media-skip-backward-symbolic',
		defaultTarget: 'playerctl previous',
	},
	{
		keyToken: 'KEY_NEXTSONG',
		icon: 'media-skip-forward-symbolic',
		defaultTarget: 'playerctl next',
	},
];
