// This module contains infrastructure for future use.
// Methods will be used as features requiring root access are added.
#![allow(dead_code)]

use std::process::Command;
use std::time::Duration;

use crate::logger::{log_debug, log_error, log_info};

/// Nivel de privilegio para ejecutar un comando
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PrivilegeLevel {
    /// Ejecución normal como usuario actual
    User,
    /// Ejecución elevada via pkexec (polkit), muestra diálogo de autenticación
    Elevated,
}

/// Resultado de un comando ejecutado
#[derive(Debug)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Ejecutor de comandos del sistema con soporte para elevación de privilegios via pkexec
pub struct CommandExecutor;

impl CommandExecutor {
    /// Ejecuta un comando como usuario normal
    pub fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
        Self::run_with_level(PrivilegeLevel::User, cmd, args)
    }

    /// Ejecuta un comando con privilegios elevados (pkexec). Muestra diálogo de autenticación.
    pub fn run_elevated(cmd: &str, args: &[&str]) -> Result<String, String> {
        Self::run_with_level(PrivilegeLevel::Elevated, cmd, args)
    }

    /// Ejecuta un comando como usuario normal primero.
    /// Si falla por permisos, reintenta con pkexec.
    pub fn run_auto(cmd: &str, args: &[&str]) -> Result<String, String> {
        match Self::run(cmd, args) {
            Ok(output) => Ok(output),
            Err(e) => {
                let is_perm_error = e.contains("denied")
                    || e.contains("denegado")
                    || e.contains("Permission")
                    || e.contains("EACCES")
                    || e.contains("EPERM")
                    || e.contains("not permitted")
                    || e.contains("Operation not permitted");
                if is_perm_error {
                    log_info(&format!("Permiso denegado, reintentando con pkexec: {} {:?}", cmd, args));
                    Self::run_elevated(cmd, args)
                } else {
                    Err(e)
                }
            }
        }
    }

    /// Ejecuta un comando con el nivel de privilegio especificado
    fn run_with_level(level: PrivilegeLevel, cmd: &str, args: &[&str]) -> Result<String, String> {
        let result = Self::execute(level, cmd, args)?;

        if result.exit_code != 0 {
            let error_msg = if result.stderr.is_empty() {
                format!("Comando falló con código {}", result.exit_code)
            } else {
                result.stderr.clone()
            };
            return Err(error_msg);
        }

        Ok(result.stdout)
    }

    /// Ejecuta un comando y retorna el resultado completo
    pub fn execute(level: PrivilegeLevel, cmd: &str, args: &[&str]) -> Result<CommandResult, String> {
        let level_label = match level {
            PrivilegeLevel::User => "usuario",
            PrivilegeLevel::Elevated => "elevado (pkexec)",
        };

        log_debug(&format!("Ejecutando comando ({}): {} {:?}", level_label, cmd, args));

        let output = match level {
            PrivilegeLevel::User => {
                Command::new(cmd)
                    .args(args)
                    .output()
                    .map_err(|e| format!("Error al ejecutar {}: {}", cmd, e))?
            }
            PrivilegeLevel::Elevated => {
                // Verificar que pkexec esté disponible
                if which_pkexec().is_err() {
                    return Err("pkexec no está instalado. Instale polkit (pkexec) para operaciones con privilegios elevados.".to_string());
                }

                let mut pkexec_cmd = Command::new("pkexec");
                pkexec_cmd.arg(cmd);
                for arg in args {
                    pkexec_cmd.arg(arg);
                }
                pkexec_cmd
                    .output()
                    .map_err(|e| format!("Error al ejecutar pkexec: {}", e))?
            }
        };

        let result = CommandResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        };

        if result.exit_code != 0 {
            log_error(&format!(
                "Comando {} ({}) falló: {}",
                cmd, level_label, result.stderr
            ));
        }

        Ok(result)
    }

    /// Ejecuta un comando silenciosamente, retorna true si tiene éxito
    pub fn run_silent(cmd: &str, args: &[&str]) -> bool {
        Self::run(cmd, args).is_ok()
    }

    /// Ejecuta un comando con timeout
    pub fn run_with_timeout(cmd: &str, args: &[&str], timeout_secs: u64) -> Result<String, String> {
        Self::run_with_level_and_timeout(PrivilegeLevel::User, cmd, args, timeout_secs)
    }

    fn run_with_level_and_timeout(
        level: PrivilegeLevel,
        cmd: &str,
        args: &[&str],
        timeout_secs: u64,
    ) -> Result<String, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let cmd_owned = cmd.to_string();
        let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();

        std::thread::spawn(move || {
            let result = match level {
                PrivilegeLevel::User => {
                    Command::new(&cmd_owned).args(&args_owned).output()
                }
                PrivilegeLevel::Elevated => {
                    let mut c = Command::new("pkexec");
                    c.arg(&cmd_owned);
                    for arg in &args_owned {
                        c.arg(arg);
                    }
                    c.output()
                }
            };
            let _ = tx.send(result);
        });

        let output = rx
            .recv_timeout(Duration::from_secs(timeout_secs))
            .map_err(|_| format!("Timeout ejecutando {} ({}s)", cmd, timeout_secs))?
            .map_err(|e| format!("Error al ejecutar {}: {}", cmd, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Comando {} falló: {}", cmd, stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

fn which_pkexec() -> Result<(), String> {
    Command::new("pkexec")
        .arg("--version")
        .output()
        .map(|o| {
            if o.status.success() {
                Ok(())
            } else {
                Err("pkexec no está disponible".to_string())
            }
        })
        .map_err(|_| "pkexec no está instalado".to_string())?
}
