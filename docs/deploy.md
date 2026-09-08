# Runbook de deploy — Railway (API + Postgres) + Vercel (frontend)

Primer deploy: 2026-09-08. Seguir los pasos en orden — el orden no es
cosmético, ver "Por qué este orden" más abajo.

## Por qué este orden

Hay dos valores que sólo se pueden conocer después de que exista el otro
lado:

- El **build del frontend** necesita `VITE_API_BASE_URL`. Vite inlinea
  `import.meta.env` **en tiempo de build**, así que esto no se puede
  cambiar después sin reconstruir. La API en Railway tiene que existir
  primero.
- La **API** necesita `CORS_ALLOWED_ORIGINS` apuntando al origen de
  Vercel, que no existe hasta que el frontend esté deployado.

Entonces: API en Railway (sin CORS) → Vercel → volver a Railway a
configurar el CORS.

---

## 1. Railway — Postgres

Crear un servicio de Postgres. Después ejecutar el runbook de roles **una
sola vez**, con el superusuario que da Railway, desde su consola SQL o
`psql`:

```sql
CREATE ROLE alquileres_migrator WITH LOGIN PASSWORD '<elegir una>';

CREATE ROLE alquileres_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<elegir otra>';

GRANT CREATE, USAGE ON SCHEMA public TO alquileres_migrator;
GRANT USAGE ON SCHEMA public TO alquileres_app;

GRANT CREATE ON DATABASE railway TO alquileres_migrator;
```

Reemplazar `railway` por el nombre real de la base si es distinto.

> **`NOSUPERUSER NOBYPASSRLS` en `alquileres_app` es la línea que no se
> puede "simplificar".** RLS es evadido por superusuarios, por roles con
> `BYPASSRLS` y por el dueño de la tabla. Si se saca cualquiera de las dos
> palabras, el rol de la aplicación deja de estar aislado por tenant — y
> **todos los tests de aislamiento del repositorio seguirían pasando**,
> porque también corren con ese mismo rol. Si aparece un error de
> permisos, agregar el grant que falta; nunca agrandar el rol.
>
> Este script se ejecuta solo en el servicio `db` de Compose, vía
> `docker/initdb/01-roles.sh`, y por eso nunca hubo que hacerlo a mano.
> Un Postgres administrado nunca ejecuta ese archivo. Ver
> `back/README.md` → "Provisioning a fresh PostgreSQL cluster".

**No** usar la cadena de conexión por defecto de Railway para la API.
Armar dos propias, con los roles recién creados:

- App: `postgresql+psycopg://alquileres_app:<pw>@<host>:<port>/<db>`
- Migrator: `postgresql+psycopg://alquileres_migrator:<pw>@<host>:<port>/<db>`

## 2. Railway — migraciones

Ejecutarlas desde la máquina local, apuntando a la URL **pública** del
Postgres de Railway:

```bash
cd back
MIGRATOR_DATABASE_URL='postgresql+psycopg://alquileres_migrator:<pw>@<host-publico>:<port>/<db>' \
  alembic upgrade head
```

> **Por qué desde la máquina local y no con un comando one-off de
> Railway**: cuando `ENVIRONMENT=production`, la API **se niega a
> arrancar** si `MIGRATOR_DATABASE_URL` está presente en cualquier lugar
> del environment de su proceso. Un comando one-off de Railway hereda las
> variables del servicio, así que poner la URL del migrator en el servicio
> de la API para correr una migración impediría que la API arranque.
> Mantener los dos entornos separados. Un servicio de migración dedicado
> (mismo repositorio, `alembic upgrade head` como comando, con únicamente
> la URL del migrator seteada) es la solución más prolija a largo plazo.

## 3. Railway — el servicio de la API

Deployar desde el repositorio de GitHub. Configuración:

- **Root directory**: `back`
- **Builder**: Dockerfile. No hace falta `--target` — `prod` es la última
  etapa, así que un build simple la selecciona.
- **Réplicas: 1.** No es una configuración de rendimiento. Ver la
  advertencia más abajo.

Variables de entorno (todas estas **no tienen default** y la aplicación se
niega a arrancar sin ellas — es deliberado, diseño D20/D37):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena de conexión de `alquileres_app` del paso 1 |
| `JWT_SECRET` | un valor aleatorio nuevo, **mínimo 32 bytes** |
| `REGISTRATION_TOKEN` | un valor aleatorio nuevo — protege `POST /auth/register` |
| `ENVIRONMENT` | `production` |
| `TRUSTED_PROXY_COUNT` | empezar en `1` y después **verificar** — ver abajo |
| `CORS_ALLOWED_ORIGINS` | dejar sin setear por ahora; el paso 5 lo completa |

**No** setear `MIGRATOR_DATABASE_URL` acá. La aplicación revisa el
environment crudo buscándola y no va a arrancar.

> **Nunca aumentar la cantidad de réplicas.** `back/Dockerfile` ejecuta
> `uvicorn --workers 1`, y su propio comentario explica por qué: los
> contadores del limitador de intentos de autenticación viven en memoria
> del proceso y son por worker, así que un segundo worker o una segunda
> réplica multiplican silenciosamente todos los presupuestos de intentos
> de login. Railway hace que agregar réplicas sea un solo click.
> Resolverlo de verdad implica primero mover el limitador a un almacén
> compartido.

