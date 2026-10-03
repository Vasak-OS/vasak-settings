//! Los fondos de pantalla desde la línea de comandos, sin abrir la ventana.
//!
//! ```text
//! vasak-settings --wallpaper list                 # los fondos oficiales
//! vasak-settings --wallpaper thumbnails RUTA…     # una miniatura por ruta
//! vasak-settings --wallpaper prepare RUTA         # un video, listo para fondo
//! vasak-settings --wallpaper pixels RUTA          # la muestra para sacar colores
//! ```
//!
//! Lo usa el selector rápido de fondos del escritorio (vasak-desktop#133). Ese
//! selector necesita lo mismo que la pantalla de fondos de acá: la lista de los
//! oficiales, miniaturas chicas en lugar de los originales de 4K, y que un video
//! se prepare antes de guardarlo —bajarlo a la resolución de la pantalla,
//! limitarlo a 30 fps, sacarle el audio—. Si el escritorio lo hiciera por su
//! cuenta habría dos preparaciones que se separan; con esto hay una sola, la de
//! `commands::wallpaper_video`, y el escritorio se la pide a este programa.
//!
//! `pixels` es para «Seguir al fondo» (vasak-settings#134), que corre en el
//! escritorio: la muestra en RGB crudo del mismo cuadro que la miniatura, la
//! misma que lee Apariencia con el comando `wallpaper_pixels`. Una sola lectura
//! del fondo para las dos.
//!
//! # Por qué antes de Tauri
//!
//! Se atiende en `run()` **antes** de armar la aplicación. Si no:
//!
//! - el complemento de instancia única le pasaría los argumentos a la ventana
//!   que ya estuviera abierta y este proceso saldría sin escribir nada;
//! - y sin ventana abierta se abriría una, cuando lo que se pidió es un dato.
//!
//! # Lo que escribe
//!
//! JSON en la salida estándar y código 0; un error en la salida de errores y
//! código 1. La configuración **no** la toca: la clave `desktop.wallpaper` la
//! escribe quien llama, con `tauri-plugin-config-manager`, igual que la pantalla
//! de fondos. Escribir `vasak.conf` desde acá, sin el complemento, sería una
//! segunda forma de guardar la configuración, y es justo lo que el complemento
//! existe para evitar.

use serde_json::{json, Value};

use crate::commands::{system_config, wallpaper_colors, wallpaper_video};

/// El argumento que lo activa, siempre primero. Con guiones porque ninguna
/// sección del router empieza así (`vasak-settings appearance-wallpaper`), y
/// se atiende antes de que el primer argumento llegue al router como sección.
pub const FLAG: &str = "--wallpaper";

/// Lo que se pidió.
#[derive(Debug, PartialEq)]
pub enum Request {
    List,
    Thumbnails(Vec<String>),
    Prepare(String),
    Pixels(String),
}

/// Lee los argumentos. `None` si no son de acá —la aplicación arranca como
/// siempre—; `Some(Err)` si son de acá pero están mal.
pub fn parse_request<I>(args: I) -> Option<Result<Request, String>>
where
    I: IntoIterator<Item = String>,
{
    let mut args = args.into_iter().skip(1);
    if args.next().as_deref() != Some(FLAG) {
        return None;
    }

    let action = args.next();
    let rest: Vec<String> = args.collect();

    Some(match action.as_deref() {
        Some("list") if rest.is_empty() => Ok(Request::List),
        Some("thumbnails") if !rest.is_empty() => Ok(Request::Thumbnails(rest)),
        Some("prepare") if rest.len() == 1 => Ok(Request::Prepare(rest[0].clone())),
        Some("pixels") if rest.len() == 1 => Ok(Request::Pixels(rest[0].clone())),
        _ => Err(format!(
            "uso: vasak-settings {FLAG} list | thumbnails RUTA… | prepare RUTA | pixels RUTA"
        )),
    })
}

