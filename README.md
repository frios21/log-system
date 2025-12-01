# Módulo Logística (Laravel + React/Vite)

Aplicación de logística que integra Odoo (órdenes/cargas/rutas), cálculo de distancia con GraphHopper y posiciones en tiempo real de vehículos/choferes desde Traccar. El frontend (React + Vite) visualiza un mapa con rutas activas y marcadores en tiempo real, y permite gestionar el ciclo de vida de las rutas.

## Resumen funcional

- Gestión de rutas logísticas (crear, asignar cargas/vehículo, eliminar).
- Asignación y orden de cargas por ruta, conservando la secuencia en los waypoints.
- Cálculo de distancia total de la ruta en backend usando únicamente GraphHopper.
- Estados de ruta con transición confirmada desde UI: `draft → assigned → done`.
- Vista de mapa con trazado de rutas por estado y marcadores en tiempo real (Traccar) para rutas activas.
- Integración Odoo vía JSON‑RPC para leer/escribir modelos (`logistics.route`, `logistics.load`, `res.partner`, etc.).

## Arquitectura

- Backend: Laravel
  - Servicios de dominio bajo `app/Services/Odoo/*` encapsulan llamadas a Odoo.
  - Controladores API bajo `app/Http/Controllers` exponen endpoints REST bajo `/api/*` consumidos por React.
  - Distancia de rutas calculada en el servidor con GraphHopper; no hay fallback a OSRM.
- Frontend: React + Vite (en `resources/js`)
  - Componentes para lista de rutas, asignación, confirmación y mapa.
  - Se comunica con Laravel vía `fetch` a `/api/*`.
- Mapa: Leaflet + tiles OSM
  - Dibuja polilíneas con geometría obtenida desde GraphHopper.
  - Recolorea rutas según estado y centra/ajusta vista ante eventos de UI.
- Traccar: polling cada 5 segundos al servidor para mostrar posición actual de vehículos/choferes.

## Flujo de datos (alto nivel)

1. React solicita rutas con `GET /api/rutas` y las renderiza en la lista y en el mapa.
2. Al asignar cargas/vehículo y origen/destino, el frontend llama `POST /api/rutas/{id}/assign`. El backend:
   - Construye waypoints, respetando el orden,
   - Calcula distancia con GraphHopper,
   - Guarda en Odoo la ruta (waypoints, distancia, totales) y marca cargas como `assigned`.
3. Para previsualizar una ruta sin guardar, se usa una ruta preview y se dibuja en el mapa con estilo de vista previa.
4. Cambio de estado de ruta (UI):
   - `PATCH /api/rutas/{id}` con `{status: 'assigned' | 'done'}`.
   - El backend actualiza el estado en Odoo; el frontend recolorea y ajusta acciones.
5. Posiciones en tiempo real (Traccar):
   - `GET /api/rutas/activos-traccar` mapea `traccar_device_id (uniqueId)` al `device.id` en Traccar y retorna la última posición para rutas activas.
   - React actualiza/crea/elimina marcadores en el mapa según el polling.

## Endpoints principales

- Rutas
  - `GET /api/rutas` — listar.
  - `GET /api/rutas/{id}` — detalle (+ loads y waypoints parseados).
  - `POST /api/rutas` — crear (opcional: `vehicle_id`).
  - `POST /api/rutas/{id}/assign` — asignar cargas/vehículo y recalcular distancia.
  - `POST /api/rutas/{id}/preview` — previsualizar (no persiste).
  - `PATCH /api/rutas/{id}` — actualizar `name` o `status`.
  - `PATCH /api/rutas/{id}/update-vehicle` — asignar vehículo.
  - `DELETE /api/rutas/{id}` — eliminar (resetea estado de cargas a `draft`).
- Cargas
  - `GET /api/cargas` — listar.
  - `GET /api/cargas/{id}` — detalle.
- Traccar
  - `GET /api/rutas/activos-traccar` — posiciones actuales de rutas activas/draft.

Nota de enrutamiento: `/api/rutas/activos-traccar` se registra antes de `/api/rutas/{id}` para evitar colisiones.

## Configuración

Variables de entorno relevantes (archivo `.env`):

- Laravel
  - `APP_URL`, `APP_ENV`, `APP_KEY`, etc.
  - Base de datos: por defecto SQLite (`database/database.sqlite`).
- Odoo
  - `ODOO_URL` — URL base del servidor Odoo (ej. `https://mi-odoo.com`)
  - `ODOO_DB` — Base de datos
  - `ODOO_USER` — Usuario (correo)
  - `ODOO_API_KEY` — API Key del usuario (no contraseña de login)
- GraphHopper
  - `GRAPHHOPPER_URL` — Endpoint base del servicio de rutas. El backend añadirá `/route` si falta (ej.: `http://mi-host:8989/graphhopper` o `http://mi-host:8989/graphhopper/route`).
  - `GRAPHHOPPER_KEY` — Opcional, si el servidor requiere clave.
- Traccar
  - `TRACCAR_URL` — API base (ej.: `http://host:8082/api`)
  - `TRACCAR_USER`, `TRACCAR_PASS`

Precaución: no versionar credenciales. Mantener `.env` fuera del control de versiones (no subir archivo .env).

## Puesta en marcha (desarrollo)

1. Instalar dependencias PHP y JS:
   - `composer install`
   - `npm install`
2. Configurar `.env` (copiar desde `.env.example` si aplica) y generar `APP_KEY`:
   - `php artisan key:generate`
3. Base de datos SQLite de desarrollo (ya existe `database/database.sqlite`). Ejecutar migraciones si corresponde:
   - `php artisan migrate`
   * No aplica para este caso.
4. Ejecutar el backend y el frontend:
   - Servidor Laravel: `php artisan serve`
   - Vite: `npm run dev`

El frontend Vite compila los recursos en `resources/js` y los inyecta en las vistas Blade (`resources/views`).

## Construcción para producción

- Compilar assets: `npm run build` (deja archivos en `public/build`).
- Ajustar `APP_ENV=production`, `APP_DEBUG=false` y cachear configuración si se desea:
  - `php artisan config:cache` y `php artisan route:cache`.

## Comportamiento clave

- Waypoints: el backend arma una lista ordenada con origen, paradas de cargas (según el orden seleccionado) y destino. Almacena en Odoo como JSON y los devuelve parseados.
- Distancias: cálculo del total de la ruta vía GraphHopper en el servidor; si `GRAPHHOPPER_URL` no está definido, el valor persiste como 0 (sin fallback).
- Estados de ruta: la UI muestra acciones contextuales (▶ comenzar, ⏹ finalizar) y un modal de confirmación antes de aplicar `PATCH`.
- Mapa:
  - Rutas se dibujan consultando a GraphHopper para obtener la geometría y se colorean por estado (`draft`, `assigned`, `done`).
  - Posiciones en tiempo real desde Traccar por polling; cada marcador muestra chofer/vehículo, ruta y velocidad aproximada.

## Pruebas

- Suite básica con PHPUnit (`tests/`). Ejecutar con `php artisan test` o `vendor/bin/phpunit`.

## Resolución de problemas

- Rutas no muestran distancia: verificar `GRAPHHOPPER_URL` accesible desde el backend y que tenga el perfil `truck` habilitado.
- No aparecen posiciones: comprobar credenciales y conectividad a Traccar, y que los `uniqueId`/`device.id` estén correctamente mapeados en Odoo.
- Waypoints vacíos o mal ordenados: revisar que los partners asociados a cargas tengan `latitude` y `longitude` en Odoo y que el orden de `load_ids` sea el esperado.

## Licencia

Uso interno. Ajustar según la política de la empresa.
