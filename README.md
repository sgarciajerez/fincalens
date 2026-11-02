# FincaLens

FincaLens es un proyecto de portfolio para explorar una aplicación de análisis de inmuebles con **Lit**, **Open Cells** y una extensión **Chrome Manifest V3**. Captura datos públicos de un anuncio, hace explícitos los supuestos financieros y permite comparar y revisar escenarios.

> Prototipo local para desarrollo y demostración. No ofrece autenticación multiusuario ni está preparado para alojar datos de clientes. Los alquileres, impuestos, costes y alertas deben verificarse de forma independiente.

## Qué incluye

- Cartera con filtros, búsqueda, favoritos e exportación CSV.
- Análisis manual de inmuebles e informes con procedencia de datos, supuestos, riesgos detectados, sensibilidad, checklist e historial de precio.
- Comparación lado a lado de hasta tres inmuebles.
- Revisiones inmutables para escenarios optimistas y conservadores, con enlace temporal de solo lectura revocable.
- Extensión Chrome MV3 que captura texto visible de anuncios de Idealista España después de que el usuario pulse el botón.
- API Fastify, SQLite por defecto y PostgreSQL opcional.
- Cálculo financiero TypeScript compartido y determinista. Sin rentas de mercado ni puntuaciones generadas por IA.

Los cuatro inmuebles de demostración son ejemplos sintéticos, no anuncios reales.

## Requisitos

- Node.js 24 o posterior.
- npm incluido con Node.
- Google Chrome para cargar la extensión durante el desarrollo.

## Desarrollo local

```sh
npm ci
npm run dev
```

Abre <http://127.0.0.1:4173>. La aplicación web y la API se ejecutan en tu equipo; la API escucha solo en `127.0.0.1:4174`. SQLite crea su base en `work/data/fincalens.sqlite` (excluida de Git). Desde la cartera puedes cargar ejemplos sintéticos para explorar informes y comparativas.

## Extensión Chrome

```sh
npm run build
```

En `chrome://extensions`, activa el modo desarrollador y usa **Cargar descomprimida** para seleccionar `dist/extension`. Con la aplicación local abierta, ve a **Extensión**, genera un código temporal e introdúcelo en el popup. Abre después una ficha de vivienda de Idealista España y pulsa **Capturar anuncio**.

La extensión solicita acceso a la pestaña activa, almacenamiento local y páginas de anuncios de Idealista. Lee únicamente la ficha activa al pulsar el botón y envía el texto capturado a la API local. El token de instalación se almacena en `chrome.storage.local` y se puede revocar desde el popup.

## Comandos

| Comando | Acción |
| --- | --- |
| `npm run dev` | API y aplicación web en modo desarrollo |
| `npm run build` | Bundle web y extensión MV3 en `dist/` |
| `npm run typecheck` | Comprobación estática TypeScript |
| `npm test` | Pruebas del motor, API y adaptador |
| `npm run test:prototype` | Comprobación del prototipo HTML original |
| `npm run format` | Formato Prettier de las fuentes |

## Estructura

```text
apps/
  api/                 Fastify, sesiones locales, informes y persistencia
  extension/           Popup y service worker de Chrome MV3
  web/                 Aplicación Lit con rutas Open Cells
packages/
  contracts/           Esquemas y tipos compartidos
  domain/              Motor financiero puro y versionado
  fixtures/            Datos sintéticos para demostración
  portal-adapters/     Captura visible y normalización de Idealista
design/                Prototipo HTML inicial y sistema visual
tests/                 Cobertura del dominio y los flujos HTTP
```

## Limitaciones conocidas

- El extractor depende de la estructura pública visible de Idealista y puede necesitar adaptación cuando cambie el sitio.
- No hay proveedor de alquileres comparables, valoración automática, OCR ni análisis mediante IA.
- Los impuestos se representan como porcentaje supuesto; no se calcula el impuesto autonómico aplicable a cada operación.
- El espacio local es de usuario único y el modo de enlace compartido es público por URL hasta su caducidad o revocación.
- La configuración de PostgreSQL es opcional; el desarrollo por defecto no requiere Docker.
- Antes de un despliegue público hacen falta autenticación multiusuario, gestión de secretos, cuotas, observabilidad, copias y una revisión legal de las fuentes de datos.

## Tecnologías

TypeScript · Lit · Open Cells · Vite · Fastify · Zod · SQLite (`node:sqlite`) · PostgreSQL · Vitest · Chrome Extensions MV3
