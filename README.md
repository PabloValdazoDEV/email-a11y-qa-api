# Email A11y QA API

Backend de Email A11y QA. Incluye autenticación privada por invitación, verificación de email, sesiones, recuperación de contraseña, administración de usuarios y organizaciones aisladas por membership.

## Stack

- Node.js 20+, Express 5 y JavaScript ESM
- PostgreSQL 17 y Prisma ORM
- JWT HS256 solo para access tokens
- Refresh, reset y verificación mediante tokens opacos
- bcrypt, Zod, Helmet, CORS, rate limiting y Nodemailer
- Jest y Supertest

## Requisitos

- Node.js 20 o posterior
- npm
- PostgreSQL 17 o Docker con Compose

## Instalación con PostgreSQL

`docker-compose.yml` levanta PostgreSQL 17 y publica `5432` únicamente en `127.0.0.1`.

```bash
cp .env.example .env
npm install
docker compose up -d
```

La configuración debe usar el proveedor y protocolo PostgreSQL:

```env
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/email_a11y_qa?schema=public
```

El contenedor acepta además `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`. Si los cambias, utiliza exactamente los mismos valores, con la contraseña codificada para URL, dentro de `DATABASE_URL`:

```env
POSTGRES_DB=email_a11y_qa
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

Después ejecuta:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Las credenciales `postgres/postgres` son únicamente para desarrollo local. Cámbialas si el contenedor va a ser accesible en un entorno compartido. Para parar el servicio sin borrar datos usa `docker compose stop`; para reanudarlo, `docker compose up -d`.

La API escucha por defecto en `http://127.0.0.1:3000`. `GET /health` permite comprobar que Express responde.

## Variables de entorno

Consulta `.env.example`, que contiene todas las variables soportadas.

| Variable | Uso |
| --- | --- |
| `NODE_ENV`, `PORT`, `BIND_HOST` | Entorno y listener HTTP |
| `DATABASE_PROVIDER` | Debe ser `postgresql` |
| `DATABASE_URL` | URL PostgreSQL con host, puerto, base, usuario y contraseña |
| `FRONTEND_URL` | URL canónica usada en emails |
| `CORS_ALLOWED_ORIGINS` | Allowlist separada por comas; debe incluir `FRONTEND_URL` |
| `JWT_SECRET` | Secreto de firma; en producción debe ser no obvio y tener al menos 32 bytes |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS` | Verificación estricta del access JWT |
| `REMEMBER_TTL_SECONDS`, `MAX_REMEMBERED_SESSIONS` | Sesiones recordadas |
| `BCRYPT_ROUNDS` | Coste bcrypt |
| `PASSWORD_MAX_AGE_DAYS` | Vigencia máxima de la contraseña; `90` por defecto |
| `PASSWORD_RESET_TTL_SECONDS` | Caducidad del reset opaco |
| `EMAIL_VERIFICATION_TTL_SECONDS` | Caducidad de la verificación opaca y de la invitación inicial |
| `APP_NAME` | Nombre neutro usado en emails y logs de arranque |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Servidor y modo de conexión SMTP |
| `SMTP_USER`, `SMTP_PASS` | Credenciales de autenticación SMTP |
| `MAIL_FROM` | Remitente autorizado que verán los usuarios |
| `SEED_USERS_ENABLED` | Interruptor explícito para crear cuentas iniciales; `false` por defecto |
| `SEED_SUPERADMIN_*`, `SEED_ADMIN_*`, `SEED_USER_*` | Credenciales opcionales de las tres cuentas iniciales |

### Secretos y credenciales que debes proporcionar

La plantilla no incluye credenciales reales. Para un despliegue completo necesitas:

1. Un usuario y una contraseña de PostgreSQL.
2. Un `JWT_SECRET` aleatorio e independiente de cualquier password. Puedes generarlo con `openssl rand -base64 48`.
3. Credenciales SMTP y un remitente autorizado para entregar emails.
4. Opcionalmente, los bloques `SEED_SUPERADMIN_*`, `SEED_ADMIN_*` y `SEED_USER_*` para crear las cuentas iniciales.
5. Las URLs reales de frontend y API. El frontend solo necesita `VITE_API_URL` y `VITE_APP_NAME`; nunca debe recibir secretos.

Usa credenciales diferentes en desarrollo, staging y producción. No reutilices la contraseña de la base de datos como `JWT_SECRET`, contraseña SMTP o contraseña del administrador.

## Configuración completa del correo

El backend necesita SMTP para enviar tres correos transaccionales: invitación inicial, verificación al cambiar de email y recuperación de contraseña. Las credenciales deben proceder del panel del proveedor de correo o del servicio SMTP contratado; no son las credenciales de la base de datos ni las del panel de hosting.

Debes obtener del proveedor exactamente estos datos:

| Variable | Qué debes introducir |
| --- | --- |
| `SMTP_HOST` | Nombre del servidor SMTP, por ejemplo el hostname que indique el proveedor |
| `SMTP_PORT` | Puerto SMTP. Habitualmente `465` para TLS implícito o `587` para STARTTLS obligatorio |
| `SMTP_SECURE` | `true` con TLS implícito, normalmente puerto 465. En puerto 587 debe ser `false`, pero el backend fuerza STARTTLS y rechaza continuar sin cifrado |
| `SMTP_USER` | Usuario SMTP. Suele ser el email completo, un identificador SMTP o una API key, según el proveedor |
| `SMTP_PASS` | Contraseña SMTP, contraseña específica de aplicación o secreto entregado por el proveedor. No uses una contraseña personal normal si el proveedor ofrece credenciales SMTP separadas |
| `MAIL_FROM` | Remitente verificado, por ejemplo `Auth Template <no-reply@tu-dominio.com>` |
| `APP_NAME` | Nombre mostrado dentro de los correos y en su asunto |
| `FRONTEND_URL` | URL pública del frontend usada para construir los enlaces `#token=` |

