/**
 * Lo que tiene que estar listo antes de la primera prueba.
 *
 * El DOM y el complemento que compila los `.vue` —Bun los trata como un archivo
 * suelto y lo que se importa sin él es la ruta, no el componente—.
 *
 * Los dobles de Tauri **no** se ponen acá: este repositorio ya tiene pruebas
 * que doblan lo que necesitan desde su propio archivo, y un segundo
 * `mock.module` sobre el mismo módulo gana o pierde según el orden en que Bun
 * evalúe los archivos. Los componentes que se montan son de presentación y no
 * llaman al backend.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import './complemento-vue';

GlobalRegistrator.register();
