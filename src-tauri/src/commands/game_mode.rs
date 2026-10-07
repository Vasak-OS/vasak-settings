//! Si GameMode está instalado, para la sección «Modo juego» (vasak-settings#156).
//!
//! El escritorio activa GameMode por D-Bus mientras dura el modo juego
//! (vasak-desktop#181). Configuración sólo necesita saber si existe, para
//! mostrar esa acción como «no disponible» en lugar de ofrecer un interruptor
//! que no hace nada.
//!
//! Es **una** consulta al abrir la sección, sin lanzar procesos: primero el
//! nombre en el bus de sesión —que es por donde lo va a buscar el escritorio—
//! y, sólo si el bus no contesta, el binario en el `PATH`, recorrido acá.

use std::ffi::OsStr;
use std::path::Path;

use crate::logger::log_debug;

/// El nombre de bus que registra `gamemoded`, y que su archivo de servicio
/// hace activable aunque el demonio todavía no esté corriendo.
pub const GAMEMODE_BUS_NAME: &str = "com.feralinteractive.GameMode";

/// El binario del demonio, para cuando no hay bus de sesión al que preguntar.
pub const GAMEMODE_BINARY: &str = "gamemoded";

/// Si alguna de las listas del bus nombra a GameMode.
///
/// Se le pasan juntos los nombres en uso (`ListNames`) y los activables
/// (`ListActivatableNames`): instalado y sin correr está sólo en la segunda,
/// corriendo puede estar sólo en la primera.
pub fn bus_offers_gamemode<S: AsRef<str>>(names: &[S]) -> bool {
    names.iter().any(|name| name.as_ref() == GAMEMODE_BUS_NAME)
}

/// Si un archivo es un ejecutable común (no un directorio, con algún bit de
/// ejecución).
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Si `name` está en alguna carpeta de `path_var`, con el mismo criterio que
/// el shell pero sin lanzar uno.
///
/// Las entradas vacías o relativas se saltean: el shell las interpreta como la
/// carpeta actual, que para una aplicación gráfica no significa nada útil.
pub fn binary_in_path(path_var: &OsStr, name: &str) -> bool {
    std::env::split_paths(path_var)
        .filter(|dir| dir.is_absolute())
        .any(|dir| is_executable(&dir.join(name)))
}

/// Los nombres del bus de sesión, en uso y activables, o `None` si no hay bus.
async fn session_bus_names() -> Option<Vec<String>> {
    let connection = zbus::Connection::session().await.ok()?;
    let proxy = zbus::fdo::DBusProxy::new(&connection).await.ok()?;

    let mut names: Vec<String> = proxy
        .list_names()
        .await
        .ok()?
        .into_iter()
        .map(|name| name.to_string())
        .collect();
    // Si sólo falla la lista de activables, con los nombres en uso alcanza
    // para un demonio que ya está corriendo.
    if let Ok(activatable) = proxy.list_activatable_names().await {
        names.extend(activatable.into_iter().map(|name| name.to_string()));
    }
    Some(names)
}

/// Si GameMode está instalado.
///
/// Cuando el bus contesta, manda el bus: es lo que va a usar el escritorio, así
/// que un binario suelto sin su servicio de D-Bus no sirve para el modo juego.
/// Sin bus, el `PATH` es la mejor aproximación.
#[tauri::command]
pub async fn is_gamemode_available() -> bool {
    if let Some(names) = session_bus_names().await {
        return bus_offers_gamemode(&names);
    }
    log_debug("modo juego: sin bus de sesión, se busca gamemoded en el PATH");
    std::env::var_os("PATH")
        .map(|path| binary_in_path(&path, GAMEMODE_BINARY))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::os::unix::fs::PermissionsExt;

    /// Una carpeta propia por prueba, para no pisarse al correr en paralelo.
    fn scratch(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "vasak-settings-game-mode-{tag}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("se crea la carpeta");
        dir
    }

    fn write_file(path: &Path, mode: u32) {
        std::fs::write(path, "#!/bin/sh\n").expect("se escribe");
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).expect("permisos");
    }

    #[test]
    fn el_nombre_activable_cuenta_como_instalado() {
        let names = ["org.freedesktop.DBus", "com.feralinteractive.GameMode"];
        assert!(bus_offers_gamemode(&names));
    }

    #[test]
    fn sin_el_nombre_en_el_bus_no_esta_disponible() {
        let names = ["org.freedesktop.DBus", "com.feralinteractive.GameModeX"];
        assert!(!bus_offers_gamemode(&names));
        assert!(!bus_offers_gamemode::<&str>(&[]));
    }

    #[test]
    fn encuentra_el_binario_ejecutable_en_el_path() {
        let empty = scratch("vacia");
        let bin = scratch("bin");
        write_file(&bin.join(GAMEMODE_BINARY), 0o755);

        let path: OsString = std::env::join_paths([&empty, &bin]).expect("PATH");
        assert!(binary_in_path(&path, GAMEMODE_BINARY));

        let _ = std::fs::remove_dir_all(&empty);
        let _ = std::fs::remove_dir_all(&bin);
    }

    #[test]
    fn un_archivo_sin_permiso_de_ejecucion_o_una_carpeta_no_cuentan() {
        let plain = scratch("sin-x");
        write_file(&plain.join(GAMEMODE_BINARY), 0o644);
        let folder = scratch("carpeta");
        std::fs::create_dir_all(folder.join(GAMEMODE_BINARY)).expect("carpeta");

        let path: OsString = std::env::join_paths([&plain, &folder]).expect("PATH");
        assert!(!binary_in_path(&path, GAMEMODE_BINARY));

        let _ = std::fs::remove_dir_all(&plain);
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn las_entradas_relativas_o_vacias_del_path_se_saltean() {
        assert!(!binary_in_path(OsStr::new(""), GAMEMODE_BINARY));
        assert!(!binary_in_path(OsStr::new(":.:bin"), GAMEMODE_BINARY));
    }
}
