use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::commands::wayfire_config::WayfireConfig;
use crate::commands::wayfire_ini::{parse_section, update_section};
use crate::logger::{log_debug, log_error};

const UNIT: &str = "vasak-idle.service";
/// The lock screen is the greeter's own interface over an open session, so it
/// picks up the colours, the radius and the font from the configuration on its
/// own — nothing to prepare before running it.
///
/// It goes through `systemd-run --scope` because a lock client must not live
/// inside this unit's cgroup: saving this very page restarts the unit, and that
/// would kill an active lock. A lock client that dies with the session locked
/// leaves the compositor locked with nothing to type into.
const LOCKER: &str =
    "systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen";
/// Before suspending, -d returns as soon as the screen is covered. Without it
/// swayidle waits for the unlock and the machine never gets to sleep.
const SLEEP_LOCKER: &str =
    "systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen -d";
const AUTOSTART_SECTION: &str = "autostart";
/// The key wayfire used to launch swayidle from, before this moved to systemd.
const LEGACY_KEY: &str = "lock";

#[derive(Serialize, Deserialize, Clone)]
pub struct IdleConfig {
    pub enabled: bool,
    /// False when swayidle isn't installed.
    pub available: bool,
    /// False when wlopm isn't installed, so the screen-off row can explain itself.
    pub can_screen_off: bool,
    pub lock_enabled: bool,
    pub lock_minutes: u32,
    pub screen_off_enabled: bool,
    pub screen_off_minutes: u32,
    pub lock_before_sleep: bool,
    /// Set when the old wayfire.ini entry is still around; the next save clears it.
    pub legacy_found: bool,
}

impl Default for IdleConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            available: false,
            can_screen_off: false,
            lock_enabled: true,
            lock_minutes: 5,
            screen_off_enabled: false,
            screen_off_minutes: 10,
            lock_before_sleep: true,
            legacy_found: false,
        }
    }
}

fn has_binary(name: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {}", name))
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn unit_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "No se pudo obtener el directorio home".to_string())?;

    Ok(home.join(".config/systemd/user").join(UNIT))
}

fn systemctl(args: &[&str]) -> Result<(), String> {
    let output = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .output()
        .map_err(|e| format!("No se pudo ejecutar systemctl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("systemctl {:?} falló: {}", args, stderr.trim());
        log_error(&msg);
        return Err(msg);
    }

    Ok(())
}

/// Splits a command line the way systemd and swayidle see it: single-quoted
/// runs stay together as one argument.
fn tokenize(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_content = false;

    for character in line.chars() {
        match character {
            '\'' => {
                in_quotes = !in_quotes;
                has_content = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_content || !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                    has_content = false;
                }
            }
            c => current.push(c),
        }
    }

    if has_content || !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

/// True for any of the lockers VasakOS has shipped: units written before
/// vasak-lock existed name gtklock directly, and reading them as "no lock
/// configured" would silently turn the lock off on the next save.
fn locks_the_screen(action: &str) -> bool {
    action.contains("vasak-lock-screen") || action.contains("vasak-lock") || action.contains("gtklock")
}

/// Rebuilds the settings from a swayidle command line. Used both for the unit
/// we generate and for the legacy wayfire.ini entry, which have the same shape.
fn parse_swayidle(command: &str) -> IdleConfig {
    let mut config = IdleConfig {
        lock_enabled: false,
        lock_before_sleep: false,
        screen_off_enabled: false,
        ..IdleConfig::default()
    };

    let tokens = tokenize(command);
    let mut index = 0;

    while index < tokens.len() {
        match tokens[index].as_str() {
            "timeout" => {
                let seconds: u32 = tokens
                    .get(index + 1)
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0);
                let action = tokens.get(index + 2).cloned().unwrap_or_default();

                if locks_the_screen(&action) {
                    config.lock_enabled = true;
                    config.lock_minutes = (seconds / 60).max(1);
                } else if action.contains("wlopm") {
                    config.screen_off_enabled = true;
                    config.screen_off_minutes = (seconds / 60).max(1);
                }

                index += 3;
            }
            "before-sleep" => {
                if tokens
                    .get(index + 1)
                    .is_some_and(|action| locks_the_screen(action))
                {
                    config.lock_before_sleep = true;
                }
                index += 2;
            }
            _ => index += 1,
        }
    }

    config
}

