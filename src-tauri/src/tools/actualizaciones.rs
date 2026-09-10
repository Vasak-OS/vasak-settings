//! Lo que hay que saber **antes** de aplicar una actualización.
//!
//! Un sistema rolling que no se actualiza durante meses es la forma más segura
//! de romperlo, así que el escritorio tiene que avisar. Pero avisar no alcanza:
//! `pacman -Syu` puede dejar el equipo peor de lo que estaba, y las maneras son
//! conocidas y pocas. Este módulo es la comprobación previa.
//!
//! # Qué mira, y por qué cada cosa
//!
//! **El espacio en `/boot`.** Es el que deja un sistema que **no arranca**: si
//! `pacman` se queda sin lugar a mitad de escribir el initramfs, el kernel
//! nuevo queda sin su initramfs y el viejo ya no está. Por eso el instalador le
//! da 1 GiB, y por eso esto se comprueba antes y no después.
//!
//! **Si cambia el kernel.** Decide si hay que reiniciar y si hace falta espacio
//! en `/boot`. Los módulos de una versión no los carga un kernel de otra, así
//! que hasta reiniciar no se puede enchufar nada nuevo.
//!
//! **Los `.pacnew`.** Un archivo de configuración que cambió upstream y quedó
//! al lado del nuestro sin aplicar. No rompe nada hoy y rompe algo dentro de
//! seis meses, cuando nadie se acuerde.
//!
//! # Por qué es todo función pura
//!
//! Lo que ejecuta los comandos vive en `commands/`; acá sólo se interpreta lo
//! que devolvieron. Es lo mismo que se hizo con los analizadores del
//! instalador, y por la misma razón: una decisión que se toma leyendo texto de
//! otro programa se tiene que poder probar con ese texto escrito a mano, sin
//! depender de qué actualizaciones haya hoy en el equipo que corre los tests.

use serde::Serialize;

/// Un paquete que se va a actualizar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Actualizacion {
    pub nombre: String,
    pub version_vieja: String,
    pub version_nueva: String,
}

/// Lee la salida de `checkupdates`, que es la de `pacman -Qu`.
///
/// El formato es `nombre vieja -> nueva`, una por línea. Se descarta todo lo
/// que no tenga esa forma en vez de intentar adivinar: la salida puede traer
/// avisos, líneas vacías, y —si alguien exporta `COLOR`— códigos de escape.
///
/// Los códigos de escape se sacan antes de partir. `checkupdates` los filtra
/// cuando escribe a una terminal, pero acá se lo llama con la salida
/// redirigida y basta con que `pacman.conf` tenga `Color` para que aparezcan.
/// Sin sacarlos, el nombre del primer paquete vendría con basura adelante y
/// ninguna comparación contra él funcionaría.
pub fn parsear_actualizaciones(salida: &str) -> Vec<Actualizacion> {
    salida
        .lines()
        .filter_map(|linea| {
            let limpia = sin_escapes(linea);
            let mut partes = limpia.split_whitespace();
            let nombre = partes.next()?;
            let vieja = partes.next()?;
            if partes.next()? != "->" {
                return None;
            }
            let nueva = partes.next()?;
            // Una quinta palabra quiere decir que esto no era lo que
            // parecía; se descarta en vez de quedarse con las primeras cuatro.
            if partes.next().is_some() || nombre.is_empty() {
                return None;
            }
            Some(Actualizacion {
                nombre: nombre.to_string(),
                version_vieja: vieja.to_string(),
                version_nueva: nueva.to_string(),
            })
        })
        .collect()
}

/// Saca los códigos de escape ANSI de una línea.
fn sin_escapes(linea: &str) -> String {
    let mut salida = String::with_capacity(linea.len());
    let mut chars = linea.chars();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            salida.push(c);
            continue;
        }
        // `ESC [ ... letra`. Se descarta hasta la letra final inclusive.
        for c in chars.by_ref() {
            if c.is_ascii_alphabetic() {
                break;
            }
        }
    }
    salida
}

