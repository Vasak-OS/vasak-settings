export interface SystemInfo {
	cpu: CpuInfo;
	memory: MemoryInfo;
	swap: SwapInfo | null;
	disks: DiskInfo[];
	gpu: GpuInfo | null;
	system: SystemDetails;
	temperature: TemperatureInfo | null;
}

export interface CpuInfo {
	model: string;
	cores: number;
	usage: number;
	frequency: number | null;
}

export interface MemoryInfo {
	total_gb: number;
	used_gb: number;
	available_gb: number;
	usage_percent: number;
}

export interface SwapInfo {
	total_gb: number;
	used_gb: number;
	free_gb: number;
	usage_percent: number;
}

export interface DiskInfo {
	device: string;
	mountpoint: string;
	mountpoints: string[];
	fstype: string;
	total_gb: number;
	used_gb: number;
	available_gb: number;
	usage_percent: number;
}

export interface GpuInfo {
	model: string;
	vendor: string;
}

export interface SystemDetails {
	hostname: string;
	kernel: string;
	os_name: string;
	os_version: string;
	display_server: string;
	uptime_seconds: number;
}

export interface TemperatureInfo {
	cpu_temp: number | null;
	sensors: SensorReading[];
}

export interface SensorReading {
	name: string;
	temp: number;
	label: string;
}