fn render_command(config: &IdleConfig) -> String {
    let mut command = String::from("/usr/bin/swayidle -w");

    if config.lock_enabled {
        command.push_str(&format!(
            " timeout {} '{}'",
            config.lock_minutes.max(1) * 60,
            LOCKER
        ));
    }

    if config.screen_off_enabled {
        // Ordered after the lock so the screen goes dark already locked.
        command.push_str(&format!(
            " timeout {} '/usr/bin/wlopm --off \\*' resume '/usr/bin/wlopm --on \\*'",
            config.screen_off_minutes.max(1) * 60
        ));
    }

    if config.lock_before_sleep {
        command.push_str(&format!(" before-sleep '{}'", SLEEP_LOCKER));
    }

    command
}

fn render_unit(config: &IdleConfig) -> String {
    format!(
        "# Generado por vasak-settings. Los cambios manuales se sobrescriben.\n\
         [Unit]\n\
         Description=Bloqueo por inactividad de VasakOS (swayidle)\n\
         PartOf=graphical-session.target\n\
         After=graphical-session.target\n\
         \n\
         [Service]\n\
         Type=simple\n\
         ExecStart={}\n\
         Restart=on-failure\n\
         \n\
         [Install]\n\
         WantedBy=graphical-session.target\n",
        render_command(config)
    )
}

fn exec_start_of(unit: &str) -> Option<String> {
    unit.lines()
        .find(|line| line.trim_start().starts_with("ExecStart="))
        .map(|line| {
            line.trim_start()
                .trim_start_matches("ExecStart=")
                .trim()
                .to_string()
        })
}

/// The swayidle command wayfire used to launch, if it is still there.
fn legacy_command() -> Option<String> {
    let content = WayfireConfig::global().content().ok()?;
    let value = parse_section(&content, AUTOSTART_SECTION)
        .get(LEGACY_KEY)
        .cloned()?;

    value.contains("swayidle").then_some(value)
}

/// Drops the legacy entry so the session doesn't end up running two swayidles.
fn drop_legacy_entry() -> Result<(), String> {
    let removed = WayfireConfig::global().edit(|content| {
        let mut values = parse_section(content, AUTOSTART_SECTION);
        if values.remove(LEGACY_KEY).is_none() {
            return content.to_string();
        }
        // Prune, so removing the key actually takes effect.
        update_section(content, AUTOSTART_SECTION, &values, true)
    })?;

    if removed {
        log_debug("Entrada swayidle heredada eliminada de wayfire.ini");
    }
    Ok(())
}

#[tauri::command]
pub fn get_idle_config() -> Result<IdleConfig, String> {
    let path = unit_path()?;
    let legacy = legacy_command();

    // Prefer the user's own unit; fall back to whatever wayfire is still
    // launching so the page opens showing the settings actually in effect.
    let mut config = match fs::read_to_string(&path).ok().as_deref().and_then(exec_start_of) {
        Some(exec) => parse_swayidle(&exec),
        None => match legacy.as_deref() {
            Some(command) => parse_swayidle(command),
            None => IdleConfig::default(),
        },
    };

    config.available = has_binary("swayidle");
    config.can_screen_off = has_binary("wlopm");
    config.legacy_found = legacy.is_some();
    config.enabled = Command::new("systemctl")
        .arg("--user")
        .arg("is-active")
        .arg("--quiet")
        .arg(UNIT)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    Ok(config)
}

