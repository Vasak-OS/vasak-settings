//! Que esta pantalla no se convierta en consumidora de cuentas.
//!
//! Configuración **administra** las cuentas en línea: las agrega, las quita y
//! muestra qué aplicaciones tienen acceso. No las usa — el correo lo lee la app
//! de correo, el calendario la de calendario, y los discos en la nube el gestor
//! de archivos.
//!
//! Eso no es una preferencia de estilo. `vasak-permissions` declara el alcance
//! de esta aplicación como **vacío**, así que un pedido de token se le niega sin
//! siquiera preguntar. Si alguien vuelve a registrar un comando que lee datos de
//! una cuenta, no va a fallar acá: va a fallar en ejecución, con un «FUERA DE
//! ALCANCE» en el diario que nadie va a estar mirando.
//!
//! Este test hace que falle antes, y con la explicación al lado.

/// Los comandos registrados se leen del fuente porque es donde están: la lista
/// del `invoke_handler` es una macro, y no hay forma de preguntarle en tiempo de
/// ejecución qué contiene sin levantar la aplicación entera.
const LIB: &str = include_str!("../src/lib.rs");

/// Comandos que leerían datos de una cuenta, y que por lo tanto esta pantalla no
/// puede tener.
///
/// Estaban registrados y **sin ningún consumidor**: nada en la interfaz los
/// llamaba. Se quitaron al declarar el alcance vacío, porque dejar un comando
/// que sólo puede fallar es peor que no tenerlo.
const PROHIBIDOS: [&str; 2] = ["get_access_token", "get_account_data"];

#[test]
fn configuracion_no_registra_comandos_que_lean_una_cuenta() {
    for comando in PROHIBIDOS {
        let registrado = format!("online_accounts::{comando},");
        assert!(
            !LIB.contains(&registrado),
            "«{comando}» volvió a registrarse en el invoke_handler.\n\
             Configuración administra las cuentas, no las consume: su alcance en \
             vasak-permissions es vacío, así que ese comando sólo podría fallar. \
             Si de verdad hace falta, primero hay que darle alcance a \
             /usr/bin/vasak-settings en SCOPED_BINARIES."
        );
    }
}

/// Lo que sí tiene que seguir registrado.
///
/// La otra mitad del test: uno que sólo comprueba ausencias pasa igual si
/// alguien borra el módulo entero, y entonces no estaría comprobando nada.
#[test]
fn los_comandos_de_administrar_cuentas_siguen_registrados() {
    for comando in [
        "list_accounts",
        "list_providers",
        "connect_oauth_account",
        "connect_nextcloud_account",
        "register_password_account",
        "remove_account",
    ] {
        assert!(
            LIB.contains(&format!("online_accounts::{comando},")),
            "falta «{comando}»: sin él la pantalla de cuentas deja de funcionar"
        );
    }
}

/// La prueba de conexión de correo **sí** se queda, y conviene decir por qué no
/// contradice al alcance vacío.
///
/// No pide nada al servicio de cuentas: habla directo con el servidor de correo
/// usando la contraseña que la persona acaba de escribir en el formulario. No
/// hay token de por medio, así que no hay permiso que pedir.
#[test]
fn la_prueba_de_conexion_no_necesita_alcance() {
    assert!(
        LIB.contains("mail_probe::test_mail_connection,"),
        "la prueba de conexión tiene que seguir registrada"
    );
}
