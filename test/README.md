# Convención de tests de pandi-sm

El host-runner (Vitest) descubre dos clases de tests y emite JUnit XML
(`reports/junit.xml`, gate de CI). Espeja el modelo `AT_DIFF_TEST` de GNU
Smalltalk y el estilo Test262/ACATS: **un caso por sección de la spec, anclado a
su producción/protocolo**.

## 1. Tests de host (TypeScript) — `test/**/*.test.ts`

Tests del propio toolchain y del runner. Llevan un encabezado JSDoc de
trazabilidad con la sección y la capa:

```ts
/**
 * @section toolchain.L0
 * @kind    positive   // positive | negative
 * @layer   L0         // L0..L6
 */
```

## 2. Corpus Smalltalk — `test/corpus/L<n>/<positive|negative>/<nombre>.st`

Fragmentos `.st` reales evaluados por el `RuntimeAdapter`. Cada archivo abre con
un **frontmatter fenced** dentro del primer comentario Smalltalk (`"..."`),
delimitado por líneas `---`:

```smalltalk
"---
id: message-keyword        identificador único = stem del nombre de archivo
kind: positive             positive | negative
phase: parse               lex | parse | eval  (fase en que se evalúa el caso)
layer: L1                  capa a la que pertenece el corpus (L1, L2, …)
spec: anexoA:message.keyword  ancla de spec = "anexoA:" + section
origin: spec-ANSI          spec-ANSI | dialecto:pharo | dialecto:squeak | extension-propia | ingenieria
section: message.keyword   etiqueta de categoría (dotted; ancla a producción del Anexo A donde aplica)
note: ...                  (opcional) qué fenómeno cubre el caso
codes: E_UNCLOSED_BLOCK    (sólo negativos) lista EXACTA de error.code que produce parse(), en orden, separada por espacios
deviation: DEV-NNN         (opcional) entrada del log de desviaciones si origin != spec-ANSI
---"
2 max: 3 + 4
```

### Campos requeridos (esquema L6 — `ConformanceMeta`)

| Campo | Requerido | Descripción |
|---|---|---|
| `id` | sí | Identificador único = stem del nombre de archivo (sin extensión). |
| `kind` | sí | `positive` o `negative`. |
| `phase` | sí | `lex`, `parse`, o `eval`. |
| `layer` | sí | Capa a la que pertenece el corpus (e.g. `L1`). |
| `spec` | sí | Ancla de spec: `"anexoA:" + section`. |
| `origin` | sí | `spec-ANSI`, `dialecto:pharo`, `dialecto:squeak`, `extension-propia`, o `ingenieria`. |
| `section` | sí | Etiqueta de categoría dotted (ancla a producción del Anexo A). |
| `note` | no | Descripción en prosa del caso. |
| `codes` | negatives | Lista de `error.code` exactos que emite `parse(body)`, en orden, separados por espacios. |
| `deviation` | no | `DEV-NNN` si el caso involucra una desviación del oráculo ANSI. |

La validación estricta (`loadConformanceCase`) se hace en `test/harness/st-runner.ts`
(L6.C fail-not-skip). La carga leniente (`loadStCase`, `parseFrontmatter`) permanece
para compatibilidad con callers existentes.

Lo parsea `parseFrontmatter` en `test/harness/st-runner.ts`; el harness de corpus
es `test/L1/corpus.test.ts`.

### Reglas (corpus L1 — fase `parse`, implementado)

- **Positivos**: `parse(body).errors` vacío, `ast` no nulo y `astToJSON(ast)`
  **determinista** (parsear dos veces ⇒ igual). La estructura AST exacta de cada
  construcción ya está fijada por los tests unitarios de `test/L1/*.test.ts`; el
  corpus es la capa de **amplitud/conformidad** (programas representativos), no
  duplica los golden por-nodo.
- **Negativos**: `codes` lista los `error.code` exactos que emite `parse(body)`
  (rechazo determinista, R10). El `span` de cada error lo fijan los tests
  unitarios; el corpus fija los **códigos**. Catálogo de códigos: ver R10 +
  `errors.ts` de lexer/parser.
- **Trazabilidad**: `section` agrupa por categoría. (El gate de cobertura por
  producción del Anexo A y los `.ast.json` golden quedan como trabajo futuro.)

> **Campos de eval (`phase: eval`, `expect: <printString>`, `oracle:` para
> diferenciales golden-master) llegan en L3**, cuando el `RuntimeAdapter` real
> ejecute el corpus. En L1 el corpus se evalúa sólo hasta `parse`.

> En L0 el corpus `.st` aún no se ejecutaba (adapter = stub); sólo se probaban el
> descubrimiento y el parseo de frontmatter. El corpus se activó al verde de L1.
