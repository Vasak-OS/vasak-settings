use crate::logger::{log_info, log_debug};
use crate::tools::system_info_tools::{
    get_cpu_model, get_cpu_cores, get_cpu_usage, get_cpu_frequency,
    get_memory_info, get_swap_info, get_disks_info, get_gpu_info,
    get_system_details, get_temperature_info,
};
use crate::structs::{
    CpuInfo, SystemInfo,
};

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    log_debug("Obteniendo información completa del sistema");
    let info = SystemInfo {
        cpu: CpuInfo {
            model: get_cpu_model(),
            cores: get_cpu_cores(),
            usage: get_cpu_usage(),
            frequency: get_cpu_frequency(),
        },
        memory: get_memory_info(),
        swap: get_swap_info(),
        disks: get_disks_info(),
        gpu: get_gpu_info(),
        system: get_system_details(),
        temperature: get_temperature_info(),
    };
    log_info(&format!("Info del sistema: CPU={} ({}%), Mem={}GB/{:.1}GB, Discos={}", 
        info.cpu.model, info.cpu.usage as u32, 
        info.memory.used_gb as u32, info.memory.total_gb,
        info.disks.len()));
    Ok(info)
}