Ejemplo de estructura, siempre con valores propios:

```env
APP_NAME=Mi Aplicación
FRONTEND_URL=https://app.tu-dominio.com

SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@tu-dominio.com
SMTP_PASS=secreto-smtp-entregado-por-el-proveedor
MAIL_FROM=Mi Aplicación <no-reply@tu-dominio.com>
```

La plantilla exige cifrado en los dos modos admitidos:

- Puerto 465 y `SMTP_SECURE=true`: la conexión nace dentro de TLS.
- Puerto 587 y `SMTP_SECURE=false`: Nodemailer inicia sin TLS únicamente para negociar STARTTLS inmediatamente. `requireTLS` está activado, por lo que la entrega falla si el servidor no permite elevar la conexión a TLS.

En ambos casos se exige TLS 1.2 o posterior y se valida el certificado del servidor. No se admite envío SMTP en texto plano. Los valores `example.com` de `.env.example` son demostrativos: debes sustituirlos antes de probar el correo.

Consideraciones importantes:

- El remitente de `MAIL_FROM` debe estar autorizado o verificado en el proveedor; de lo contrario puede ser rechazado o sustituido.
- Si el proveedor exige verificación del dominio, configura en DNS los registros que indique, normalmente SPF y DKIM; DMARC es recomendable en producción.
- Algunas cuentas con doble factor requieren una contraseña de aplicación en lugar de la contraseña habitual.
- No uses credenciales IMAP o POP salvo que el proveedor confirme que son también las credenciales SMTP.
- No guardes `.env` en Git, capturas, tickets ni logs. `.env.example` contiene valores demostrativos no secretos para mostrar el formato; debes sustituirlos.
- En desarrollo puedes utilizar un inbox SMTP de pruebas. Esta plantilla nunca imprime tokens en consola, incluso cuando SMTP está vacío.
- Si `SMTP_HOST` o `MAIL_FROM` están vacíos, la cuenta puede crearse desde administración pero no se entrega la invitación; el usuario podrá solicitar otro enlace desde «He olvidado mi contraseña». Configura SMTP para probar y utilizar el flujo privado completo.
- `FRONTEND_URL` debe ser accesible para el destinatario y debe aparecer exactamente en `CORS_ALLOWED_ORIGINS`.

