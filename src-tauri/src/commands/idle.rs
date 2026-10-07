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
const LOCKER: &str = "systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen";
/// Before suspending, -d returns as soon as the screen is covered. Without it
/// swayidle waits for the unlock and the machine never gets to sleep.
const SLEEP_LOCKER: &str =
    "systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen -d";
/// Pausa y reanudación del fondo animado. Un video decodificando detrás de la
/// pantalla de bloqueo es gasto puro, y desde el webview no hay forma de saber
/// que nadie lo mira: se lo avisa swayidle por D-Bus. Son los mismos comandos
/// que la unidad del paquete (vasak-desktop-settings,
/// `usr/lib/systemd/user/vasak-idle.service`); la prueba
/// `defaults_render_the_package_unit` lo comprueba.
const PAUSE_WALLPAPER: &str = "dbus-send --session --dest=org.vasak.os.Desktop \
    --type=method_call /org/vasak/os/Desktop org.vasak.os.Desktop.PauseWallpaper";
const RESUME_WALLPAPER: &str = "dbus-send --session --dest=org.vasak.os.Desktop \
    --type=method_call /org/vasak/os/Desktop org.vasak.os.Desktop.ResumeWallpaper";
/// Lo que reconoce a la pausa al leer una línea, para no tomarla por otro
/// temporizador.
const PAUSE_WALLPAPER_MARK: &str = "PauseWallpaper";
/// La regla de cuándo se pausa el fondo: un minuto antes del primer
/// temporizador (bloqueo o apagado de pantalla), nunca después de los 4 minutos
/// de la unidad del paquete y nunca antes de 30 s. Con el bloqueo en 5 minutos
/// da los 240 s del paquete; con el bloqueo en 1 minuto, 30 s, y así la pausa
/// siempre llega antes que el primer temporizador.
const WALLPAPER_PAUSE_MAX_SECONDS: u32 = 240;
const WALLPAPER_PAUSE_LEAD_SECONDS: u32 = 60;
const WALLPAPER_PAUSE_MIN_SECONDS: u32 = 30;
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

/// `systemctl --user` con los argumentos dados; también lo usa
/// `night_light_service`.
pub(crate) fn systemctl(args: &[&str]) -> Result<(), String> {
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
    action.contains("vasak-lock-screen")
        || action.contains("vasak-lock")
        || action.contains("gtklock")
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

                if action.contains(PAUSE_WALLPAPER_MARK) {
                    // La pausa del fondo no es un ajuste: se deriva del primer
                    // temporizador y se vuelve a escribir siempre.
                } else if locks_the_screen(&action) {
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
            // El comando de un `resume` o el valor de `idlehint` no se miran:
            // saltarlos evita leer su texto como una palabra clave.
            "resume" | "idlehint" => index += 2,
            _ => index += 1,
        }
    }

    config
}

fn render_command(config: &IdleConfig) -> String {
    // La pausa del fondo va siempre, aunque no haya bloqueo ni apagado de
    // pantalla: el fondo animado gasta igual con nadie mirando.
    let mut command = format!(
        "/usr/bin/swayidle -w timeout {} '{}' resume '{}'",
        wallpaper_pause_seconds(config),
        PAUSE_WALLPAPER,
        RESUME_WALLPAPER
    );

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
    } else {
        // swayidle sólo respeta los inhibidores de logind (`systemd-inhibit
        // --what=idle`, «Mantener despierto» del escritorio, un reproductor)
        // si está conectado a logind, y se conecta sólo cuando la línea lleva
        // `before-sleep`, `after-resume`, `lock`, `unlock` o `idlehint`. Sin el
        // bloqueo antes de suspender no quedaba ninguno: los temporizadores
        // corrían igual con un inhibidor tomado. `idlehint` es el que no agrega
        // nada más que avisarle a logind que la sesión está inactiva.
        //
        // Va siempre, porque la pausa del fondo hace que siempre haya un
        // temporizador; con un inhibidor tomado el fondo tampoco se pausa. El
        // aviso a logind llega con el primer temporizador de bloqueo o de
        // apagado, o con la pausa si no hay ninguno de los dos.
        let seconds = first_timeout(config).unwrap_or_else(|| wallpaper_pause_seconds(config));
        command.push_str(&format!(" idlehint {seconds}"));
    }

    command
}

