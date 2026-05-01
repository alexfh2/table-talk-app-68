
# Plan: Panel de gestión de reservas para restaurantes (MVP)

Stack confirmado: **React + Vite + React Router**, **Supabase (Lovable Cloud)**, **shadcn/ui**, **Tailwind**. Login email + contraseña. Datos demo precargados. Calendario simple día + semana.

---

## 1. Modelo de datos (Supabase)

Se crean estas tablas tal y como las definiste, con `id uuid`, `created_at` y `updated_at` por defecto:

- `restaurants`
- `profiles` (equivalente a tu tabla `users`, ligada a `auth.users` por id; campos `email`, `full_name`, `role`, `restaurant_id`)
- `reservations`
- `restaurant_schedule` (varios servicios por día permitidos)
- `blocked_dates`
- `faqs`
- `agent_settings`
- `notification_settings`
- `human_handoff_requests`
- `external_calendar_settings`

Enums:
- `restaurant_status`: draft, active, paused
- `calendar_type`: internal, external
- `user_role`: platform_admin, restaurant_admin
- `reservation_status`: pending, confirmed, modified, cancelled, requires_human, no_show
- `reservation_channel`: manual, whatsapp, future_voice, external_calendar
- `handoff_status`: pending, in_review, resolved
- `integration_status`: pending, connected, needs_review
- `summary_frequency`: every_12_hours, daily

Trigger para crear automáticamente la fila en `profiles` al registrarse un usuario en `auth.users`.

RLS activado en todas las tablas con políticas mínimas (no avanzadas, tal y como pediste): platform_admin ve todo; restaurant_admin solo ve filas con su `restaurant_id`.

## 2. Datos demo

Se siembran:
- 3 restaurantes (1 activo, 1 borrador, 1 pausado), uno interno y otro externo.
- Horarios con servicio de comida y cena.
- 8–12 reservas repartidas en hoy/mañana con varios estados y canales.
- 4–6 FAQs por restaurante.
- `agent_settings` y `notification_settings` por restaurante.
- 3 solicitudes de atención humana con motivos variados.
- 1 `external_calendar_settings` de ejemplo.

Usuarios demo (creados en Supabase Auth): un platform admin y un restaurant admin asociado a uno de los restaurantes. Las credenciales se mostrarán en pantalla de login para facilitar pruebas.

## 3. Autenticación y enrutado

- Página `/auth` con login email + contraseña (sin registro público).
- Tras login se redirige según `role`:
  - `platform_admin` → `/admin`
  - `restaurant_admin` → `/restaurant`
- Hook `useCurrentUser` que devuelve sesión + perfil + restaurante asociado.
- Rutas protegidas con guards por rol.

## 4. Layout y navegación

App shell con shadcn `Sidebar` + topbar:
- Sidebar colapsable con navegación por sección.
- Topbar con nombre del restaurante actual (en `/restaurant`) o selector de contexto (en `/admin`), avatar y logout.
- Diseño claro tipo SaaS, acentos sobrios, totalmente responsive.

## 5. Páginas — Platform Admin (`/admin`)

1. **Dashboard** (`/admin`)
   - Cards: total restaurantes, activos, en borrador, reservas de hoy, solicitudes humanas pendientes.
   - Tabla de últimos restaurantes creados.
   - Tabla de últimas reservas creadas.

2. **Restaurantes** (`/admin/restaurants`)
   - Tabla con filtros por estado, búsqueda por nombre.
   - Columnas: nombre, responsable, email, teléfono, estado (badge), tipo de calendario, fecha de creación, acciones (ver, configurar, pausar).
   - Botón "Nuevo restaurante".

3. **Crear/editar restaurante** (`/admin/restaurants/new`, `/admin/restaurants/:id/edit`)
   - Formulario con todos los campos: datos del local, responsable, estado, tipo de calendario, notas internas.

4. **Configuración del restaurante** (`/admin/restaurants/:id`)
   - Tabs: Datos básicos · Calendario · Horarios y capacidad · Reservas · FAQs · Tono del agente · Notificaciones · Integraciones · Conversaciones que requieren humano.
   - Cada tab reutiliza los mismos componentes que la sección de Restaurant Admin.