Antes de producción, envía un correo real de verificación y otro de recuperación y confirma entrega, enlaces, remitente, SPF/DKIM y carpeta de spam.

## Prisma y PostgreSQL

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:studio
npm run prisma:validate
```

En desarrollo usa `prisma:migrate`. En producción usa `prisma:deploy`.

El usuario que ejecuta migraciones necesita permisos para crear y modificar tablas, índices y claves foráneas. En producción es recomendable utilizar ese usuario solo durante el despliegue y ejecutar la aplicación con una cuenta de base de datos más limitada.

## Seed de SUPERADMIN, ADMIN y USER

`.env.example` muestra los tres bloques completos, pero `SEED_USERS_ENABLED=false` impide crear sus credenciales conocidas accidentalmente. Los valores demostrativos se admiten únicamente con `NODE_ENV=development`; en `production` el seed los rechaza. Para utilizar el seed:

1. Cambia los emails y contraseñas `example.com` por valores privados.
2. Deja completos los bloques que quieras crear. Si no necesitas uno, elimina o deja vacías sus cuatro variables.
3. Utiliza un email distinto en cada bloque.
4. Cambia `SEED_USERS_ENABLED=true`.
5. Ejecuta el comando correspondiente:

```bash
npm run seed
```

Cada bloque necesita `EMAIL`, `PASSWORD`, `NAME` y `LAST_NAME`. El seed valida la política de contraseña, utiliza bcrypt, marca el email como verificado, activa la cuenta y asigna exactamente `SUPERADMIN`, `ADMIN` o `USER`. Usa `upsert`, por lo que puede repetirse sin duplicar cuentas. En cuentas ya existentes actualiza el rol y el estado, pero no sustituye la contraseña.

En desarrollo, el seed avisa si utilizas emails `@example.com` o contraseñas que empiezan por `Replace-`. En producción los rechaza. No guardes credenciales reales en Git y vuelve a poner `SEED_USERS_ENABLED=false` después de crear las cuentas iniciales.

## Scripts

```bash
npm run dev
npm start
npm test
npm run test:watch
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

## Endpoints

