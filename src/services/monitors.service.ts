import { invoke } from '@tauri-apps/api/core';

export interface MonitorMode {
	width: number;
	height: number;
	/** Millihertz: 59.997 Hz is 59997, and rounding it to 60 names a mode the screen does not have. */
	refresh_mhz: number;
	is_preferred: boolean;
	is_current: boolean;
}

export interface Position {
	x: number;
	y: number;
}

export interface DetectedMonitor {
	name: string;
	description: string;
	connected: boolean;
	enabled: boolean;
	modes: MonitorMode[];
	position: Position;
	scale: number;
	transform: string;
	/** The room the screen takes in the layout — the mode divided by the scale. */
	logical_width: number;
	logical_height: number;
	has_config: boolean;
}

export type MonitorSource = 'WlrRandr' | 'Kernel';

export interface MonitorReport {
	monitors: DetectedMonitor[];
	source: MonitorSource;
}

export interface MonitorSetting {
	name: string;
	enabled: boolean;
	mode: MonitorMode;
	position: Position;
	scale: number;
	transform: string;
}

export type BrightnessKind = 'backlight' | 'ddc';

export interface MonitorBrightness {
	output: string;
	kind: BrightnessKind;
	handle: string;
	percent: number;
}

export interface BrightnessReport {
	monitors: MonitorBrightness[];
	ddc_hint: string | null;
}

export function getDetectedMonitors(): Promise<MonitorReport> {
	return invoke<MonitorReport>('get_detected_monitors');
}

/**
 * Saves every screen in one call. The positions only mean anything together, so
 * they are written together — and the backend refuses a layout that would leave
 * a screen the pointer cannot reach.
 */
export function applyMonitorLayout(monitors: MonitorSetting[]): Promise<MonitorSetting[]> {
	return invoke<MonitorSetting[]>('apply_monitor_layout', { monitors });
}

export function getMonitorBrightness(outputs: string[]): Promise<BrightnessReport> {
	return invoke<BrightnessReport>('get_monitor_brightness', { outputs });
}

export function setMonitorBrightness(
	kind: BrightnessKind,
	handle: string,
	percent: number
): Promise<void> {
	return invoke('set_monitor_brightness', { kind, handle, percent });
}

/** The size a screen occupies in the layout, mirroring the backend's rule. */
export function logicalSize(mode: MonitorMode, scale: number, transform: string) {
	const sideways = ['90', '270', 'flipped-90', 'flipped-270'].includes(transform.trim());
	const width = sideways ? mode.height : mode.width;
	const height = sideways ? mode.width : mode.height;
	const factor = scale > 0 ? scale : 1;

	return {
		width: Math.max(1, Math.round(width / factor)),
		height: Math.max(1, Math.round(height / factor)),
	};
}

export function formatRefresh(mode: MonitorMode): string {
	return `${(mode.refresh_mhz / 1000).toFixed(3).replace(/\.?0+$/, '')} Hz`;
}
