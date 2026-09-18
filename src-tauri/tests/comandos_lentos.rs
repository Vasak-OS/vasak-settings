//! Que un comando lento no se cuele por la vía que corre en el hilo principal.
//!
//! # El fallo que esto evita
//!
//! `informe_de_actualizaciones` lanza `vasak-update --json`, que **tarda un
//! minuto largo**: comprueba contra los servidores. Estaba escrito sin `async`,
//! y la macro de Tauri compila un comando así por la vía `Blocking`, que corre
//! el cuerpo dentro del manejador de IPC — o sea, en el hilo principal, que en
//! Linux es el de GTK y el que dibuja.
//!
//! El resultado: entrar a Actualizaciones congelaba la aplicación entera
//! durante ese minuto. Ni la barra lateral respondía, y no se leía como «está
//! cargando» sino como que se colgó.
//!
//! # Por qué es un test del fuente
//!
//! Porque no hay nada que ejecutar. La diferencia vive en el tipo de la
//! función, la decide una macro al compilar y no deja rastro que se pueda
//! consultar después. Sacarle el `async` vuelve a compilar perfecto, pasa
//! cualquier prueba de comportamiento —el comando devuelve lo mismo— y congela
//! la ventana otra vez.

const FUENTE: &str = include_str!("../src/commands/actualizaciones.rs");

/// Los comandos de este archivo que lanzan un proceso que puede tardar.
///
/// Los de `systemctl` no están: contestan al instante y hacerlos `async` sería
/// ceremonia sin motivo. El criterio es «puede tardar», no «lanza un proceso».
const LENTOS: [&str; 1] = ["informe_de_actualizaciones"];

#[test]
fn los_comandos_lentos_no_bloquean_el_hilo_principal() {
    for comando in LENTOS {
        let declaracion = format!("pub async fn {comando}(");
        assert!(
            FUENTE.contains(&declaracion),
            "«{comando}» tiene que declararse `pub async fn`.\n\
             Sin `async`, la macro de Tauri lo corre en el hilo principal y la \
             ventana se congela hasta que termine — medido, un minuto largo en \
             el caso de vasak-update. Con `async` se despacha con \
             async_runtime::spawn y el hilo que dibuja sigue libre."
        );
    }
}

/// Y que la espera del proceso siga yendo a un hilo aparte.
///
/// `async` solo saca el problema del hilo principal pero no de todos lados:
/// `Command::output()` espera al proceso sin ceder, así que adentro de una
/// tarea asíncrona taparía un hilo del ejecutor durante el mismo minuto. La
/// ventana respondería y cualquier otro comando encolado atrás seguiría
/// esperando.
///
/// Se mira **dentro de la llamada a `spawn_blocking` del comando**, y no si la
/// palabra aparece en el archivo. Con lo segundo, un `spawn_blocking` de otra
/// función alcanzaba para que la prueba pasara mientras el comando volvía a
/// esperar al proceso en la tarea asíncrona.
#[test]
fn lo_que_espera_a_un_proceso_va_en_spawn_blocking() {
    for comando in LENTOS {
        let cuerpo =
            cuerpo_de(comando).unwrap_or_else(|| panic!("no se encontró el cuerpo de «{comando}»"));

        let adentro = argumento_de(&cuerpo, "spawn_blocking").unwrap_or_else(|| {
            panic!(
                "«{comando}» no llama a `spawn_blocking`.\n\
                 `Command::output()` no cede, y suelto en una tarea asíncrona tapa \
                 un hilo del ejecutor durante todo lo que tarde el proceso."
            )
        });

        assert!(
            adentro.contains(".output()"),
            "«{comando}» llama a `spawn_blocking`, pero la espera del proceso quedó \
             afuera.\nLo que va adentro es esto:\n{adentro}"
        );
    }
}

/// El cuerpo de una función del archivo, desde su llave hasta la que la cierra.
fn cuerpo_de(nombre: &str) -> Option<String> {
    let inicio = FUENTE.find(&format!("pub async fn {nombre}("))?;
    let llave = FUENTE[inicio..].find('{')? + inicio;
    Some(entre_pares(&FUENTE[llave..], '{', '}')?.to_string())
}

/// Lo que una llamada le pasa entre paréntesis.
fn argumento_de(texto: &str, funcion: &str) -> Option<String> {
    let inicio = texto.find(&format!("{funcion}("))? + funcion.len();
    Some(entre_pares(&texto[inicio..], '(', ')')?.to_string())
}

/// El contenido entre el primer delimitador de apertura y el que lo cierra.
///
/// Cuenta anidamiento, que es lo que hace falta acá: el cierre que importa no
/// es el primero que aparece, porque adentro hay más llamadas.
fn entre_pares(texto: &str, abre: char, cierra: char) -> Option<&str> {
    let comienzo = texto.find(abre)?;
    let mut hondura = 0usize;
    for (posicion, letra) in texto[comienzo..].char_indices() {
        if letra == abre {
            hondura += 1;
        } else if letra == cierra {
            hondura -= 1;
            if hondura == 0 {
                return Some(&texto[comienzo + 1..comienzo + posicion]);
            }
        }
    }
    None
}

#[test]
fn el_contador_de_pares_encuentra_el_cierre_que_corresponde() {
    // Con el primer cierre en lugar del que corresponde, el recorte se queda
    // con la mitad del cuerpo y la prueba de arriba diría cualquier cosa.
    assert_eq!(entre_pares("f(a(b), c)", '(', ')'), Some("a(b), c"));
    assert_eq!(entre_pares("{ { } x }", '{', '}'), Some(" { } x "));
    assert_eq!(entre_pares("f(a", '(', ')'), None);
}