Todas las respuestas sensibles llevan `Cache-Control: no-store`.

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| `GET` | `/health` | Público | Estado de Express |
| `POST` | `/auth/login` | Público | Valida credenciales y crea cookies |
| `POST` | `/auth/refresh` | Refresh cookie | Rota el refresh y renueva el access |
| `POST` | `/auth/logout` | Público/idempotente | Revoca refresh y limpia cookies |
| `POST` | `/auth/forgot-password` | Público | Respuesta genérica y token de reset |
| `POST` | `/auth/reset-password` | Público | Consume token y revoca sesiones |
| `POST` | `/auth/verify-email` | Público | Consume token de verificación |
| `POST` | `/auth/resend-verification` | Público | Respuesta genérica y nuevo token |
| `GET` | `/auth/me` | Autenticado | Usuario actual público |
| `PUT` | `/auth/me` | Autenticado | Nombre, apellidos y email |
| `PUT` | `/auth/me/password` | Autenticado | Cambia contraseña, aplica historial y cierra sesiones |
| `POST` | `/users` | `ADMIN` / `SUPERADMIN` | Crea una cuenta y envía su invitación |
| `GET` | `/users?page=1&limit=20&search=` | `ADMIN` / `SUPERADMIN` | Listado paginado, máximo 100 |
| `PATCH` | `/users/:id` | `ADMIN` / `SUPERADMIN` | Cambia `role` y/o `isActive` |
| `POST` | `/api/v1/organizations` | Autenticado y sin organización | Crea una organización y asigna al usuario como `OWNER` |
| `GET` | `/api/v1/organizations` | Autenticado | Lista la organización del usuario |
| `GET` | `/api/v1/organizations/:id` | Miembro | Obtiene una organización sin permitir acceso cruzado |
| `GET` | `/api/v1/organizations/:organizationId/members` | Miembro | Lista los miembros y sus roles de organización |
| `PATCH` | `/api/v1/organizations/:organizationId/members/:membershipId` | `OWNER` / `ADMIN` de organización | Cambia un rol permitido sin modificar el rol global |
| `DELETE` | `/api/v1/organizations/:organizationId/members/:membershipId` | `OWNER` / `ADMIN` de organización | Elimina exclusivamente la membership permitida |
| `POST` | `/api/v1/organizations/:organizationId/invitations` | `OWNER` / `ADMIN` de organización | Invita una persona o añade una cuenta existente a la organización |
| `GET` | `/api/v1/organizations/:organizationId/clients` | Miembro | Lista los clientes activos y archivados de la organización |
| `POST` | `/api/v1/organizations/:organizationId/clients` | `OWNER` / `ADMIN` de organización | Crea un cliente dentro de la organización solicitada |
| `GET` | `/api/v1/clients/:clientId` | Miembro de su organización | Consulta un cliente activo sin permitir acceso cruzado |
| `PATCH` | `/api/v1/clients/:clientId` | `OWNER` / `ADMIN` de su organización | Modifica el nombre del cliente |
| `DELETE` | `/api/v1/clients/:clientId` | `OWNER` / `ADMIN` de su organización | Archiva el cliente sin eliminarlo físicamente |
| `PATCH` | `/api/v1/clients/:clientId/restore` | `OWNER` / `ADMIN` de su organización | Restaura un cliente archivado |
| `GET` | `/api/v1/clients/:clientId/campaigns` | Miembro de su organización | Lista las campañas activas del cliente activo |
| `POST` | `/api/v1/clients/:clientId/campaigns` | `OWNER` / `ADMIN` de su organización | Crea una campaña dentro del cliente activo |
| `GET` | `/api/v1/campaigns/:campaignId` | Miembro de su organización | Consulta una campaña activa mediante su cliente propietario |
| `PATCH` | `/api/v1/campaigns/:campaignId` | `OWNER` / `ADMIN` de su organización | Modifica el nombre de la campaña |
| `DELETE` | `/api/v1/campaigns/:campaignId` | `OWNER` / `ADMIN` de su organización | Archiva la campaña sin eliminarla físicamente |
| `GET` | `/api/v1/campaigns/:campaignId/draft` | Miembro de su organización | Consulta el borrador actual de una campaña activa |
| `PUT` | `/api/v1/campaigns/:campaignId/draft` | `OWNER` / `ADMIN` / `EDITOR` | Crea o sustituye completamente el borrador pegando HTML |
| `PATCH` | `/api/v1/campaigns/:campaignId/draft` | `OWNER` / `ADMIN` / `EDITOR` | Modifica únicamente el HTML de trabajo |
| `POST` | `/api/v1/campaigns/:campaignId/draft/import` | `OWNER` / `ADMIN` / `EDITOR` | Importa un archivo `.html` o `.htm` en memoria |
| `POST` | `/api/v1/campaigns/:campaignId/revisions` | `OWNER` / `ADMIN` / `EDITOR` | Guarda un snapshot inmutable del Draft persistido |
| `GET` | `/api/v1/campaigns/:campaignId/revisions` | Miembro | Lista metadatos de las revisiones, sin incluir HTML |
| `GET` | `/api/v1/revisions/:revisionId` | Miembro de su organización | Consulta el snapshot completo de una revisión |

No existe endpoint de registro público. Las primeras cuentas se crean mediante el seed y, a partir de ahí, un `ADMIN` o `SUPERADMIN` concede acceso desde `POST /users`. La API genera una contraseña interna que no se entrega ni permite entrar, guarda únicamente el hash de la invitación y envía un enlace de un solo uso para que la persona defina su propia contraseña. Solo un `SUPERADMIN` puede crear, asignar o modificar el rol `SUPERADMIN`. Ningún administrador puede desactivarse ni cambiar su propio rol.