/// Si un paquete es un kernel, mirando **qué archivos tiene**.
///
/// Por los archivos y no por el nombre. Un `nombre.starts_with("linux")`
/// parece razonable hasta que se lo mira de cerca: `linux-firmware` no es un
/// kernel y `linux-cachyos-bore` sí, y la lista de variantes no termina nunca
/// —cada sabor de cada derivada agrega la suya—. Lo que sí es invariable es
/// que un paquete de kernel instala su imagen en
/// `usr/lib/modules/<version>/vmlinuz`, que es de donde el hook de mkinitcpio
/// la saca.
///
/// Recibe la lista de archivos —lo que devuelve `pacman -Qlq`— y no el nombre,
/// para que la decisión se pueda probar sin tener el paquete instalado.
pub fn es_paquete_de_kernel(archivos: &str) -> bool {
    // Con el prefijo, no sólo el nombre del archivo. `usr/share/ejemplo/vmlinuz`
    // termina igual y no es un kernel: darlo por bueno haría pedir espacio en
    // `/boot` y avisar que hay que reiniciar por un paquete que no tiene nada
    // que ver.
    //
    // El `trim_end_matches('/')` es porque `pacman -Qlq` lista los directorios
    // con barra al final.
    archivos
        .lines()
        .map(|l| l.trim().trim_end_matches('/'))
        .any(|l| l.trim_start_matches('/').starts_with("usr/lib/modules/") && l.ends_with("/vmlinuz"))
}

/// El veredicto de la comprobación previa.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Preflight {
    /// Cuántos paquetes se actualizan.
    pub paquetes: usize,
    /// Los kernels que cambian de versión, por nombre.
    pub kernels: Vec<String>,
    /// Archivos de configuración nuevos sin aplicar.
    pub pacnew: Vec<String>,
    /// Lo que hay libre en el sistema de archivos de `/boot`.
    pub boot_disponible_bytes: u64,
    /// Lo que la actualización va a necesitar ahí. Cero si no cambia el kernel.
    pub boot_necesario_bytes: u64,
    /// Si entra en `/boot`. Es la única comprobación que **frena**: las demás
    /// avisan. Un `pacman` que se queda sin espacio a mitad de escribir el
    /// initramfs deja el kernel nuevo sin su initramfs y el viejo ya no está,
    /// o sea un sistema que no arranca, y eso no se arregla desde el
    /// escritorio.
    ///
    /// Va calculado y no se recalcula en la pantalla, a propósito: una regla
    /// que decide si algo se frena y vive en dos lados es una regla que se
    /// separa, y el lado que quede desactualizado es el que deja pasar.
    pub entra_en_boot: bool,
    /// Si hay que reiniciar después. Cambió el kernel: los módulos de una
    /// versión no los carga un kernel de otra, así que hasta reiniciar no se
    /// puede enchufar nada que necesite uno que todavía no esté cargado — una
    /// impresora, un teléfono, una tarjeta de red USB.
    pub pide_reinicio: bool,
}

impl Preflight {
    /// El veredicto, con las dos conclusiones ya sacadas.
    ///
    /// Es el único constructor para que no haya forma de armar un `Preflight`
    /// cuyas conclusiones no se sigan de sus números.
    pub fn nuevo(
        paquetes: usize,
        kernels: Vec<String>,
        pacnew: Vec<String>,
        boot_disponible_bytes: u64,
        boot_necesario_bytes: u64,
    ) -> Self {
        Self {
            paquetes,
            entra_en_boot: boot_disponible_bytes >= boot_necesario_bytes,
            pide_reinicio: !kernels.is_empty(),
            kernels,
            pacnew,
            boot_disponible_bytes,
            boot_necesario_bytes,
        }
    }
}