/// El primer temporizador de bloqueo o de apagado de pantalla, en segundos, si
/// hay alguno. La pausa del fondo no cuenta: se calcula a partir de éste.
fn first_timeout(config: &IdleConfig) -> Option<u32> {
    let lock = config.lock_enabled.then(|| config.lock_minutes.max(1) * 60);
    let screen_off = config
        .screen_off_enabled
        .then(|| config.screen_off_minutes.max(1) * 60);
    lock.into_iter().chain(screen_off).min()
}

/// Cuándo se pausa el fondo animado, en segundos: ver
/// `WALLPAPER_PAUSE_MAX_SECONDS`. Sin temporizadores, a los 240 s de siempre.
fn wallpaper_pause_seconds(config: &IdleConfig) -> u32 {
    first_timeout(config).map_or(WALLPAPER_PAUSE_MAX_SECONDS, |first| {
        first
            .saturating_sub(WALLPAPER_PAUSE_LEAD_SECONDS)
            .clamp(WALLPAPER_PAUSE_MIN_SECONDS, WALLPAPER_PAUSE_MAX_SECONDS)
    })
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

/// La línea de `ExecStart=`, con las continuaciones (`\` al final de la
/// línea) unidas como las une systemd, salteando los comentarios que haya en
/// el medio: la unidad del paquete parte la línea de swayidle en varias.
fn exec_start_of(unit: &str) -> Option<String> {
    let mut lines = unit.lines().map(str::trim);
    let first = lines.find(|line| line.starts_with("ExecStart="))?;
    let mut command = String::new();
    let mut current = first.trim_start_matches("ExecStart=");

    loop {
        match current.strip_suffix('\\') {
            Some(continued) => {
                command.push_str(continued.trim_end());
                command.push(' ');
                // systemd ignora los comentarios intercalados en una línea
                // continuada y sigue con la próxima.
                current = lines
                    .find(|line| !line.starts_with('#') && !line.starts_with(';'))
                    .unwrap_or_default();
            }
            None => {
                command.push_str(current);
                break;
            }
        }
    }

    Some(command.trim().to_string())
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
    let mut config = match fs::read_to_string(&path)
        .ok()
        .as_deref()
        .and_then(exec_start_of)
    {
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
        let tokens =
            tokenize("swayidle -w timeout 300 'gtklock -s /path/x.css' before-sleep 'gtklock'");

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

    /// swayidle sólo ve los inhibidores de logind si está conectado a logind:
    /// sin `before-sleep`, la línea tiene que llevar `idlehint` o «Mantener
    /// despierto» no frena el bloqueo (vasak-desktop#179).
    #[test]
    fn without_before_sleep_it_still_connects_to_logind() {
        let config = IdleConfig {
            lock_enabled: true,
            lock_minutes: 5,
            screen_off_enabled: true,
            screen_off_minutes: 10,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        let command = render_command(&config);
        assert!(!command.contains("before-sleep"));
        assert!(
            command.ends_with(" idlehint 300"),
            "idlehint con el primer temporizador: {command}"
        );
    }

    /// Con `before-sleep` ya está conectado, y sin temporizadores no hay nada
    /// que inhibir: en los dos casos la línea no cambia.
    #[test]
    fn idlehint_only_when_nothing_else_connects_to_logind() {
        let with_sleep_lock = render_command(&IdleConfig {
            lock_before_sleep: true,
            ..IdleConfig::default()
        });
        assert!(!with_sleep_lock.contains("idlehint"));

        // Sin bloqueo ni apagado queda la pausa del fondo, y el aviso a logind
        // va con ella para que un inhibidor también la frene.
        let only_the_pause = render_command(&IdleConfig {
            lock_enabled: false,
            screen_off_enabled: false,
            lock_before_sleep: false,
            ..IdleConfig::default()
        });
        assert!(
            only_the_pause.ends_with(" idlehint 240"),
            "{only_the_pause}"
        );
    }

    /// Leer la unidad generada con `idlehint` no confunde los valores.
    #[test]
    fn round_trips_with_idlehint() {
        let config = IdleConfig {
            lock_enabled: true,
            lock_minutes: 7,
            screen_off_enabled: true,
            screen_off_minutes: 15,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        let parsed = parse_swayidle(&render_command(&config));
        assert!(parsed.lock_enabled);
        assert_eq!(parsed.lock_minutes, 7);
        assert!(parsed.screen_off_enabled);
        assert_eq!(parsed.screen_off_minutes, 15);
        assert!(!parsed.lock_before_sleep);
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

        assert_eq!(
            parsed.lock_minutes, 1,
            "0 minutes would mean 'lock instantly'"
        );
    }

    #[test]
    fn everything_disabled_still_produces_a_valid_command() {
        let config = IdleConfig {
            lock_enabled: false,
            screen_off_enabled: false,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        assert_eq!(
            render_command(&config),
            format!(
                "/usr/bin/swayidle -w timeout 240 '{PAUSE_WALLPAPER}' \
                 resume '{RESUME_WALLPAPER}' idlehint 240"
            )
        );
    }

    /// La pausa del fondo con su reanudación, exactamente como en la unidad del
    /// paquete, y antes que cualquier otro temporizador de la línea.
    fn assert_pauses_the_wallpaper(command: &str) {
        let tokens = tokenize(command);
        assert_eq!(
            tokens.get(2).map(String::as_str),
            Some("timeout"),
            "la pausa tiene que ser el primer temporizador: {command}"
        );
        assert_eq!(
            tokens.get(4).map(String::as_str),
            Some(PAUSE_WALLPAPER),
            "falta la pausa del fondo: {command}"
        );
        assert_eq!(
            tokens.get(5..7),
            Some(&["resume".to_string(), RESUME_WALLPAPER.to_string()][..]),
            "la pausa sin su reanudación: {command}"
        );
    }

    /// Las cuatro combinaciones de bloqueo y «Bloquear antes de suspender»
    /// llevan la pausa (vasak-settings#159): antes, guardar Energía la sacaba.
    #[test]
    fn every_combination_pauses_the_wallpaper() {
        for lock_enabled in [false, true] {
            for lock_before_sleep in [false, true] {
                for screen_off_enabled in [false, true] {
                    let command = render_command(&IdleConfig {
                        lock_enabled,
                        lock_before_sleep,
                        screen_off_enabled,
                        ..IdleConfig::default()
                    });
                    assert_pauses_the_wallpaper(&command);
                }
            }
        }
    }

    /// La pausa no es un bloqueo: una línea que sólo la lleva no enciende el
    /// bloqueo al leerla, ni su `resume` se confunde con otra cosa.
    #[test]
    fn the_pause_is_not_read_as_a_lock() {
        let config = IdleConfig {
            lock_enabled: false,
            screen_off_enabled: false,
            lock_before_sleep: false,
            ..IdleConfig::default()
        };

        let parsed = parse_swayidle(&render_command(&config));
        assert!(!parsed.lock_enabled);
        assert!(!parsed.screen_off_enabled);
        assert!(!parsed.lock_before_sleep);
    }

    /// La regla de la pausa: un minuto antes del primer temporizador, entre
    /// 30 s y 240 s. Siempre llega antes que el bloqueo o el apagado.
    #[test]
    fn the_pause_comes_before_the_first_timer() {
        let pause_for = |lock: Option<u32>, screen_off: Option<u32>| {
            wallpaper_pause_seconds(&IdleConfig {
                lock_enabled: lock.is_some(),
                lock_minutes: lock.unwrap_or(5),
                screen_off_enabled: screen_off.is_some(),
                screen_off_minutes: screen_off.unwrap_or(10),
                ..IdleConfig::default()
            })
        };

        assert_eq!(pause_for(Some(5), None), 240, "el valor del paquete");
        assert_eq!(pause_for(Some(30), Some(60)), 240, "nunca más de 240 s");
        assert_eq!(pause_for(Some(4), None), 180);
        assert_eq!(pause_for(Some(2), None), 60);
        assert_eq!(pause_for(Some(1), None), 30, "nunca menos de 30 s");
        assert_eq!(
            pause_for(Some(10), Some(3)),
            120,
            "manda el primero, sea bloqueo o apagado"
        );
        assert_eq!(pause_for(None, None), 240, "sin temporizadores");

        for minutes in 1..=120 {
            let first = minutes * 60;
            let pause = pause_for(Some(minutes), None);
            assert!(pause < first, "{pause} s no llega antes de {first} s");
        }

        let command = render_command(&IdleConfig {
            lock_enabled: true,
            lock_minutes: 1,
            ..IdleConfig::default()
        });
        assert!(
            command.contains(&format!("timeout 30 '{PAUSE_WALLPAPER}'")),
            "{command}"
        );
    }

    /// La línea de swayidle de la unidad del paquete, copiada de
    /// vasak-desktop-settings, `usr/lib/systemd/user/vasak-idle.service`, tal
    /// cual (con sus continuaciones). Si el paquete cambia, esta copia y
    /// `render_command` cambian con él: `the_package_unit_copy_is_current`
    /// lo comprueba cuando el repositorio está al lado.
    const PACKAGE_EXEC_START: &str = r"ExecStart=/usr/bin/swayidle -w \
    timeout 240 'dbus-send --session --dest=org.vasak.os.Desktop --type=method_call /org/vasak/os/Desktop org.vasak.os.Desktop.PauseWallpaper' \
    resume 'dbus-send --session --dest=org.vasak.os.Desktop --type=method_call /org/vasak/os/Desktop org.vasak.os.Desktop.ResumeWallpaper' \
    timeout 300 'systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen' \
    before-sleep 'systemd-run --user --scope --collect --quiet /usr/bin/vasak-lock-screen -d'
Restart=on-failure";

    fn package_unit() -> String {
        format!("[Service]\nType=simple\n{PACKAGE_EXEC_START}\n")
    }

    /// Una sola línea: lo que Configuración escribe con los valores por omisión
    /// es exactamente lo que trae el paquete.
    #[test]
    fn defaults_render_the_package_unit() {
        let package = exec_start_of(&package_unit()).expect("la unidad tiene ExecStart");
        assert_eq!(render_command(&IdleConfig::default()), package);
    }

    /// Leer la unidad del paquete y volver a escribirla conserva la pausa y
    /// los valores.
    #[test]
    fn rewriting_the_package_unit_keeps_the_pause() {
        let package = exec_start_of(&package_unit()).expect("la unidad tiene ExecStart");
        let parsed = parse_swayidle(&package);

        assert!(parsed.lock_enabled);
        assert_eq!(parsed.lock_minutes, 5);
        assert!(parsed.lock_before_sleep);
        assert!(!parsed.screen_off_enabled);

        let rewritten = exec_start_of(&render_unit(&parsed)).expect("ExecStart");
        assert_pauses_the_wallpaper(&rewritten);
        assert_eq!(rewritten, package);
    }

    /// La copia de arriba contra la unidad real, si el repositorio
    /// vasak-desktop-settings está en algún directorio padre (el taller). En
    /// el CI no está, y la prueba no tiene nada que comparar.
    #[test]
    fn the_package_unit_copy_is_current() {
        let unit = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .map(|dir| dir.join("vasak-desktop-settings/usr/lib/systemd/user/vasak-idle.service"))
            .find(|path| path.is_file());

        let Some(unit) = unit else {
            eprintln!("vasak-desktop-settings no está al lado: nada que comparar");
            return;
        };

        let real = fs::read_to_string(&unit).expect("se puede leer la unidad del paquete");
        assert_eq!(
            exec_start_of(&real),
            exec_start_of(&package_unit()),
            "la unidad de {} cambió: actualizar PACKAGE_EXEC_START y render_command",
            unit.display()
        );
    }

    #[test]
    fn joins_continued_exec_start_lines() {
        let unit = "[Service]\nExecStart=/usr/bin/a \\\n    b 'c d' \\\n  e\nRestart=no\n";
        assert_eq!(exec_start_of(unit).as_deref(), Some("/usr/bin/a b 'c d' e"));
    }

    /// Un comentario entre dos pedazos no corta la línea: sin saltearlo, el
    /// bloqueo de la línea siguiente se perdía al leer y al guardar.
    #[test]
    fn skips_comments_inside_a_continued_exec_start() {
        let unit = "[Service]\nExecStart=/usr/bin/swayidle -w \\\n\
                    # el bloqueo\n\
                    ; otro comentario\n    timeout 120 'vasak-lock-screen'\n";
        let command = exec_start_of(unit).expect("ExecStart");
        assert_eq!(
            command,
            "/usr/bin/swayidle -w timeout 120 'vasak-lock-screen'"
        );
        let parsed = parse_swayidle(&command);
        assert!(parsed.lock_enabled);
        assert_eq!(parsed.lock_minutes, 2);
    }
}