`TRUSTED_PROXY_COUNT` importa para el mismo limitador: indica cuántas
entradas de `X-Forwarded-For`, contadas **desde la derecha**, fueron
escritas por infraestructura en la que se confía. Si el número es
demasiado bajo, quien llame puede falsificar su origen y conseguir un
bucket separado; si es demasiado alto, todos los que están detrás del
proxy colapsan en un único bucket compartido y quedan bloqueados juntos.

**`1` es una suposición educada de arranque, no un valor verificado** —
asume que el edge de Railway agrega exactamente una entrada. No dejarlo
sin verificar: la aplicación loguea el valor resuelto una vez al arrancar,
así que revisar esa línea y confirmarla contra la cadena
`X-Forwarded-For` real de un request real. Si Railway agrega dos saltos,
`1` permite que alguien falsifique la entrada que lee el limitador. En
local el valor correcto es `0` (no hay proxy delante de `api`), y por eso
nunca hubo que decidir esto antes.

## 4. Vercel — el frontend

Importar el mismo repositorio. Configuración:

- **Root directory**: `front`
- Framework preset: Vite (se detecta solo). Output `dist`.

Variable de entorno:

| Variable | Valor |
|---|---|
| `VITE_API_BASE_URL` | la URL pública de la API en Railway, sin barra final |

`VITE_TENANT_SLUG` **no** hace falta y hay que dejarla sin setear. El
tenant se resuelve en tiempo de ejecución desde la URL — que es todo el
propósito del cambio de tenant-desde-la-URL. Setearla sólo agregaría un
fallback para una primera visita sin slug en ningún lado, y el caso del
valor vacío ya está manejado.

`front/vercel.json` provee el rewrite de SPA. Es una pieza que sostiene
todo lo demás: sin él, `/inicio` devuelve el 404 de Vercel al refrescar, y
`/disponibilidad/aya` — el link que la dueña le manda a los huéspedes por
WhatsApp — 404ea para todos los que lo abren.

## 5. Railway — CORS, ahora que el origen existe

Setear en el servicio de la API:

```
CORS_ALLOWED_ORIGINS=https://<tu-dominio-de-vercel>
```

Separado por comas si hay más de un origen. El valor literal `*` es
**rechazado al arrancar por un validador de campo**, no por revisión de
código. Un valor explícitamente vacío es legal y significa "sin acceso
desde el navegador, a propósito" — que no es lo que se busca acá.

Redeployar la API para que tome el valor.

## 6. Crear el tenant real

Con la API arriba, usando el `REGISTRATION_TOKEN` seteado en el paso 3:

```bash
curl -X POST https://<api-host>/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Registration-Token: <REGISTRATION_TOKEN>" \
  -d '{"tenant_slug":"aya","name":"Alquileres AyA","email":"<el de ella>","password":"<la de ella>"}'
```

Después setear el número de WhatsApp con el token devuelto:

```bash
curl -X PATCH https://<api-host>/tenant \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"whatsapp":"5492612094262"}'
```

El número tiene que estar en **formato internacional completo, sólo
dígitos** — código de país, después el número, sin el 0 y sin el 15. La
API acepta `+`, espacios y signos de puntuación y los limpia, pero **no**
exige código de país: un número local de diez dígitos se guarda sin
problema y produce un link de `wa.me` que falla en silencio. La hoja de
ajustes de la aplicación aclara esto en su propio texto de ayuda.

`tenant_slug` tiene que ser minúsculas, dígitos y guiones simples, de 3 a
63 caracteres — validado por Pydantic y por el CHECK
`tenants_slug_format`.

> **El slug es único, inmutable, y aparece en links que se le mandan a los
> huéspedes.** Cambiarlo más adelante rompe todos los links ya
> compartidos. `aya` fue elegido deliberadamente.

## 7. Entregar las dos URLs

- Para la dueña: `https://<dominio-de-vercel>/login/aya`
- Pública, para los huéspedes: `https://<dominio-de-vercel>/disponibilidad/aya`

## Verificar antes de entregar nada

1. `GET https://<api-host>/health` responde OK.
2. `/login/aya` muestra **Alquileres AyA** como título — eso prueba que
   `GET /public/aya/contact` resolvió, lo que significa que el slug, la URL
   de la API y el CORS están correctos los tres a la vez.
3. `/login/inexistente` muestra la frase de "no encontrado", no un
   formulario de login.
4. Iniciar sesión y después **refrescar** `/inicio`. Un 404 acá significa
   que el rewrite de SPA no está activo.
5. Abrir `/disponibilidad/aya` en una ventana privada y confirmar que el
   botón de WhatsApp abre un chat con el número correcto.
6. Iniciar sesión, esperar o forzar un 401, y confirmar que la redirección
   a `/login` sigue sabiendo cuál es el tenant. Ese es el camino del slug
   persistido; si está roto, la dueña queda bloqueada afuera de su propia
   aplicación después de cada expiración de sesión.

## Qué falta a propósito, todavía

- **No hay CI.** Nada ejecuta los 885 tests del frontend ni los 233 del
  backend al hacer push. Las dos suites están verdes en local a la altura
  de `3dcfcdb`.
- **Ningún backup verificado.** Railway los hace; nadie restauró uno. Un
  backup que nadie restauró es una hipótesis.
- **No hay dominio propio.** Los dominios por defecto de las dos
  plataformas funcionan; un dominio propio cambia `VITE_API_BASE_URL`
  (hay que reconstruir) y `CORS_ALLOWED_ORIGINS`.
- **No hay fotos de las cabañas.** La página pública muestra placeholders
  rayados; la subida de imágenes es un cambio full-stack diferido.
