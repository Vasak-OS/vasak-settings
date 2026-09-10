//! Ejecuta las herramientas y le da lo que devuelven al analizador.
//!
//! Todo lo que decide vive en `tools::actualizaciones`, que es función pura.
//! Acá está lo único que no se puede probar sin el sistema: correr los
//! programas y mirar el disco.
//!
//! # Nada de esto necesita privilegios
//!
//! `checkupdates` está hecho justamente para eso: copia la base de pacman a un
//! directorio temporal y sincroniza **ahí**, así que no toca
//! `/var/lib/pacman` y corre como cualquiera. `pacdiff --output` sólo lista.
//! Y el espacio libre lo dice `statvfs`.
//!
//! Aplicar la actualización sí va a necesitarlos, y ésa es otra decisión: un
//! servicio de sistema con una interfaz D-Bus acotada, como hace
//! `vasak-permissions`, en vez de que esta interfaz llame a `pkexec pacman`.
//! Ver Vasak-OS/vasak-settings#45.

use std::process::Command;

use crate::tools::actualizaciones::{
    espacio_necesario_en_boot, es_paquete_de_kernel, mayor_initramfs, parsear_actualizaciones,
    parsear_pacnew, Actualizacion, Preflight,
};

/// Dónde vive el kernel una vez copiado por el hook de mkinitcpio.
const DIR_ARRANQUE: &str = "/boot";

/// Corre un programa y devuelve su salida estándar.
///
/// Un programa que no está no es un error de la aplicación: `pacman-contrib`
/// —de donde sale `checkupdates`— y `pacdiff` son dependencias del paquete,
/// pero alguien las puede haber sacado. Devolver vacío hace que la
/// comprobación diga «no encontré nada» en vez de romperse.
fn salida_de(programa: &str, args: &[&str]) -> String {
    Command::new(programa)
        .args(args)
        .output()
        .map(|s| String::from_utf8_lossy(&s.stdout).into_owned())
        .unwrap_or_default()
}

/// Qué paquetes se actualizarían, sin tocar la base de pacman.
#[tauri::command]
pub fn actualizaciones_pendientes() -> Vec<Actualizacion> {
    // `checkupdates` sale con 2 y sin nada cuando no hay actualizaciones, que
    // el analizador ya trata como lista vacía.
    parsear_actualizaciones(&salida_de("checkupdates", &[]))
}

/// La comprobación previa completa.
#[tauri::command]
pub fn preflight_actualizacion() -> Preflight {
    let pendientes = parsear_actualizaciones(&salida_de("checkupdates", &[]));

    // Cuáles de los que se actualizan son kernels. Se pregunta por los
    // archivos que **ya tienen instalados**, que es información local: el
    // paquete está instalado —por eso se actualiza— y no hace falta ni red ni
    // la base de archivos.
    let kernels: Vec<String> = pendientes
        .iter()
        .filter(|a| es_paquete_de_kernel(&salida_de("pacman", &["-Qlq", &a.nombre])))
        .map(|a| a.nombre.clone())
        .collect();

    let necesario = espacio_necesario_en_boot(!kernels.is_empty(), el_mayor_initramfs());
    Preflight::nuevo(
        pendientes.len(),
        kernels,
        parsear_pacnew(&salida_de("pacdiff", &["--output", "--nocolor"])),
        libre_en_boot(),
        necesario,
    )
}

/// Lo que hoy ocupa en `/boot` el juego de archivos del kernel **más grande**.
///
/// El más grande y no el promedio: con un `linux` de 600 MiB y un `linux-lts`
/// de 200, el promedio da 400 y alcanzaría para dejar pasar la actualización
/// del grande con 400 libres, que es justo la que no entra. Lo que hace falta
/// acá es una cota superior.
///
/// Los archivos se agrupan por kernel usando lo que va después del guion:
/// `vmlinuz-linux` e `initramfs-linux.img` son del mismo, `initramfs-linux-
/// fallback.img` también. El microcódigo no es de ninguno —lo comparten— y se
/// suma aparte, porque una actualización de `intel-ucode` también lo reescribe.
///
/// Si no se puede leer —`/boot` con `fmask=0077` no lo lista quien no es
/// root—, se devuelve una estimación fija en vez de cero. Cero diría «no hace
/// falta espacio», que es la respuesta peligrosa: dejaría pasar justo la
/// actualización que no entra.
fn el_mayor_initramfs() -> u64 {
    /// Un initramfs de respaldo, redondeado para arriba. Medido sobre una
    /// instalación con `linux-cachyos`, donde `/boot` entero ocupa 286 MiB con
    /// un solo kernel.
    ///
    /// Se devuelve esto y no cero cuando `/boot` no se puede leer —con
    /// `fmask=0077` no lo lista quien no es root—: cero diría «no hace falta
    /// espacio» y callaría justo cuando no hay lugar.
    const ESTIMACION: u64 = 200 * 1024 * 1024;

    let Ok(entradas) = std::fs::read_dir(DIR_ARRANQUE) else {
        return ESTIMACION;
    };
    let archivos: Vec<(String, u64)> = entradas
        .flatten()
        .map(|e| {
            (
                e.file_name().to_string_lossy().into_owned(),
                e.metadata().map(|m| m.len()).unwrap_or(0),
            )
        })
        .collect();

    mayor_initramfs(&archivos).unwrap_or(ESTIMACION)
}

/// Lo libre en el sistema de archivos donde está `/boot`.
///
/// Se pregunta por `/boot` y no por `/`: son sistemas de archivos distintos, y
/// el que se llena es el chico.
fn libre_en_boot() -> u64 {
    // `df` en vez de `statvfs`: son dos llamadas por actualización, no hay
    // ninguna ventaja en traer una dependencia para esto, y su salida con
    // `--output=avail -B1` es un número y nada más.
    salida_de("df", &["--output=avail", "-B1", DIR_ARRANQUE])
        .lines()
        .nth(1)
        .and_then(|l| l.trim().parse().ok())
        .unwrap_or(0)
}