/// Cuánto espacio va a hacer falta en `/boot` para actualizar los kernels.
///
/// No sale del tamaño del paquete: el kernel moderno pone su imagen en
/// `/usr/lib/modules`, y lo que va a `/boot` lo escribe después el hook de
/// mkinitcpio —la imagen copiada y **los dos** initramfs, que se generan y no
/// vienen en ningún paquete—.
///
/// Así que se estima con lo que hay: para cada kernel que se actualiza, tanto
/// como ocupa hoy el juego de archivos **más grande**. Es la mejor estimación
/// disponible y va del lado seguro, porque mkinitcpio escribe a un temporal y
/// renombra: durante ese rato conviven el archivo viejo y el nuevo.
///
/// El más grande y no el promedio. Con un `linux` de 600 MiB y un `linux-lts`
/// de 200, el promedio da 400 y alcanzaría para dejar pasar la actualización
/// del grande con 400 libres — que es justo la que no entra. Un promedio no es
/// una cota superior, y acá lo que hace falta es una cota superior.
pub fn espacio_necesario_en_boot(kernels: usize, ocupado_por_el_mayor: u64) -> u64 {
    (kernels as u64).saturating_mul(ocupado_por_el_mayor)
}

/// Lo que ocupa el juego de archivos del kernel **más grande**, más el
/// microcódigo.
///
/// Recibe los archivos de `/boot` como `(nombre, bytes)` y devuelve `None` si
/// no hay ninguno reconocible — que el que llama traduce a una estimación fija
/// en vez de a cero, porque cero diría «no hace falta espacio» y dejaría pasar
/// justo la actualización que no entra.
///
/// Se agrupa por kernel con lo que va después del guion: `vmlinuz-linux` e
/// `initramfs-linux.img` son del mismo, e `initramfs-linux-fallback.img`
/// también. El microcódigo no es de ninguno —lo comparten— y se suma aparte,
/// porque una actualización de `intel-ucode` también lo reescribe.
pub fn ocupado_por_el_mayor(archivos: &[(String, u64)]) -> Option<u64> {
    use std::collections::HashMap;

    let mut por_kernel: HashMap<&str, u64> = HashMap::new();
    let mut microcodigo = 0u64;

    for (nombre, tamano) in archivos {
        if nombre.ends_with("-ucode.img") {
            microcodigo += tamano;
            continue;
        }
        let Some(resto) = nombre
            .strip_prefix("vmlinuz-")
            .or_else(|| nombre.strip_prefix("initramfs-"))
        else {
            continue;
        };
        let base = resto
            .trim_end_matches(".img")
            .trim_end_matches("-fallback");
        *por_kernel.entry(base).or_default() += tamano;
    }

    por_kernel
        .values()
        .max()
        .filter(|m| **m > 0)
        .map(|m| m + microcodigo)
}

