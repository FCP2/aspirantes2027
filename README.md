# Sistema de Fichas Municipales - base de trabajo

Esta carpeta ya es la **base única del proyecto**. No necesitas ir cambiando entre V0.2, V0.3, etc.

## Node
Pensado para tu entorno actual:
- Node.js 24
- `node:sqlite` nativo
- Express 5
- Puppeteer para PDF
- Multer 2 para imágenes

## Primera instalación

```bat
npm install
copy .env.example .env
npm run db:init
npm run dev
```

Abre:

```text
http://127.0.0.1:3000
```

> La primera instalación de `puppeteer` descarga Chromium y puede tardar un poco.

---

# Dónde colocar `municipios.json`

Pon tu archivo real exactamente aquí:

```text
src/
└── database/
    └── seeds/
        ├── municipios.json       <-- TU ARCHIVO
        └── municipios.sample.json
```

El sistema busca primero `municipios.json`. Si no existe, usa el archivo de muestra.

El importador intenta reconocer automáticamente campos comunes como:

```json
[
  {
    "cve_municipio": "001",
    "nombre": "ACAMBAY DE RUÍZ CASTAÑEDA"
  }
]
```

También entiende variantes como `clave`, `CVE_MUN`, `NOM_MUN`, `NOMGEO`, `municipio` y objetos GeoJSON con `properties`.

Después de colocar tu catálogo real, si todavía no tienes información capturada, ejecuta:

```bat
npm run db:reset
```

Esto borra la base local y la reconstruye con el catálogo nuevo.

**No uses `db:reset` después de comenzar la captura real**, porque reinicia la base.

---

# Formulario

El formulario definitivo de captura está dividido en:

1. **Actores políticos en funciones públicas**
   - Presidencia Municipal
   - Diputación Federal
   - Diputación Local

2. **Actores políticos que influyen en el municipio**
   - Líderes
   - Grupo político dominante

3. **Actores políticos con aspiraciones en 2027**

4. **Personal en territorio**
   - ENLACE DISTRITAL COTS
   - SERVIDORES DE LA NACIÓN
   - SERVIDORES DEL PUEBLO

5. **Hoja 2 JPG**

Los nombres y textos nominales se normalizan visualmente a MAYÚSCULAS.

---

# PDF

El botón **GENERAR PDF**:

1. guarda la ficha;
2. genera la hoja 1 con Puppeteer;
3. usa un diseño basado en la plantilla maestra proporcionada;
4. si existe la hoja 2 JPG, la incorpora como segunda página;
5. guarda el PDF en:

```text
storage/pdfs/
```

La plantilla HTML/CSS del PDF está en:

```text
templates/ficha-municipal/page1.ejs
```

Esto permite modificar el diseño sin tocar la base de datos.

---

# Importante para las 4 oficinas

Cada ZIP final tendrá un `.env` distinto:

```env
OFFICE_ID=COORD-01
OFFICE_NAME=COORDINACION 1
```

y únicamente se asignarán a esa base los municipios que le correspondan.

En la siguiente etapa se añadirá el archivo de distribución de los 125 municipios entre las cuatro coordinaciones y la aplicación Super Admin.
