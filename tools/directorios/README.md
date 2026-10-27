# Directorio de diputaciones

Coloca el archivo real como `tools/directorios/diputaciones.xlsx` y ejecuta:

```powershell
npm run directorio:diputaciones
```

También puedes indicar otra ubicación:

```powershell
npm run directorio:diputaciones -- "C:\ruta\diputaciones.xlsx"
```

El importador reconoce `NOMBRE COMPLETO` (también `NOMBRE`, `DIPUTADO` o `DIPUTADA`) y `DISTRITO` (también `DTTO`). Para distinguir los registros debe existir una columna `TIPO` con `FEDERAL` o `LOCAL`, o bien hojas cuyos nombres contengan esas palabras.

La importación actualiza únicamente el catálogo de selección. No modifica las fichas municipales ya guardadas.
