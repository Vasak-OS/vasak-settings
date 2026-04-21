# vasak-settings

Aplicacion de configuracion de VasakOS construida con Tauri 2, Vue 3, TypeScript y Tailwind.

Permite gestionar temas, esquemas de color, iconos, fondos, escritorio, conectividad, audio y fuentes del sistema desde una interfaz unificada.

## Stack

- Frontend: Vue 3 + Vite + TypeScript + Pinia + Vue Router + Tailwind
- Backend desktop: Tauri 2 (Rust)
- Tooling JS/TS: Bun

## Requisitos

### 1) Bun

Instala Bun (si aun no lo tienes):

```bash
curl -fsSL https://bun.sh/install | bash
```

Verifica:

```bash
bun --version
```

### 2) Toolchain Rust

Tauri necesita Rust para compilar el backend:

```bash
rustc --version
cargo --version
```

Si no lo tienes instalado:

```bash
curl https://sh.rustup.rs -sSf | sh
```

### 3) Dependencias del sistema (Linux)

Para compilar apps Tauri en Linux se requieren librerias de WebKitGTK y GTK.
Instala los paquetes equivalentes de tu distro antes de ejecutar la app.

## Instalacion

Desde la raiz de este proyecto:

```bash
bun install
```

## Desarrollo (usando Bun)

### Frontend (Vite)

```bash
bun run dev
```

### App desktop (Tauri)

```bash
bun run tauri dev
```

## Build

### Build del frontend

```bash
bun run build
```

### Build de la app desktop

```bash
bun run tauri build
```

## Calidad de codigo

### Lint

```bash
bun run lint
```

### Lint con autocorreccion y formato

```bash
bun run lint:fix
```

### Formato

```bash
bun run format
```

## Scripts disponibles

- `bun run dev`: levanta Vite en modo desarrollo
- `bun run build`: typecheck + build de frontend
- `bun run preview`: previsualiza el build de frontend
- `bun run tauri dev`: ejecuta la app desktop en desarrollo
- `bun run tauri build`: genera build de produccion de Tauri
- `bun run lint`: chequeo con Biome
- `bun run lint:fix`: corrige issues y formatea
- `bun run format`: aplica formato con Biome
