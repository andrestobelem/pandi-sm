# Research

Documentos de investigación: exploraciones técnicas, lectura de papers/artículos,
spikes, auditorías de diseño y decisiones que necesitan respaldo escrito y con
evidencia. Cada documento deja registro del **qué se investigó**, **qué evidencia
lo respalda** y **qué implica para el proyecto**.

La regla de oro es **anclar todo en evidencia**: fuentes con URL, IDs de papers
(arXiv), referencias a archivos/líneas o comandos observados. Si algo no se pudo
verificar, se marca explícitamente en lugar de afirmarlo.

## Convención de nombres

Un archivo Markdown por tema, con prefijo de fecha:

```
YYYY-MM-DD-titulo-corto-en-kebab-case.md
```

- `YYYY-MM-DD` — fecha de creación del documento. Ordena cronológicamente.
- `titulo-corto` — descripción breve en minúsculas separada por guiones.

Ejemplos reales del estilo:

```
2026-06-25-agentic-patterns-papers-workflows.md
2026-06-26-claude-dynamic-workflows-harness.md
2026-06-28-context-engineering-focus.md
```

## Estructura de cada documento

1. **Título `#` (H1)** — descriptivo, en una línea. Puede ir en español o inglés
   según el tema.
2. **Línea `Date:`** — justo debajo del título:
   ```markdown
   # Título descriptivo de la investigación

   Date: 2026-06-28
   ```
3. **Nota de estado / procedencia (opcional)** — para documentos finales o
   generados por un workflow, un blockquote arriba del cuerpo:
   ```markdown
   > **Status: FINAL.** Cifras self-reported marcadas `[UNVERIFIED]` / `[CONTESTED]`.
   ```
   o una nota de procedencia que indique el run que lo generó
   (`.pi/workflows/runs/...`) y si se verificó.
4. **Secciones `##`** — el cuerpo. Las secciones se adaptan al tema, pero casi
   todos los documentos siguen este arco:

   | Bloque | Secciones típicas |
   | --- | --- |
   | **Encuadre** | `## Objetivo` / `## Objective`, `## Contexto` / `## Context`, `## Request`, o un `## Executive summary` para los largos |
   | **Evidencia** | `## Fuentes revisadas` / `## Sources reviewed` / `## Main sources identified` — lista de fuentes con URL y, para papers, `arXiv:XXXX.XXXXX` |
   | **Cuerpo** | hallazgos, principios derivados, patrones aplicados, mapa de duplicación, etc. (lo específico del tema) |
   | **Impacto en el repo** | `## Cambios aplicados` / `## Changes applied`, `## Modified files` / `## Affected files`, `## Decisiones` |
   | **Verificación** | `## Validation` / `## Validations performed` / `## Expected validation` |
   | **Cierre** | `## Recommended next steps` / `## Próximos pasos`, y para deep research `## Coverage gaps & what to verify next`, `## Confidence & caveats` |

   Los documentos largos pueden numerar las secciones (`## 1. Executive summary`,
   `## 2. …`).

## Convenciones de evidencia

- **Citar siempre la fuente.** URLs completas; para papers, el ID de arXiv.
- **Marcar lo no verificado.** Usar etiquetas inline cuando corresponda:
  - `[UNVERIFIED]` — dato self-reported o sin confirmar.
  - `[CONTESTED]` — fuentes en desacuerdo.
  - `INSUFFICIENT_EVIDENCE` — no alcanzó la evidencia para afirmarlo.
  - `NO_FINDINGS` — la búsqueda no arrojó resultados.
- **Procedencia para documentos generados por workflow.** Indicar el run
  (`.pi/workflows/runs/<run-id>/`), qué se verificó y qué quedó pendiente.
- **No inventar cobertura.** Si una rama/búsqueda falló o quedó vacía, decirlo.

## Plantilla mínima

```markdown
# Título descriptivo de la investigación

Date: YYYY-MM-DD

## Objetivo

Qué se quiere responder o decidir con este documento.

## Fuentes revisadas

- **Nombre de la fuente o paper** — URL o `arXiv:XXXX.XXXXX`. Idea útil: …

## Hallazgos

Datos, principios derivados, evidencia. Marcar `[UNVERIFIED]` lo no confirmado.

## Impacto en el repo

Decisiones tomadas y archivos afectados (si aplica).

## Validación

Cómo se comprobó / qué se ejecutó.

## Próximos pasos

Pendientes y gaps de cobertura por cubrir.
```

## Buenas prácticas

- **No borrar** documentos antiguos: el valor está en el historial.
- Un documento = un tema. Si crece demasiado, dividir y enlazar.
- Preferir evidencia concreta (URLs, arXiv, `archivo:línea`, comandos) sobre
  opiniones.
- Mantener honestidad sobre límites: lo no verificado se marca, no se omite.