Los roles globales `USER`, `ADMIN` y `SUPERADMIN` son independientes de `MembershipRole`. Dentro de una organización, `OWNER` puede gestionar `ADMIN`, `EDITOR` y `VIEWER`; un `ADMIN` de organización solo puede alternar o eliminar `EDITOR` y `VIEWER`. `OWNER` nunca puede reasignarse ni eliminarse mediante estas rutas. Todas las operaciones comprueban conjuntamente la organización solicitada, la membership del actor y la membership objetivo.

La invitación de organización acepta `name`, `lastName`, `email` y `role`. Nombre y apellidos solo se usan al crear una cuenta nueva; una cuenta existente no se modifica. Las cuentas nuevas reciben siempre el rol global `USER`, un password interno no utilizable y un token opaco de un solo uso para definir su propia contraseña. La membership se crea en la misma transacción y aparece como `INVITATION_PENDING` hasta que el usuario establece su contraseña. Las cuentas ya verificadas aparecen como `ACTIVE` y las desactivadas como `INACTIVE`.

Un `OWNER` puede invitar `ADMIN`, `EDITOR` o `VIEWER`. Un `ADMIN` de organización solo puede invitar `EDITOR` o `VIEWER`; `EDITOR` y `VIEWER` no pueden invitar. Si el email ya pertenece a una cuenta activa sin organización, únicamente se crea la membership: no se cambia el password, el rol global ni se envía un nuevo email. La restricción única de `Membership.userId` impide que una persona pertenezca a más de una organización.

## Clientes de organización

Cada `Client` pertenece obligatoriamente a una única organización. Su nombre admite hasta 120 caracteres y `archivedAt` implementa el archivado lógico: `DELETE` conserva la fila y el listado devuelve primero los clientes activos y después los archivados. Un cliente archivado no permite abrir el detalle, editarlo ni acceder a sus campañas hasta que un `OWNER` o `ADMIN` lo restaure.

Todos los miembros pueden listar los clientes de su propia organización y consultar los que estén activos. Solamente `OWNER` y `ADMIN` de organización pueden crear, editar, archivar o restaurar; `EDITOR` y `VIEWER` tienen acceso de lectura. Estas decisiones ignoran el rol global y cada consulta valida conjuntamente el usuario autenticado, la organización propietaria y el cliente solicitado.

## Campañas de cliente

Cada `Campaign` pertenece obligatoriamente a un único `Client`. `archivedAt` implementa el archivado lógico y los endpoints normales excluyen campañas archivadas y campañas cuyo cliente esté archivado. Archivar un cliente conserva todas sus campañas; la clave foránea usa `ON DELETE RESTRICT` para evitar borrados físicos en cascada.

Todos los roles de organización pueden listar y consultar campañas del cliente al que pertenecen. Solamente `OWNER` y `ADMIN` pueden crear, cambiar el nombre o archivar. El backend no utiliza roles globales para autorizar estas operaciones y valida siempre la cadena `Campaign → Client → Organization → Membership`. `clientId` procede exclusivamente de la URL y no puede modificarse mediante el body.

## Borrador HTML

Cada Campaign puede tener como máximo un `Draft`, garantizado por el índice único de `campaignId`. En la primera creación, al pegar HTML o importarlo desde `.html`/`.htm`, `htmlOriginal` y `htmlCurrent` reciben exactamente el mismo contenido. Una edición ordinaria modifica solo `htmlCurrent`; una sustitución completa vuelve a actualizar ambos campos. No existe historial todavía.

El límite autoritativo es 1 MiB y está centralizado en `src/config/draft.js`. Los cuerpos JSON de Draft disponen de un parser específico sin aumentar el límite general de 64 KiB. Los archivos multipart se procesan con Multer en memoria, uno por petición, y se validan por extensión, MIME cuando es concluyente, tamaño, UTF-8 y presencia de estructura HTML. No se guardan archivos en disco, no se corrige ni sanitiza el contenido y nunca se escribe el HTML en logs.

