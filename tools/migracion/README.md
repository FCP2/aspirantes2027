# Migración municipal a PostgreSQL

Estado de esta etapa (27 de octubre de 2026):

- PostgreSQL municipal: 20 tablas y 7 060 registros importados desde una copia
  coherente de `data/municipal.sqlite`.
- El código usa PostgreSQL en Render y conserva SQLite para el uso local.
  El servicio de Render permanece en mantenimiento hasta establecer
  `MUNICIPAL_APP_READY=true` después de validar todas las funciones.
- Las rutas de fotos y anexos están en PostgreSQL. El 27 de octubre de 2026
  se copiaron los 1 979 archivos de `storage/` al disco persistente del servicio
  de Render en `/opt/render/project/src/storage`. El paquete se verificó con
  SHA-256 antes de extraerlo y el conteo remoto coincidió con el local.
- Se identificaron seis rutas de fotos sin archivo correspondiente en la copia
  local. Cinco son rutas absolutas de Windows que tampoco serán portables.
- También se copió una copia coherente de `integracion-actores.sqlite` a
  `storage/private/` (19 enlaces confirmados), junto con las dos fuentes HTML.
  El acceso HTTP público al directorio privado está cerrado.
- Las sesiones de Render se conservan durante tres días en
  `storage/private/sessions.sqlite`; `SESSION_SECRET` debe permanecer estable.
- Chromium 148 se instaló en `storage/private/puppeteer`. El servidor de Render
  configura `PUPPETEER_CACHE_DIR` hacia esa ruta persistente antes de cargar
  los servicios de PDF.

## Utilidades

`node tools/migracion/municipal-postgres.js --check` consulta el estado de las
tablas. `--apply` solo crea el esquema si la base está completamente vacía.

`node tools/migracion/importar-sqlite-a-postgres.js --dry-run --source <ruta>`
compara columnas, relaciones y conteos sin escribir. `--apply --source <ruta>`
solo importa si todas las tablas destino están vacías; usa una transacción y
revierte todo ante cualquier error.

No ejecutar `db:reset`. Tampoco ejecutar el importador otra vez sobre la base
ya poblada. Si se reanuda la captura en SQLite antes del cambio definitivo,
habrá que reconciliar los cambios posteriores a esta copia.

## Validaciones realizadas

- Una ficha completa y cinco reportes principales se leyeron desde PostgreSQL.
- Una transacción de escritura y un guardado completo de ficha se revirtieron;
  la revisión y los registros persistentes permanecieron intactos.
- Respondieron correctamente las rutas HTTP de mapas, vista previa y salud.
- Se generaron en memoria Excel individual/general y PDF por referente.
- En Render se leyeron una ficha, dos fuentes y 471 comparaciones; Chromium
  generó un PDF de referente en memoria desde los datos importados.
- El modo Render bloqueó `/captura` sin sesión y devolvió 404 para
  `/storage/private/`.

## Pendiente antes de habilitar la captura en Render

1. Subir el código y comprobar en Render que el servicio permanece en
   mantenimiento durante el despliegue.
2. Configurar `SESSION_SECRET` y revisar la URL interna en
   `MUNICIPAL_DATABASE_URL`; `EDITOR_ACCESS_TOKEN` ya debe estar configurado.
3. Probar en el entorno Render las fotos, anexos, PDF y sesiones, con la base
   municipal sin cambios.
4. Habilitar `MUNICIPAL_APP_READY=true` y repetir la verificación de permisos,
   lectura y guardado controlado antes de compartir la URL.