## 6. Páginas — Restaurant Admin (`/restaurant`)

1. **Dashboard** (`/restaurant`)
   - Cards: reservas de hoy, próximas reservas, confirmadas, canceladas, solicitudes humanas pendientes.
   - Card de estado del agente de WhatsApp (placeholder con badge "Conectado/Desconectado", número y última actividad).
   - Card de próximo resumen programado.
   - Accesos rápidos: nueva reserva, ver calendario, ajustar horarios, configurar notificaciones.

2. **Calendario** (`/restaurant/calendar`)
   - Toggle entre vista **Día** y **Semana**.
   - Grid horario con reservas posicionadas por hora.
   - Filtros por estado.
   - Click en reserva → drawer con detalle y acciones.
   - Botón "Nueva reserva".

3. **Reservas** (`/restaurant/reservations`)
   - Tabla con filtros por fecha, estado y canal.
   - Acciones: crear, editar, cancelar, marcar no-show.
   - Drawer / modal de creación-edición con todos los campos.

4. **Configuración** (`/restaurant/settings`) con tabs:
   - **Horarios y capacidad**: editor por día con varios servicios (comida, cena…), duración de franja, máximo comensales/reservas por franja, antelación mín/máx, tamaño máximo de grupo automático. Sección de fechas bloqueadas.
   - **FAQs**: CRUD con categoría, pregunta, respuesta y switch activo/inactivo.
   - **Tono del agente**: idioma, estilo de tono (5 opciones), formalidad, mensajes (bienvenida, confirmación, cancelación, paso a humano), instrucciones adicionales.
   - **Notificaciones**: email/WhatsApp del responsable, switches por evento, resumen periódico con frecuencia y hora. Banner que resume claramente qué notificaciones están activas.
   - **Datos del restaurante**: datos básicos editables.

5. **Requiere atención** (`/restaurant/handoff`)
   - Lista/tabla de solicitudes con cliente, teléfono, canal, motivo, mensaje, estado y reserva asociada.
   - Drawer de detalle con acciones para cambiar de estado (pendiente → en revisión → resuelta).
   - Filtro por estado y motivo.

## 7. Componentes compartidos

- `StatusBadge` con colores consistentes para todos los estados (reserva, restaurante, integración, handoff).
- `ReservationFormDrawer` reutilizable en calendario y tabla de reservas.
- `MetricCard` para todos los dashboards.
- `EmptyState`, `DataTable` con filtros, `ConfirmDialog`.
- `WhatsAppAgentStatusCard` (placeholder).

## 8. Capa de datos

- Cliente Supabase tipado.
- Hooks con React Query (`useRestaurants`, `useReservations`, `useScheduleByRestaurant`, etc.) con invalidación al mutar.
- Funciones placeholder `notifyManager(...)` y `sendWhatsAppMessage(...)` que solo loggean por consola y muestran toast, listas para conectarse a un edge function en el futuro.

## 9. Diseño

- Base clara, tipografía neutra, esquinas suaves, bordes sutiles.
- Tokens semánticos en `index.css` y `tailwind.config.ts` (ya parcialmente preparados): primary sobrio, success/warning/destructive para badges.
- Totalmente responsive: tablas con scroll horizontal, sidebar colapsable a icon en pantallas medias y a sheet en móvil.

---

## Qué queda fuera (confirmado)

Pagos, registro público, integraciones reales (TheFork, CoverManager, WhatsApp Cloud API, voz), CRM, plano de mesas, RLS avanzado, app móvil nativa.

## Lo que podrás hacer al terminar

1. Iniciar sesión como platform admin y crear/editar restaurantes.
2. Configurar cada restaurante (calendario, horarios, FAQs, tono, notificaciones, integración externa).
3. Crear un usuario restaurant admin y asociarlo a un restaurante.
4. Iniciar sesión como restaurant admin y ver solo su restaurante.
5. Gestionar reservas (CRUD + no-show) y verlas en calendario día/semana.
6. Gestionar solicitudes que requieren atención humana.
7. Tener todo el modelo de datos y la UI listos para enchufar la integración real de WhatsApp más adelante.
