# Integración con el Sistema de Actores

Este módulo consulta la API de Actores sin escribir en `municipal.sqlite`.

- El JWT externo se conserva exclusivamente en la sesión del servidor municipal.
- Las contraseñas se envían al inicio de sesión y no se almacenan.
- Los enlaces confirmados viven en `data/integracion-actores.sqlite`, una base auxiliar independiente que queda incluida en el respaldo normal de `data/`.
- La resolución de identidad normaliza acentos, partículas y orden de nombres. Las coincidencias dudosas siempre requieren selección humana.
- Después de guardar o consultar una ficha, Presidencia Municipal y Aspirantes 2027 se comparan en segundo plano contra un directorio mínimo sincronizado desde PostgreSQL en modo `READ ONLY`.
- El proceso automático nunca bloquea ni revierte el guardado municipal. El vínculo definitivo se confirma al abrir el expediente.

Variables opcionales:

```env
ACTORES_API_URL=https://actores-edomex.onrender.com
ACTORES_LINK_DB_PATH=./data/integracion-actores.sqlite
```