/// Los archivos `.pacnew` y `.pacsave` que dejó pacman, de la salida de
/// `pacdiff --output`.
///
/// Una ruta por línea. Se filtra lo que no sea una ruta absoluta porque
/// `pacdiff` escribe también avisos por la salida estándar cuando no encuentra
/// una herramienta de comparación.
pub fn parsear_pacnew(salida: &str) -> Vec<String> {
    salida
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with('/') && (l.ends_with(".pacnew") || l.ends_with(".pacsave")))
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La salida de `checkupdates` tal cual, con las tres formas que aparecen:
    /// un cambio de versión, uno de `pkgrel` y uno con época.
    const SALIDA: &str = "\
linux-cachyos 7.2.3-1 -> 7.2.4-1
pacman 7.0.0-8 -> 7.0.0-9
amd-ucode 1:20260810-2 -> 1:20260912-1
";

    #[test]
    fn se_leen_las_actualizaciones() {
        let a = parsear_actualizaciones(SALIDA);
        assert_eq!(a.len(), 3);
        assert_eq!(a[0].nombre, "linux-cachyos");
        assert_eq!(a[0].version_vieja, "7.2.3-1");
        assert_eq!(a[0].version_nueva, "7.2.4-1");
        // La época va pegada a la versión y no se toca.
        assert_eq!(a[2].version_vieja, "1:20260810-2");
    }

    /// **Sin actualizaciones no hay actualizaciones.**
    ///
    /// `checkupdates` sale con 2 y sin escribir nada. Un analizador que
    /// devolviera una entrada vacía haría que el aviso apareciera siempre.
    #[test]
    fn una_salida_vacia_no_inventa_nada() {
        assert!(parsear_actualizaciones("").is_empty());
        assert!(parsear_actualizaciones("\n\n  \n").is_empty());
    }

    /// **Lo que no tiene la forma esperada se descarta.**
    ///
    /// La salida puede traer avisos por la misma vía. Quedarse con las
    /// primeras palabras de un aviso daría un paquete inventado, y con eso el
    /// preflight consultaría `pacman -Qlq` por algo que no existe.
    #[test]
    fn lo_que_no_es_una_actualizacion_se_descarta() {
        let raro = "\
:: Sincronizando la base de datos de paquetes...
warning: config file /etc/pacman.conf, line 5: directive 'Foo' in section 'options' not recognized.
foo 1.0 => 2.0
sin flecha 1.0 2.0
demasiadas 1.0 -> 2.0 palabras
paquete 1.0 -> 2.0
";
        let a = parsear_actualizaciones(raro);
        assert_eq!(a.len(), 1, "{a:?}");
        assert_eq!(a[0].nombre, "paquete");
    }

    /// **Los códigos de color no se cuelan en el nombre.**
    ///
    /// `checkupdates` los filtra cuando escribe a una terminal, y acá se lo
    /// llama con la salida redirigida: basta con que `pacman.conf` tenga
    /// `Color` para que aparezcan. Sin sacarlos, el nombre del paquete viene
    /// con basura adelante y ninguna comparación contra él funciona — ni la de
    /// kernel, ni la que muestra la pantalla.
    #[test]
    fn los_codigos_de_color_no_se_cuelan() {
        let coloreada = "\u{1b}[1mlinux\u{1b}[0m 7.2.3-1 -> \u{1b}[1;32m7.2.4-1\u{1b}[0m\n";
        let a = parsear_actualizaciones(coloreada);
        assert_eq!(a.len(), 1, "{a:?}");
        assert_eq!(a[0].nombre, "linux");
        assert_eq!(a[0].version_nueva, "7.2.4-1");
    }

    /// **Un kernel se reconoce por dónde pone su imagen, no por su nombre ni
    /// por el nombre del archivo.**
    ///
    /// Lo primero es la diferencia entre funcionar en Arch y funcionar en
    /// cualquier derivada: `linux-cachyos-bore` es un kernel y
    /// `linux-firmware` no, y la lista de sabores no termina nunca.
    ///
    /// Lo segundo es que la ruta entera importa: un `vmlinuz` suelto en
    /// `usr/share` no es un kernel, y darlo por bueno haría pedir espacio en
    /// `/boot` y avisar que hay que reiniciar por un paquete cualquiera.
    #[test]
    fn un_kernel_se_reconoce_por_donde_pone_su_imagen() {
        let kernel = "\
usr/lib/modules/7.2.3-1-cachyos/
usr/lib/modules/7.2.3-1-cachyos/vmlinuz
usr/lib/modules/7.2.3-1-cachyos/pkgbase
";
        assert!(es_paquete_de_kernel(kernel));

        // `linux-firmware`: empieza con «linux» y no es un kernel.
        let firmware = "\
usr/lib/firmware/
usr/lib/firmware/amdgpu/
usr/lib/firmware/amdgpu/aldebaran_sos.bin
";
        assert!(!es_paquete_de_kernel(firmware));

        // Ni un paquete que apenas nombre la palabra.
        assert!(!es_paquete_de_kernel("usr/share/doc/foo/vmlinuz.txt\n"));
        assert!(!es_paquete_de_kernel("usr/bin/vmlinuz-tool\n"));
        assert!(!es_paquete_de_kernel(""));

        // Y tampoco un archivo que se llame igual pero esté en otro lado. El
        // nombre del archivo solo no alcanza: lo que define a un kernel es que
        // su imagen esté donde el hook de mkinitcpio la va a buscar.
        assert!(!es_paquete_de_kernel("usr/share/ejemplo/vmlinuz\n"));
        assert!(!es_paquete_de_kernel("opt/loquesea/vmlinuz\n"));
        // Con barra al principio, como lo lista `pacman -Qoq`, sí.
        assert!(es_paquete_de_kernel("/usr/lib/modules/6.1.0/vmlinuz\n"));
    }

    /// **Del `/boot` se toma el kernel más grande, no el promedio.**
    ///
    /// Es el caso que hace la diferencia: con un `linux` de 600 MiB y un
    /// `linux-lts` de 200, el promedio da 400 y alcanzaría para dejar pasar la
    /// actualización del grande con 400 libres — que es justo la que no entra.
    /// Un promedio no es una cota superior, y acá hace falta una cota
    /// superior.
    #[test]
    fn del_boot_se_toma_el_kernel_mas_grande() {
        let mib = 1024 * 1024;
        let archivos: Vec<(String, u64)> = vec![
            ("vmlinuz-linux".into(), 20 * mib),
            ("initramfs-linux.img".into(), 80 * mib),
            ("initramfs-linux-fallback.img".into(), 500 * mib),
            ("vmlinuz-linux-lts".into(), 20 * mib),
            ("initramfs-linux-lts.img".into(), 60 * mib),
            ("initramfs-linux-lts-fallback.img".into(), 120 * mib),
            ("intel-ucode.img".into(), 5 * mib),
            ("amd-ucode.img".into(), mib),
            // Lo que no es de ningún kernel no cuenta.
            ("grub".into(), 900 * mib),
            ("loader".into(), 900 * mib),
        ];

        // El mayor es `linux`: 20+80+500 = 600. Más los 6 de microcódigo.
        assert_eq!(ocupado_por_el_mayor(&archivos), Some(606 * mib));

        // El promedio de los dos daría (600+200)/2 = 400, que es menos que lo
        // que hace falta para el grande.
        assert!(ocupado_por_el_mayor(&archivos).unwrap() > 400 * mib);
    }

    /// **Sin archivos reconocibles no se dice «cero».**
    ///
    /// Cero querría decir «no hace falta espacio», que es la respuesta
    /// peligrosa: dejaría pasar justo la actualización que no entra. El que
    /// llama lo traduce a una estimación fija.
    #[test]
    fn un_boot_ilegible_no_da_cero() {
        assert_eq!(ocupado_por_el_mayor(&[]), None);
        assert_eq!(
            ocupado_por_el_mayor(&[("grub".into(), 900), ("EFI".into(), 100)]),
            None
        );
        // Ni uno donde el único kernel está vacío.
        assert_eq!(ocupado_por_el_mayor(&[("vmlinuz-linux".into(), 0)]), None);
    }

    /// **Los `.pacnew` se leen y los avisos no.**
    #[test]
    fn se_leen_los_pacnew() {
        let salida = "\
==> WARNING: no merge program found
/etc/pacman.conf.pacnew
/etc/ssh/sshd_config.pacnew
/etc/locale.gen.pacsave
esto no es una ruta
/etc/algo.conf
";
        let p = parsear_pacnew(salida);
        assert_eq!(
            p,
            [
                "/etc/pacman.conf.pacnew",
                "/etc/ssh/sshd_config.pacnew",
                "/etc/locale.gen.pacsave"
            ]
        );
    }

    /// **La comprobación de `/boot` frena, y las demás avisan.**
    ///
    /// Es la única que puede dejar un sistema que no arranca: `pacman` sin
    /// espacio a mitad de escribir el initramfs deja el kernel nuevo sin el
    /// suyo y el viejo ya no está.
    #[test]
    fn el_veredicto_dice_lo_que_frena_y_lo_que_avisa() {
        let necesario = 300 * 1024 * 1024;
        let con = |disponible| {
            Preflight::nuevo(
                40,
                vec!["linux".into()],
                vec!["/etc/pacman.conf.pacnew".into()],
                disponible,
                necesario,
            )
        };

        assert!(con(400 * 1024 * 1024).entra_en_boot);
        // Justo al borde entra: lo que hace falta es lo que hace falta.
        assert!(con(necesario).entra_en_boot);
        assert!(!con(necesario - 1).entra_en_boot);
        assert!(con(necesario).pide_reinicio);

        // Sin cambio de kernel no hace falta espacio ni reiniciar, aunque se
        // actualicen cuarenta paquetes.
        let sin_kernel = Preflight::nuevo(
            40,
            Vec::new(),
            Vec::new(),
            0,
            espacio_necesario_en_boot(0, necesario),
        );
        assert!(!sin_kernel.pide_reinicio);
        assert_eq!(sin_kernel.boot_necesario_bytes, 0);
        assert!(sin_kernel.entra_en_boot, "sin kernel siempre entra");
    }

    /// **Contra el pacman de este equipo: el formato es el que creemos.**
    ///
    /// Los tests de arriba usan salidas escritas a mano, así que codifican lo
    /// que suponemos del formato. Éste se lo pregunta a `pacman`: si algún día
    /// cambia cómo escribe `-Qu`, o cómo lista archivos, acá se ve — y no en
    /// el equipo de alguien con el aviso de actualizaciones mudo.
    ///
    /// Se saltea donde no haya `pacman`, que es cualquier contenedor de
    /// integración.
    #[test]
    fn el_formato_de_pacman_es_el_que_se_espera() {
        use std::process::Command;

        let corre = |args: &[&str]| -> Option<String> {
            let s = Command::new("pacman").args(args).output().ok()?;
            s.status
                .success()
                .then(|| String::from_utf8_lossy(&s.stdout).into_owned())
        };
        let Some(_) = corre(&["-V"]) else {
            eprintln!("pacman no está: se saltea");
            return;
        };

        // Que la lista de archivos de un kernel instalado lo delate. Se busca
        // el kernel por `/usr/lib/modules/<x>/vmlinuz`, que existe en
        // cualquier Arch, y se le pregunta a pacman de quién es.
        let Some(imagen) = std::fs::read_dir("/usr/lib/modules")
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path().join("vmlinuz"))
            .find(|p| p.exists())
        else {
            eprintln!("sin kernels en /usr/lib/modules: se saltea");
            return;
        };
        let Some(duenio) = corre(&["-Qoq", &imagen.to_string_lossy()]) else {
            return;
        };
        let duenio = duenio.trim();
        assert!(!duenio.is_empty(), "nadie es dueño de {imagen:?}");

        let archivos = corre(&["-Qlq", duenio]).unwrap_or_default();
        assert!(
            es_paquete_de_kernel(&archivos),
            "{duenio} tiene {imagen:?} y no se lo reconoce como kernel"
        );

        // Y que un paquete que no lo es, no lo sea. `pacman` está siempre.
        let de_pacman = corre(&["-Qlq", "pacman"]).unwrap_or_default();
        assert!(!de_pacman.is_empty());
        assert!(!es_paquete_de_kernel(&de_pacman), "pacman no es un kernel");

        // El formato de `-Qu`: si hay actualizaciones pendientes en este
        // equipo, tienen que parsearse todas. Si no hay, no hay nada que
        // comprobar y tampoco es un fallo.
        if let Some(pendientes) = corre(&["-Qu"]) {
            let lineas = pendientes.lines().filter(|l| !l.trim().is_empty()).count();
            let leidas = parsear_actualizaciones(&pendientes).len();
            assert_eq!(
                leidas, lineas,
                "pacman -Qu escribió {lineas} líneas y se leyeron {leidas}:\n{pendientes}"
            );
        }
    }

    /// **Dos kernels que se actualizan piden el doble.**
    #[test]
    fn el_espacio_crece_con_la_cantidad_de_kernels() {
        let uno = 250 * 1024 * 1024;
        assert_eq!(espacio_necesario_en_boot(0, uno), 0);
        assert_eq!(espacio_necesario_en_boot(1, uno), uno);
        assert_eq!(espacio_necesario_en_boot(2, uno), 2 * uno);
        // Y no desborda con números absurdos, que darían un valor chico y
        // dejarían pasar la actualización que no entra.
        assert_eq!(espacio_necesario_en_boot(usize::MAX, u64::MAX), u64::MAX);
    }
}
