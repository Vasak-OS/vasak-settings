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
    espacio_necesario_en_boot, es_paquete_de_kernel, parsear_actualizaciones, parsear_pacnew,
    Actualizacion, Preflight,
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

    let necesario = espacio_necesario_en_boot(kernels.len(), ocupado_por_un_kernel());
    Preflight::nuevo(
        pendientes.len(),
        kernels,
        parsear_pacnew(&salida_de("pacdiff", &["--output", "--nocolor"])),
        libre_en_boot(),
        necesario,
    )
}

/// Lo que hoy ocupa en `/boot` el juego de archivos de **un** kernel.
///
/// Se cuenta lo que hay y se divide por cuántos kernels hay, en vez de sumar
/// todo: con dos kernels instalados, `/boot` ocupa el doble de lo que hace
/// falta para actualizar uno.
///
/// Si no se puede leer —`/boot` con `fmask=0077` no lo lista quien no es
/// root—, se devuelve una estimación fija en vez de cero. Cero diría «no hace
/// falta espacio», que es la respuesta peligrosa: dejaría pasar justo la
/// actualización que no entra.
fn ocupado_por_un_kernel() -> u64 {
    /// Un kernel con sus dos initramfs y el microcódigo, redondeado para
    /// arriba. Medido sobre una instalación con `linux-cachyos`: 149 MiB el
    /// paquete, y en `/boot` el juego entero da del orden de 250 MiB.
    const ESTIMACION: u64 = 300 * 1024 * 1024;

    let Ok(entradas) = std::fs::read_dir(DIR_ARRANQUE) else {
        return ESTIMACION;
    };

    let (mut total, mut kernels) = (0u64, 0u64);
    for entrada in entradas.flatten() {
        let nombre = entrada.file_name();
        let nombre = nombre.to_string_lossy();
        if !(nombre.starts_with("vmlinuz")
            || nombre.starts_with("initramfs")
            || nombre.ends_with("-ucode.img"))
        {
            continue;
        }
        if nombre.starts_with("vmlinuz") {
            kernels += 1;
        }
        total += entrada.metadata().map(|m| m.len()).unwrap_or(0);
    }

    if kernels == 0 || total == 0 {
        return ESTIMACION;
    }
    total / kernels
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
