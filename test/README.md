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

## 2. Corpus Smalltalk — `test/L<n>/<positive|negative>/<nombre>.st`

Fragmentos `.st` reales evaluados por el `RuntimeAdapter`. Cada archivo abre con
un **frontmatter fenced** dentro del primer comentario Smalltalk (`"..."`),
delimitado por líneas `---`:

```smalltalk
"---
section: A.2          ANSI / Anexo A — producción o protocolo cubierto
kind: positive        positive | negative
phase: parse          lex | parse | eval
layer: L1             L0..L6
oracle: spec          spec | dialecto:gst | dialecto:pharo   (sólo casos diferenciales golden-master, §7)
expect: 14            printString esperado (positivos eval) | code+span (negativos)
---"
3 + 4 * 2
```

Lo parsea `parseFrontmatter` en `test/harness/st-runner.ts`.

### Reglas

- **`oracle:` no se omite en casos diferenciales.** `spec` = conformidad ANSI;
  `dialecto:gst`/`dialecto:pharo` = paridad con un Smalltalk vivo. NO conflar
  ambos (lección JSCert): una extensión no-ANSI de Pharo no es estándar.
- **Positivos** comparan estructura/resultado contra un fixture
  (`.ast.json` en L1, `printString` en eval). **Negativos** asertan `code`+`span`
  del error, deterministas.
- **Sin caso sin sección.** Un script de cobertura cuenta casos por producción
  del Anexo A y falla si una producción del gate queda sin caso.

> En L0 el corpus `.st` aún no se ejecuta (adapter = stub); sólo se prueban el
> descubrimiento y el parseo de frontmatter. El corpus se activa al verde de L1.