`OWNER`, `ADMIN` y `EDITOR` pueden crear, sustituir y editar el borrador. `VIEWER` puede consultarlo. La autorización recorre `Draft → Campaign → Client → Organization → Membership`; Campaign y Client archivados bloquean el acceso normal, pero el Draft permanece almacenado. La clave foránea usa `ON DELETE RESTRICT` para impedir borrados en cascada.

## Revisiones inmutables

Cada `Revision` copia `Draft.htmlOriginal` en `htmlOriginal` y `Draft.htmlCurrent` en `htmlCorrected`. El frontend no envía HTML al crearla. También conserva el autor, la fecha, una versión correlativa por Campaign y el SHA-256 de los bytes UTF-8 exactos de `htmlCorrected`; se permiten snapshots idénticos.

La creación se ejecuta en una transacción que bloquea la fila de Campaign mediante `SELECT … FOR UPDATE`, lee el Draft persistido y calcula la siguiente versión. La restricción única `(campaignId, version)` protege además el invariante en PostgreSQL. Un trigger rechaza cualquier `UPDATE` de `Revision`; no existen endpoints `PATCH` ni `DELETE`.

`OWNER`, `ADMIN` y `EDITOR` pueden crear revisiones; todos los miembros, incluido `VIEWER`, pueden listarlas y consultarlas. Crear exige Campaign y Client activos. Los snapshots existentes continúan siendo legibles cuando cualquiera de sus padres se archiva, siempre después de validar `Revision → Campaign → Client → Organization → Membership`. El listado devuelve únicamente metadatos y el HTML completo se entrega solo en el detalle.

## Arquitectura de autenticación

El access token es un JWT HS256 de 15 minutos por defecto. Solo contiene `sub`, `jti`, `iss`, `aud`, `iat` y `exp`. El middleware verifica algoritmo, firma, issuer, audience y expiración, y después consulta PostgreSQL para comprobar el usuario, su rol, su verificación y si continúa activo.

Las cookies son `HttpOnly`, `SameSite=Strict` y `Path=/`; en producción también son `Secure` y usan nombres con prefijo `__Host-`. El frontend nunca recibe ni lee tokens.

Sin “Recordarme”, el navegador recibe únicamente una access cookie de sesión. Con “Recordarme”, recibe además un refresh opaco de 32 bytes aleatorios. La base elegida guarda exclusivamente su SHA-256. Cada refresh lo sustituye de forma condicional dentro de una transacción: dos peticiones no pueden usar con éxito el mismo valor. Se conservan como máximo cinco sesiones recordadas por usuario.

Los tokens de invitación, reset y verificación también son opacos y solo se guardan como SHA-256. Los enlaces los transportan en el fragmento `#token=`, no en query strings. La invitación comparte el flujo seguro de creación de contraseña: reclama el token con `updateMany` condicional, verifica el email, cambia el hash de contraseña y revoca todas las sesiones dentro de una transacción.

Cada contraseña tiene una vigencia máxima de 90 días, configurable mediante `PASSWORD_MAX_AGE_DAYS`. Al caducar, el login sigue validando las credenciales y entrega una sesión limitada para que la persona pueda cambiarla, pero el middleware bloquea el perfil, la administración y cualquier ruta de negocio protegida. `GET /auth/me`, logout y `PUT /auth/me/password` continúan disponibles para completar la renovación.

La contraseña nueva se compara con la actual y con las dos anteriores mediante bcrypt; por tanto, no puede coincidir con ninguna de las tres últimas utilizadas. Los hashes retirados se guardan en `PasswordHistory`, nunca las contraseñas, y solo se conservan los dos necesarios además del hash actual. La regla se aplica tanto al cambio desde el perfil como a la recuperación por email, evitando que ese flujo permita saltarse el historial.

## Medidas de seguridad

