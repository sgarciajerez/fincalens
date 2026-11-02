# FincaLens

FincaLens es un proyecto de portfolio para explorar una aplicación de análisis de inmuebles con **Lit**, **Open Cells** y una extensión **Chrome Manifest V3**. Captura datos públicos de un anuncio, hace explícitos los supuestos financieros y permite comparar y revisar escenarios.

> Proyecto de portfolio en desarrollo. Incluye cuentas locales opcionales y referencias de alquiler aportadas por el usuario; todavía no es un servicio público listo para datos de clientes. Los alquileres, impuestos, costes y alertas deben verificarse de forma independiente.

## Qué incluye

- Cartera con filtros, búsqueda, favoritos e exportación CSV.
- Análisis manual de inmuebles e informes con procedencia de datos, supuestos, riesgos detectados, sensibilidad, checklist e historial de precio.
- Comparación lado a lado de hasta tres inmuebles.
- Revisiones inmutables para escenarios optimistas y conservadores, con enlace temporal de solo lectura revocable.
- Extensión Chrome MV3 que captura texto visible de anuncios de Idealista España después de que el usuario pulse el botón.
- API Fastify, SQLite por defecto y PostgreSQL opcional.
- Modo opcional de cuentas locales con contraseñas derivadas, sesiones aisladas por usuario y cierre de sesión. El modo local de usuario único sigue siendo el predeterminado.
- Registro manual o CSV de referencias de alquiler, con fuente, fecha, muestra y condiciones declaradas. Se aplican a un informe de forma explícita y la revisión conserva una copia de la procedencia.
- Comparación de precio con anuncios de la cartera y comparables aportados mediante CSV: zona exacta, tipología, área ±30 %, habitaciones próximas, recencia, filtro IQR, mediana y rango central. La señal de oportunidad exige una muestra suficiente y reciente, precio inferior al cuartil bajo, escenario conservador sin flujo negativo y ausencia de riesgos contractuales/hipotecarios.
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

Por defecto se usa una única cartera local (`AUTH_MODE=local`). Para habilitar varias cuentas locales, configura `AUTH_MODE=accounts` en `.env`; se solicitará registro e inicio de sesión en la aplicación. Las contraseñas requieren al menos 12 caracteres. Las cuentas no incluyen verificación de correo ni recuperación de contraseña. Para publicar detrás de HTTPS, revisa primero `COOKIE_SECURE=true`, `WEB_ORIGIN` y la sección de limitaciones.

La página **Referencias de alquiler** admite datos añadidos manualmente o pegados como CSV. La importación requiere que confirmes que tienes derecho a procesar los datos y guardar las condiciones de uso declaradas. No se descargan automáticamente comparables ni se extraen datos de Idealista para alimentar esas referencias. En un informe, la aplicación muestra solo la coincidencia exacta de zona; al elegir **Usar en escenario**, calcula superficie × €/m² y guarda esa referencia en una nueva revisión.

En esa misma página puedes importar anuncios comparables de venta con el CSV de plantilla. El análisis de un informe incorpora anuncios guardados en tu propia cartera e importados para la cuenta, y crea una revisión inmutable con los comparables y su procedencia. Usa precios anunciados, no precios de cierre. El rango no ajusta todavía estado, planta, ascensor, eficiencia energética ni reforma. Una señal “Posible oportunidad · verificar” es solo un filtro inicial, no una tasación.

## Extensión Chrome

```sh
npm run build
```

En `chrome://extensions`, activa el modo desarrollador y usa **Cargar descomprimida** para seleccionar `dist/extension`. Con la aplicación local abierta, ve a **Extensión**, genera un código temporal e introdúcelo en el popup. Abre después una ficha de vivienda de Idealista España y pulsa **Capturar anuncio**.

La extensión solicita acceso a la pestaña activa, almacenamiento local y páginas de anuncios de Idealista. Lee únicamente la ficha activa al pulsar el botón y envía el texto capturado a la API local. El token de instalación se almacena en `chrome.storage.local` y se puede revocar desde el popup.

## Comandos

| Comando                  | Acción                                   |
| ------------------------ | ---------------------------------------- |
| `npm run dev`            | API y aplicación web en modo desarrollo  |
| `npm run build`          | Bundle web y extensión MV3 en `dist/`    |
| `npm run typecheck`      | Comprobación estática TypeScript         |
| `npm test`               | Pruebas del motor, API y adaptador       |
| `npm run test:prototype` | Comprobación del prototipo HTML original |
| `npm run format`         | Formato Prettier de las fuentes          |

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
- No hay proveedor de alquileres comparables, valoración automática, OCR ni análisis mediante IA. Las referencias de alquiler las aporta el usuario y su licencia o exactitud no se verifica automáticamente.
- No hay conexión automática a Idealista ni proveedor de precios comparables: esos datos deben aportarse mediante la cartera o un CSV con derechos de uso. No se verifica automáticamente su licencia, exactitud ni equivalencia de estado.
- Los impuestos se representan como porcentaje supuesto; no se calcula el impuesto autonómico aplicable a cada operación.
- Las cuentas integradas son para ejecución local: faltan verificación de correo, recuperación segura de contraseña, administración de sesiones y protección operativa para un servicio público. El modo de enlace compartido es público por URL hasta su caducidad o revocación.
- La configuración de PostgreSQL es opcional; el desarrollo por defecto no requiere Docker.
- Antes de un despliegue público hacen falta verificación de correo, recuperación de contraseña, gestión de sesiones y secretos, cuotas, observabilidad, copias y una revisión legal de las fuentes de datos.

## Tecnologías

TypeScript · Lit · Open Cells · Vite · Fastify · Zod · SQLite (`node:sqlite`) · PostgreSQL · Vitest · Chrome Extensions MV3
