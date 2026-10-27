# Migración municipal a PostgreSQL

Estado de esta etapa (27 de octubre de 2026):

- PostgreSQL municipal: 20 tablas y 7 060 registros importados desde una copia
  coherente de `data/municipal.sqlite`.
- La aplicación `/captura` y los reportes **siguen usando SQLite**. La variable
  `MUNICIPAL_DATABASE_URL` por sí sola no cambia el motor de la aplicación.
- Las rutas de fotos y anexos están en PostgreSQL, pero los archivos físicos
  siguen en `storage/` local. No se ha copiado ningún archivo al disco de Render.
- Se identificaron seis rutas de fotos sin archivo correspondiente en la copia
  local. Cinco son rutas absolutas de Windows que tampoco serán portables.

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

## Pendiente antes del cambio de servicio

1. Configurar el disco persistente y copiar `storage/photos` y `storage/hoja2`.
2. Hacer configurables las rutas de archivos y restringir su acceso HTTP.
3. Adaptar los repositorios y transacciones de `/captura` a PostgreSQL.
4. Adaptar reportes, exportaciones y generación de PDF al nuevo motor.
5. Probar alta, edición, fotos, anexos, reportes y permisos en una instancia de
   prueba antes de cambiar la URL que usa el personal.