/// Hace lo pedido y devuelve lo que se escribe en la salida.
async fn answer(request: Request) -> Result<Value, String> {
    match request {
        Request::List => Ok(json!(system_config::get_official_wallpapers().await?)),
        Request::Thumbnails(paths) => {
            // De a una y en orden, como la pantalla de fondos: diez ffmpeg a la
            // vez sobre originales de 5K se comen la máquina. Una que falla
            // queda en `null` y no tira las demás.
            let mut thumbnails = serde_json::Map::new();
            for path in paths {
                let thumbnail = wallpaper_video::wallpaper_thumbnail(path.clone())
                    .await
                    .ok();
                thumbnails.insert(path, json!(thumbnail));
            }
            Ok(Value::Object(thumbnails))
        }
        Request::Prepare(path) => {
            // El avance va a la salida de errores, una línea por cambio: quien
            // llama lee la respuesta de la salida estándar y no tiene que
            // separarla de nada.
            let prepared = wallpaper_video::prepare_video(path, |percent| {
                eprintln!("progress {percent}");
            })
            .await?;
            Ok(json!(prepared))
        }
        Request::Pixels(path) => Ok(json!(wallpaper_colors::wallpaper_pixels(path).await?)),
    }
}

/// El código de salida, si estos argumentos eran de acá.
pub fn run_from_args<I>(args: I) -> Option<i32>
where
    I: IntoIterator<Item = String>,
{
    let request = match parse_request(args)? {
        Ok(request) => request,
        Err(usage) => {
            eprintln!("{usage}");
            return Some(2);
        }
    };

    Some(match tauri::async_runtime::block_on(answer(request)) {
        Ok(value) => {
            println!("{value}");
            0
        }
        Err(error) => {
            eprintln!("{error}");
            1
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("vasak-settings")
            .chain(list.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn sin_la_bandera_la_aplicacion_arranca_como_siempre() {
        assert_eq!(parse_request(args(&[])), None);
        assert_eq!(parse_request(args(&["appearance-wallpaper"])), None);
        // La bandera tiene que ser el primer argumento: más atrás puede ser el
        // nombre de un archivo cualquiera.
        assert_eq!(parse_request(args(&["home", "--wallpaper", "list"])), None);
    }

    #[test]
    fn lee_los_cuatro_pedidos() {
        assert_eq!(
            parse_request(args(&["--wallpaper", "list"])),
            Some(Ok(Request::List))
        );
        assert_eq!(
            parse_request(args(&["--wallpaper", "thumbnails", "/a.jpg", "/b.mp4"])),
            Some(Ok(Request::Thumbnails(vec![
                "/a.jpg".into(),
                "/b.mp4".into()
            ])))
        );
        assert_eq!(
            parse_request(args(&["--wallpaper", "prepare", "/b.mp4"])),
            Some(Ok(Request::Prepare("/b.mp4".into())))
        );
        assert_eq!(
            parse_request(args(&["--wallpaper", "pixels", "/b.mp4"])),
            Some(Ok(Request::Pixels("/b.mp4".into())))
        );
    }

    #[test]
    fn lo_mal_armado_es_de_aca_pero_es_un_error() {
        for bad in [
            &["--wallpaper"][..],
            &["--wallpaper", "apply"],
            &["--wallpaper", "thumbnails"],
            &["--wallpaper", "prepare"],
            &["--wallpaper", "prepare", "/a.mp4", "/b.mp4"],
            &["--wallpaper", "list", "/sobra"],
            &["--wallpaper", "pixels"],
            &["--wallpaper", "pixels", "/a.jpg", "/b.jpg"],
        ] {
            assert!(
                matches!(parse_request(args(bad)), Some(Err(_))),
                "{bad:?} tenía que ser un error de uso"
            );
        }
    }

    /// Un fondo que no existe es un error, no una muestra vacía: el escritorio
    /// lo cuenta como ilegible y deja los colores como estaban.
    #[test]
    fn los_pixeles_de_un_fondo_que_no_existe_son_un_error() {
        let result =
            tauri::async_runtime::block_on(answer(Request::Pixels("/no/existe.jpg".into())));
        assert!(result.is_err());
    }

    #[test]
    fn una_miniatura_que_falla_queda_en_null_y_no_tira_las_demas() {
        let value = tauri::async_runtime::block_on(answer(Request::Thumbnails(vec![
            "/no/existe.jpg".into(),
        ])))
        .unwrap();
        assert_eq!(value, json!({ "/no/existe.jpg": null }));
    }
}
