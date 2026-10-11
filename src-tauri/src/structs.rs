use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolumeInfo {
    pub current: i64,
    pub min: i64,
    pub max: i64,
    pub is_muted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_default: bool,
    pub volume: f64,
}

/// Una salida de audio que vive detrás de un perfil de tarjeta.
///
/// Un sink sólo existe cuando el perfil que lo crea está activo: la salida HDMI
/// de la GPU no aparece en `pactl list sinks` mientras el perfil de la tarjeta
/// está en `off` o en analógico, aunque el monitor esté enchufado y disponible.
/// Esto representa esas salidas conmutables —el puerto físico y el perfil que
/// hay que activar para que su sink exista— para poder ofrecerlas antes de que
/// el sink exista.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioOutputProfile {
    /// Nombre de la tarjeta (`alsa_card.pci-...`), para `set-card-profile`.
    pub card_name: String,
    /// Perfil que hay que activar para que esta salida tenga sink
    /// (`output:hdmi-stereo`).
    pub profile_name: String,
    /// Descripción del puerto, legible («HDMI / DisplayPort»).
    pub description: String,
    /// El perfil de la tarjeta ya está activo en este puerto.
    pub is_active: bool,
    /// El puerto está disponible (el monitor/cable está presente).
    pub is_available: bool,
    /// Prioridad del puerto, para ordenar de mayor a menor.
    pub priority: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub swap: Option<SwapInfo>,
    pub disks: Vec<DiskInfo>,
    pub gpu: Option<GpuInfo>,
    pub system: SystemDetails,
    pub temperature: Option<TemperatureInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CpuInfo {
    pub model: String,
    pub cores: u32,
    pub usage: f32,
    pub frequency: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryInfo {
    pub total_gb: f64,
    pub used_gb: f64,
    pub available_gb: f64,
    pub usage_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SwapInfo {
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub device: String,
    pub mountpoint: String,
    pub mountpoints: Vec<String>,
    pub fstype: String,
    pub total_gb: f64,
    pub used_gb: f64,
    pub available_gb: f64,
    pub usage_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub model: String,
    pub vendor: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemDetails {
    pub hostname: String,
    pub kernel: String,
    pub os_name: String,
    pub os_version: String,
    pub display_server: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TemperatureInfo {
    pub cpu_temp: Option<f32>,
    pub sensors: Vec<SensorReading>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SensorReading {
    pub name: String,
    pub temp: f32,
    pub label: String,
}

// Logger

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogSource {
    Rust,
    /// Sin construir todavía: la usaría `log_from_js`. Ver el comentario ahí.
    #[allow(dead_code)]
    JavaScript,
}

pub struct VasakLogger {
    pub(crate) log_file: Option<File>,
    pub(crate) log_path: PathBuf,
    pub(crate) is_dev_mode: bool,
}