#[tauri::command]
pub fn set_idle_config(config: IdleConfig) -> Result<IdleConfig, String> {
    if config.enabled && !has_binary("swayidle") {
        return Err("swayidle no está instalado.".to_string());
    }

    let path = unit_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear el directorio de unidades: {}", e))?;
    }

    fs::write(&path, render_unit(&config))
        .map_err(|e| format!("No se pudo escribir la unidad: {}", e))?;

    // Saving is what completes the move off wayfire.ini.
    drop_legacy_entry()?;

    systemctl(&["daemon-reload"])?;

    if config.enabled {
        systemctl(&["enable", "--now", UNIT])?;
        systemctl(&["restart", UNIT])?;
    } else {
        let _ = systemctl(&["disable", "--now", UNIT]);
    }

    get_idle_config()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizer_keeps_quoted_commands_together() {
        let tokens = tokenize("swayidle -w timeout 300 'gtklock -s /path/x.css' before-sleep 'gtklock'");

        assert_eq!(tokens[3], "300");
        assert_eq!(tokens[4], "gtklock -s /path/x.css");
        assert_eq!(tokens[5], "before-sleep");
        assert_eq!(tokens[6], "gtklock");
    }

    #[test]
    fn renders_only_the_enabled_actions() {
        let config = IdleConfig {
            lock_enabled: true,
            lock_minutes: 5,
            screen_off_enabled: false,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        let command = render_command(&config);
        assert!(command.contains("timeout 300 '"));
        assert!(command.contains("/usr/bin/vasak-lock-screen'"));
        assert!(!command.contains("wlopm"));
        assert!(!command.contains("before-sleep"));
    }

    /// Without -d swayidle waits for the unlock, so the machine would refuse to
    /// suspend until somebody typed the password.
    #[test]
    fn the_before_sleep_lock_returns_once_the_screen_is_locked() {
        let config = IdleConfig {
            lock_enabled: false,
            lock_before_sleep: true,
            ..IdleConfig::default()
        };

        let command = render_command(&config);
        assert!(command.contains("before-sleep '"));
        assert!(command.contains("/usr/bin/vasak-lock-screen -d'"));
    }

    #[test]
    fn screen_off_adds_a_resume_action() {
        let config = IdleConfig {
            screen_off_enabled: true,
            screen_off_minutes: 10,
            ..IdleConfig::default()
        };

        let command = render_command(&config);
        assert!(command.contains("timeout 600 '/usr/bin/wlopm --off"));
        assert!(command.contains("resume '/usr/bin/wlopm --on"));
    }

    #[test]
    fn round_trips_through_the_generated_unit() {
        let config = IdleConfig {
            lock_enabled: true,
            lock_minutes: 7,
            screen_off_enabled: true,
            screen_off_minutes: 15,
            lock_before_sleep: true,
            ..IdleConfig::default()
        };

        let unit = render_unit(&config);
        let parsed = parse_swayidle(&exec_start_of(&unit).expect("unit needs an ExecStart"));

        assert!(parsed.lock_enabled);
        assert_eq!(parsed.lock_minutes, 7);
        assert!(parsed.screen_off_enabled);
        assert_eq!(parsed.screen_off_minutes, 15);
        assert!(parsed.lock_before_sleep);
    }

    /// The exact line VasakOS shipped in wayfire.ini, and the one the units
    /// written before vasak-lock still carry, so upgrading users keep their
    /// timeout instead of silently getting the default back.
    #[test]
    fn understands_the_legacy_wayfire_entry() {
        let legacy = "swayidle -w timeout 300 'gtklock -s /usr/share/vasak/gtklock.css' \
                      before-sleep 'gtklock -s /usr/share/vasak/gtklock.css'";

        let parsed = parse_swayidle(legacy);

        assert!(parsed.lock_enabled);
        assert_eq!(parsed.lock_minutes, 5);
        assert!(parsed.lock_before_sleep);
        assert!(!parsed.screen_off_enabled);
    }

    #[test]
    fn a_sub_minute_timeout_never_rounds_down_to_zero() {
        let parsed = parse_swayidle("swayidle -w timeout 30 'gtklock'");

        assert_eq!(parsed.lock_minutes, 1, "0 minutes would mean 'lock instantly'");
    }

    #[test]
    fn everything_disabled_still_produces_a_valid_command() {
        let config = IdleConfig {
            lock_enabled: false,
            screen_off_enabled: false,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        assert_eq!(render_command(&config), "/usr/bin/swayidle -w");
    }
}
