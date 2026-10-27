# Revisión inteligente de fuentes

Módulo independiente que extrae fuentes HTML y las compara con presidencias y aspirantes de las fichas municipales. La base `data/municipal.sqlite` se abre con `readOnly: true` y nunca se actualiza desde este módulo.

Las fuentes cargadas viven en `tools/revision-fuentes/entradas/`; no se publican como archivos estáticos ni se muestra su HTML directamente. El dashboard se encuentra en `/revision-fuentes`.

La primera etapa usa reglas explicables: municipio, nombre normalizado, similitud y partido. La integración con modelos de IA se añadirá después para textos narrativos, conservando siempre la evidencia y la revisión humana.
