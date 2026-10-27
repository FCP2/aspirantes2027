# Cruce de actores políticos

Herramienta administrativa independiente del servidor de captura. Compara los nombres utilizados en las fichas municipales contra `public.personas` de PostgreSQL y genera un Excel. No modifica ninguna de las dos bases.

Incluye actores de las fichas, personal en territorio, actores de grupos con presencia y todos los campos `REFERENTE` que tengan información. SQLite y PostgreSQL se abren dentro de un flujo de solo lectura; no es necesario ejecutar `db:reset`.

## Configuración

1. Copia `.env.example` como `.env` dentro de `tools/cruce-actores/`.
2. Coloca la URL externa en `ACTORES_PG_URL`.
3. Ejecuta desde la raíz del proyecto:

```powershell
npm.cmd run cruce:actores
```

No compartas ni subas el archivo `.env`: contiene la contraseña de PostgreSQL y está excluido por `.gitignore`.

El archivo se genera en `tools/cruce-actores/salidas/` con cuatro hojas:

- `Resumen`: totales por clasificación.
- `Nombres únicos`: una fila por nombre local normalizado.
- `Cruce por ficha`: cada aparición, municipio, cargo y relación.
- `Revisión manual`: coincidencias posibles, ambiguas y no encontradas.

## Clasificaciones

- `COINCIDENCIA EXACTA`: nombre equivalente ignorando acentos, mayúsculas, puntuación y espacios.
- `EXACTA AMBIGUA`: más de un registro PostgreSQL tiene el mismo nombre.
- `PROBABLE`: similitud alta y una opción claramente superior.
- `POSIBLE` o `AMBIGUA`: requiere validación humana.
- `NO ENCONTRADO`: no existe una opción suficientemente cercana.

Los registros marcados como `oculto` en PostgreSQL se incluyen para identificar que la persona ya existe, pero se señalan en el reporte.