- bcrypt con coste configurable; política única de 7–64 caracteres
- caducidad obligatoria a los 90 días y sesión restringida hasta renovar
- prohibición de reutilizar cualquiera de las tres últimas contraseñas
- sin autorregistro: la creación de cuentas exige una sesión `ADMIN` o `SUPERADMIN`
- hash ficticio en login para reducir diferencias temporales cuando el email no existe
- respuestas genéricas en login incorrecto, recuperación y reenvío
- Helmet, HSTS en producción y `X-Powered-By` desactivado
- CORS con allowlist y credenciales; nunca `*`
- comprobación de `Origin` y `Sec-Fetch-Site` en escrituras autenticadas por cookie
- body JSON estricto de 64 KiB y `415` para content types no admitidos
- rate limit global y límites separados para operaciones de autenticación
- selector público central para no devolver hashes ni relaciones internas
- errores centralizados sin stack, SQL, Prisma, tokens ni secretos
- usuarios inactivos rechazados en login y en cada request autenticada
- un admin no puede desactivarse ni retirarse su propio rol

## Rate limits iniciales

| Operación | Límite |
| --- | --- |
| Global | 300 / 15 min / IP |
| Login | 8 fallos / 15 min / IP |
| Recuperación | 5 / hora / IP |
| Reset | 10 / 15 min / IP |
| Reenvío | 5 / hora / IP |
| Verificación | 10 / 15 min / IP |
| Refresh | 60 / 15 min / IP |

Para despliegues con varias réplicas sustituye el almacén en memoria de `express-rate-limit` por uno compartido (por ejemplo, Redis).

## Cambio de email y contraseña

Cambiar el email exige la contraseña actual, vuelve a marcarlo como no verificado, crea una nueva verificación y revoca las sesiones recordadas. La respuesta limpia las cookies actuales. Cambiar o recuperar la contraseña comprueba el historial, actualiza `passwordChangedAt`, revoca todas las sesiones y fuerza un nuevo login. Al aplicar esta migración, las cuentas que ya existían comienzan un nuevo periodo completo de 90 días porque no es posible reconstruir con seguridad un historial anterior que nunca se almacenó.

## Tests

```bash
npm test
```

Los tests de integración cubren autenticación, recuperación, sesiones, roles globales, organizaciones, memberships, invitaciones, clientes, campañas, borradores HTML, importación multipart, revisiones inmutables, archivado lógico y aislamiento multi-tenant. Sustituyen Prisma únicamente bajo `NODE_ENV=test`; no requieren una base PostgreSQL en ejecución, no envían correos y no emplean datos de producción. Las migraciones, restricciones, concurrencia y persistencia se comprueban además contra PostgreSQL real sin conservar datos de prueba.

## Despliegue detrás de proxy

En `NODE_ENV=production` se activa `app.set("trust proxy", 1)`, adecuado para una única capa de proxy confiable como Nginx o Plesk. Ajusta el valor si tu topología es distinta. Termina TLS en el proxy, reenvía `X-Forwarded-*`, usa HTTPS en todas las URLs permitidas y no expongas directamente el puerto de Node.

## Checklist de producción

- [ ] Generar un `JWT_SECRET` aleatorio de al menos 32 bytes
- [ ] Generar Prisma y aplicar las migraciones PostgreSQL
- [ ] Configurar la base de producción, usuario con permisos mínimos y copias de seguridad
- [ ] Servir exclusivamente por HTTPS
- [ ] Usar `NODE_ENV=production`
- [ ] Revisar `FRONTEND_URL` y `CORS_ALLOWED_ORIGINS`
- [ ] Configurar y probar SMTP y `MAIL_FROM`
- [ ] Confirmar `PASSWORD_MAX_AGE_DAYS=90` y probar el cambio obligatorio
- [ ] Revisar la topología de proxy y `trust proxy`
- [ ] Ejecutar `npm run prisma:deploy`
- [ ] Crear el administrador inicial de forma segura
- [ ] Retirar o rotar las credenciales usadas para el seed
- [ ] Ajustar rate limits al tráfico y usar store compartido si hay réplicas
- [ ] Ejecutar lint y tests
- [ ] Configurar monitorización sin registrar bodies, cookies ni tokens
