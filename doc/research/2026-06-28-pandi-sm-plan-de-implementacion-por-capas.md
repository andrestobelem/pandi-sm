# Plan de implementación por capas — pandi-sm

Date: 2026-06-28

> **Nota de procedencia:** plan generado por workflow (run `wf_e08a55e1-c13`, 12 agentes, ~804k tokens subagente, ~26 min); deriva del deep-research del mismo día. Decisiones de encuadre tomadas por el usuario: dialecto = ANSI core + extensiones Pharo documentadas. Marca [UNVERIFIED] lo no validado contra código (el repo aún no tiene `src/`).

> **Nota de revisión (este pase):** se corrigen siete defectos de verificabilidad/origen detectados en revisión adversaria: (1) el conteo de selectores de excepciones era inconsistente (afirmaba 13, enumeraba 12) — **fijado a 12**; (2) GATE-F3 'species' y (3) GATE-F1-BOOLEAN-EXT estaban etiquetados o presentados como contrato ANSI sin respaldo en el research — **reetiquetados origen=ingeniería/extensión** y añadidos al log; (4) la corrección de nomenclatura `SequencedCollection`→`SequenceableCollection` se **declara explícitamente** como elección de dialecto; (5) los negativos de `resume` de no-resumable en L5 se **enrutan al log** como decisión de ingeniería sobre comportamiento *erroneous*, por consistencia con §8.3; (6) la decisión de `Float/0` se **fija a ZeroDivide** para que GATE-F2-ZERODIVIDE sea binario; (7) el seed del log de desviaciones sube de >=8 a **>=10**. Pendiente de fuente primaria: números de sección §8.5 (excepciones) y §5.9 (Stream Protocols).

> **Nota de revisión (pase de fixes post plan-review, runs `wf_a32edbd4-25f` + `wf_441b9a2e-9e7`):** se aplicaron los fixes mecánicos confirmados por el plan-review: (1) **V8-1** frontera de promoción a BigInt `2^53` → **`2^53−1` (`Number.MAX_SAFE_INTEGER`)** — evita corrupción entera silenciosa; (2) **V8-2** los objetos de control-flow (`NonLocalReturn`, `SignalException`) pasan a **objetos JS planos, NO `extends Error`** — evita la captura de stack de V8 en el hot path; (3) **GRAPH-1** el grafo de dependencias §3 ahora declara la **dirección de sus aristas** (leyenda) y se corrigieron las etiquetas L4↔L5; (4) **RISK-04** §5 añade leyenda de calibración de la escala `S/M/L/XL`; (5) **RISK-01** §5.3 añade un spike temprano de non-local return simétrico al de `resume:`. **Adiciones de diseño integradas (run `wf_eda5fca2-ab1`):** (a) **recursión/TCO vs `GATE-L4-NO-INLINING`** resuelto en §5.3.1 (bucles = special-forms iterativas; condicionales = envíos reales; recursión profunda = límite de stack documentado y mapeado a `Error`); (b) **cargador de kernel `.st`** especificado en §5.4.0 (dueño de `subclass:`, dos pasadas stubs→métodos, formato no-chunk) — cierra COMPL-3/SCOPE-03/SEQ-1. **`resume:` resuelto (runs `wf_bff672ef-b03` + pasada de corrección):** §5.5.1 añade el mecanismo de excepciones resumables verificado (dos fases, handler-antes-de-unwind, contra el condition system de Common Lisp + GNU Smalltalk + Pharo; cita fabricada CITA-1 corregida a paráfrasis; §F fijado a trampolín síncrono; gates `GATE-L5-*` binarios). **Oráculo diferencial añadido** (§6.3/§7/L6, decisión del usuario): `gst` golden-fixtures + Pharo triangulación, con etiquetado `oracle:`. **Plan completo: las 3 adiciones de diseño y los 6 fixes del plan-review están integrados.**

---

## 1. Objetivo y alcance del plan

Este documento define el plan de implementación incremental de **pandi-sm**, una implementación de Smalltalk (parser, object model y evaluador) escrita en TypeScript/ESM sobre Node.js. El objetivo es llevar el repositorio desde su estado actual de *scaffolding puro* (sin `src/`) hasta un MVP ejecutable que parsea, evalúa y ejecuta un subconjunto conforme de Smalltalk ANSI (INCITS 319-1998, draft v1.9), con extensiones de dialecto Pharo/Squeak explícitamente rotuladas.

El plan organiza el trabajo en **siete capas L0–L6** con un grafo de dependencias explícito, un **walking skeleton** que enciende la tubería end-to-end antes de invertir en amplitud, y **criterios de éxito binarios y cuantificados** que funcionan como *gates de CI*. Cada capa solo puede mergearse con su gate verde en CI; los gates de capas no entregadas se reportan `pending/skipped-by-design`, nunca `fail`.

**Mindset rector (heredado de `CLAUDE.md`):** baseline ejecutable primero (Karpathy), complejidad que se gana su sitio, cambios quirúrgicos, y TDD como bucle de feedback por defecto (Red → Green → Refactor, MSE). La conformidad se trata como disciplina *spec-driven* con trazabilidad test↔spec y un log de desviaciones append-only.

**Distinción criterios CI-binarios vs gates no-CI (corrección de revisión).** Un criterio es **CI-binario** solo si un verificador automático puede emitir pass/fail sin juicio humano y sin ambigüedad de resultado esperado. Se segregan explícitamente del camino crítico de CI: (a) **gates humanos de release** (política de derivación de licencia, §8.1); (b) **criterios de evidencia/PERF** (megamorfismo, `tinyBenchmarks`, §8.4/§8.8), que son [UNVERIFIED] y no pass/fail; (c) **triangulación contra dialecto-oráculo vivo** (§6.3), manual por diseño; (d) **puntos *unspecified*/implementation-defined** (`signalerContext`, retornos de Stream), documentados como prosa `skipped-by-design`, nunca como aserción de igualdad. Los **tests de política sobre comportamiento ANSI-*undefined*/*erroneous*** (home muerta → `BlockCannotReturn`; `resume` de no-resumable) SÍ son binarios como test, pero su **origen es ingeniería/desviación, no conformidad ANSI** — verifican la política elegida, no el estándar.

**Mapeo de numeración (importante, corregido por revisión):** las capas internas del plan **L0–L6** NO son 1:1 con los *gates* del research `§6.1` (que numera "capa 1..4"). El mapeo correcto es:

| Capa interna | Gate `§6.1` del research |
|---|---|
| L0 | (pre-capa: toolchain; no es gate `§6.1`) |
| L1 | gate `§6.1` **capa 1** (lexer/parser) |
| L2 | gate `§6.1` **capa 2** — *parte object model* (23 selectores `<Object>`, cierre metacircular) |
| L3 | gate `§6.1` **capa 2** — *parte evaluador* (send/super/dNU/bloques/non-local return + **Boolean mínimo**) |
| L5 | gate `§6.1` **capa 4** (excepciones) |
| L4 | gate `§6.1` **capa 3** (biblioteca base) |
| L6 | metodología `§7` (trazabilidad/log), NO un gate de capa numerado |

> No existe "capa 5" ni "capa 6" en el research: **L5 = gate capa 4**, **L6 = metodología**. El gate `§6.1` "capa 2" está repartido entre L2 y L3.

---

## 2. Decisiones de encuadre heredadas

| Decisión | Elección | Origen |
|---|---|---|
| Dialecto objetivo | ANSI core + extensiones Pharo/Squeak documentadas | dialecto |
| Lenguaje + módulos del runtime | TypeScript + ESM (`type=module`), no CommonJS | ingeniería |
| Runtime objetivo | Node LTS >=20 (`engines.node`), matriz CI con Node 20; local Node 24 | ingeniería |
| Test runner + harness host | Vitest como host-runner que evalúa fragmentos y compara resultados; emite JUnit XML | ingeniería |
| Reporter JUnit XML en CI | `reports/junit.xml` vía reporter `junit` de Vitest, publicado por el workflow | dialecto:Pharo (espeja `--junit-xml-output`) |
| Contrato del parser | Anexo A (gramática léxica/de método ANSI) verbatim; recursive-descent a mano; Ohm.js como fallback documentado | spec-ANSI |
| Modelo Unicode/String | `Character` por code point Unicode; `String` sobre `string` JS (UTF-16); ByteString-vs-WideString = conformidad diferida | ingeniería |
| Identidad de Symbol | Tabla de interning propia (NO el `Symbol` global de JS); identidad `==` de selectores disponible antes del dispatch | ingeniería |
| Estructura física del objeto | Plain JS object `{ class, hash, format, pointers }`, ivars **indexadas**, sin object table | dialecto:Squeak |
| Núcleo de clases | Object → Behavior → ClassDescription → Class, con Metaclass hermana de Class | dialecto:Pharo |
| Cierre metacircular | Wiring por mutación (`setClass`) estilo JsSOM; sin imagen, sin inferencia | dialecto:Squeak |
| SmallInteger/Character | Valores nativos JS (number / code point), sin box ni tagging | ingeniería |
| Promoción numérica | SmallInteger sobre `number`; auto-promoción a `BigInt` cuando el resultado sale del rango seguro `±(2^53−1)` (`Number.MAX_SAFE_INTEGER`) | ingeniería |
| Mecánica de excepciones | Sobre `try/catch/throw` nativo, **reutilizando** el unwind de non-local return de L3 (una sola maquinaria); objetos de control-flow = **objetos JS planos, no `extends Error`** (sin captura de stack) | ingeniería |
| `Float / 0` | **Señalar ZeroDivide** (semántica Smalltalk uniforme), NO IEEE `Infinity`; divergencia de JS registrada en el log de desviaciones | ingeniería (decisión fijada en §8.2) |
| Nomenclatura de colección secuenciable | `SequenceableCollection` (nombre real Pharo/Squeak), corrigiendo `SequencedCollection` del research §4/§6.1 | dialecto:Pharo (corrección de nomenclatura, ver §8.9) |
| Persistencia / imagen | Sin imagen (no snapshot); kernel como assets `.st` bootstrappeados desde fuente | dialecto:Squeak (Amber-style) |
| Inline cache / compile-to-JS | Fuera del MVP; `send()` genérico primero; IC solo si los benchmarks la piden | ingeniería |
| `copy` (`<Object>`) | Semántica **shallow** como decisión de ingeniería/dialecto (NO afirmada como contrato ANSI) | ingeniería |
| Licencia / política de derivación | **OPEN QUESTION** (LICENSE MIT placeholder ya commiteado). Gate humano de release, NO CI-binario. Bloqueante para distribución, no para el spike | ingeniería (requiere revisión humana) |

---

## 3. Mapa de capas y grafo de dependencias

**Capas:**

- **L0** — Setup & tooling (toolchain TS+ESM, Vitest+JUnit, contratos de tipo bloqueantes, **runner host básico**).
- **L1** — Lexer + Parser recursive-descent (3 niveles) sobre el Anexo A.
- **L2** — Object model / metamodelo (núcleo de 5 clases + Metaclass, cierre metacircular).
- **L3** — Evaluador tree-walking (send/super/dNU + bloques-closures + non-local return + **Boolean mínimo**).
- **L4** — Biblioteca base / kernel (familias de conformidad F1..F6).
- **L5** — Excepciones (contrato ANSI; entra **antes** de L4).
- **L6** — Trazabilidad bidireccional + log de desviaciones (metodología `§7`); el runner básico ya vive en L0.

**Aristas de dependencia.** Leyenda: **`A → B` significa «B depende de A»** — A (prerequisito) debe estar verde antes de empezar B; la flecha sigue el sentido del flujo de implementación (del prerequisito al dependiente) y coincide con la regla de avance (§9).

```
L0 → L1   L0 → L2   L0 → L3   L0 → L6
L1 → L2   L1 → L3   L1 → L4   L1 → L5   L1 → L6
L2 → L3   L2 → L4   L2 → L5
L3 → L4   L3 → L5   L3 → L6
L5 → L4   (núcleo: L4 depende de L5 — GATE-L4-PRECOND; el núcleo on:do:/ensure:/signal
           se cierra ANTES de L4)
L4 → L5   (parcial/diferido: solo el cierre ZeroDivide — Number>>/ de F2 de L4 señala
           ArithmeticError→ZeroDivide capturable; la máquina de excepciones de L5 NO depende de L4)
L4 → L6   (corpus de conformidad L3/L4 se añade al runner sin tocarlo; L6 es incremental)
```

(Todas las capas requieren L0 transitivamente vía L1/L2/L3; las aristas `L0 → L4`/`L0 → L5` se omiten por transitividad.)

**Camino crítico:** `L0 → L1 → L2 → L3 → L5 → L4`.

> Romper la circularidad declarada L4↔L5: **L5 entra antes que L4** porque la máquina de excepciones se monta sobre el unwind de L3 y NO requiere la torre numérica (arista `L5 → L4`: L4 depende del núcleo de L5 vía GATE-L4-PRECOND). El único criterio de L5 que se difiere (cierre ZeroDivide) se cierra retroactivamente cuando F2-Number de L4 está verde (arista `L4 → L5`, diferida).

---

## 4. Walking skeleton: primer corte ejecutable recomendado

**Objetivo:** el slice end-to-end más fino que atraviesa lexer (L1) → parser (L1) → object model (L2) → evaluador (L3), montado sobre el toolchain de L0 y conducido por el runner host (que vive en L0/L1, no en L6). Se construye **verticalmente y mínimo** en cada capa: solo lo imprescindible para encender la tubería. El resultado es el baseline ejecutable Karpathy — inspeccionable, depurable, con un primer test verde binario en CI que demuestra que las cuatro capas conversan **antes** de invertir en amplitud.

**Primer test verde (concreto y binario):**

> `eval("3 + 4 * 2")` ⇒ `14`. Precedencia Smalltalk estricta izquierda-a-derecha, **sin** precedencia aritmética: `((3 + 4) * 2) = 14`, NO `11`. El harness compara `printString` del SmallInteger resultante `=== '14'`.

**Segundo test verde (efecto observable):**

> `eval("Transcript show: 'hi'")` escribe `'hi'` en un `Transcript` de prueba (buffer en memoria); el harness asevera el efecto lateral, demostrando un keyword message con argumento `String` y dispatch sobre un objeto del kernel.

**Pasos:**

1. **L0:** `npm ci`/`typecheck`/`build`/`test:ci` verdes en CI con JUnit XML; los contratos TS `SymbolTable` y `StString/StCharacter` typecheckean (decisión documentada, sin impl real); el `RuntimeAdapter` del runner existe como interfaz (con adapter stub).
2. **L1 (mínimo):** tokenizar enteros decimales, los binarySelectors `+` y `*`, y un keyword `show:` + string literal `'...'`; parser recursive-descent de 3 niveles que produzca el AST de `1+2*3` como `((1+2)*3)` (verifica la precedencia plana en el AST) y de `Transcript show: 'hi'` como `MessageSend` keyword. `astToJSON` canónica para el diff.
3. **L2 (mínimo):** `bootstrapKernel()` cablea las 5 clases núcleo + Metaclass + UndefinedObject + `nil`, crea `SmallInteger` (classOf de un `number` nativo) y un `Transcript` de prueba; method dictionaries `Map` vacíos salvo lo que L3 instale; `SymbolTable` real interna `'+'`, `'*'`, `'show:'`.
4. **L3 (mínimo):** `evalNode` para `LiteralNode` (Integer/String) y `MessageSend` (binary/keyword); `send(receiver, selector, args)` que hace lookup por la cadena de clases de L2; tabla de primitivas mínima: `SmallInteger>>+`, `SmallInteger>>*` (delegan a `number` JS, hook de auto-promoción presente pero diferido) y `Transcript>>show:`. Sin bloques, sin super, sin non-local return, sin dNU completo todavía.
5. **Runner (mínimo, L0/L1):** el harness host evalúa los dos fragmentos `.st` con el `RuntimeAdapter` real (parse de L1 + evaluate de L3), compara `printString === '14'` y el efecto del `Transcript`, y emite JUnit XML. Frontmatter de trazabilidad: el primer caso referencia Anexo A.2 (precedencia binario/keyword); el segundo, el protocolo de keyword message.
6. **Verde el skeleton:** a partir de aquí se ensancha por capa siguiendo la regla de avance — más producciones del Anexo A en L1, los 23 selectores y el cierre metacircular en L2, self/super/bloques/non-local return + Boolean mínimo en L3, luego L5 excepciones, luego las familias F1..F6 de L4.

**Capas tocadas:** L0, L1, L2, L3 (+ runner host básico).

---

## 5. Plan detallado por capa

> **Escala de esfuerzo (calibración *first-pass*, a recalibrar tras el walking skeleton).** Las etiquetas `S/M/L/XL` de cada capa son estimaciones *first-pass* del autor del plan (NO heredadas del research, que no estima esfuerzo). Calibración orientativa: **S** ≈ 1–2 días · **M** ≈ 3–5 días · **L** ≈ 1–2 semanas · **XL** ≈ 3+ semanas (jornada-persona, relativa). El mecanismo real de progreso son los gates CI binarios y la regla de avance (§9), no estas etiquetas; recalibrar con el primer dato de velocidad del walking skeleton.

### 5.0 L0 — Setup & tooling (dependencias previas a la capa 1)

**Mapeo de gate:** pre-capa; no corresponde a un gate `§6.1` numerado. Habilita L1.

**Objetivo.** Dejar el repo en estado "primer commit de código posible": toolchain TypeScript+ESM sobre Node LTS >=20, runner Vitest que emite JUnit XML, scripts npm canónicos, el esqueleto **mínimo** de carpetas, las dos decisiones de modelo bloqueantes documentadas, y el **runner host básico** que L1 necesitará para su propio gate. El gate de L0 es: *cadena TS→Vitest→JUnit XML→CI verde end-to-end* sobre un test trivial, con Node >=20 forzado. La licencia/derivación queda como OPEN QUESTION explícita.

**Alcance — in.**
- `package.json`: `type=module` (ESM), `engines.node >=20`, `packageManager` fijado, scripts canónicos (`build`, `typecheck`, `test`, `test:watch`, `test:ci`, `lint`, `format`, `st-run`).
- `tsconfig.json` estricto NodeNext: `target` ES2022+, `module`/`moduleResolution` NodeNext, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax`, `declaration`, `sourceMap`, `outDir dist/`, `rootDir src/`.
- Toolchain: TypeScript >=5.x; runtime de TS en dev (preferir `tsx` por fricción mínima — decisión de ingeniería, medir el ciclo en el spike); Vitest con cobertura.
- Vitest con reporter JUnit XML (`reporters: ['default','junit']`, `outputFile: reports/junit.xml`).
- **Esqueleto de carpetas reducido (corrección de over-engineering):** crear SOLO `src/lexer` (L1), `src/ast` (L1) y `test/` paralelo. Las demás carpetas (`src/model`, `src/eval`, `src/runtime`, `src/kernel`, `src/cli`, `src/harness`) se crean **cuando arranca su capa**, no el día 0 — barrels mínimos, cero topología especulativa.
- **Dos decisiones de modelo bloqueantes, documentadas en `doc/research/` (no como código a escribir hoy):** (a) modelo Unicode/String (`Character` por code point Unicode; `String` sobre UTF-16; ByteString-vs-WideString diferida) y (b) tabla de interning de Symbol propia (NO `Symbol` de JS). Las **firmas TS** correspondientes se escriben cuando L1/L2 las consuman; L0 solo fija la decisión.
- **Runner host básico:** la interfaz `RuntimeAdapter` y el esqueleto del runner Vitest (descubrimiento de `.st`, parseo de frontmatter, emisión JUnit). Arranca con un adapter **stub**; el corpus real se activa cuando L1 esté verde.
- Linter+formatter (ESLint flat config + Prettier, o Biome — a confirmar en el spike), reglas mínimas no bloqueantes.
- Workflow de CI (`.github/workflows/ci.yml`): `install`→`typecheck`→`build`→`test:ci` en push/PR; publica `reports/junit.xml` como check/artefacto. Matriz que incluye Node 20 LTS.
- Convención de naming/frontmatter de tests por sección de spec (estilo ACATS/Test262), documentada y referenciada por el test trivial.
- Convención (no contenido) del **log de desviaciones** en `doc/research/`.

**Alcance — diferido.**
- Implementación real de `SymbolTable` y del modelo `String/Character` (L2/L4).
- Firmas TS de los contratos como artefacto en L0 (se difieren a cuando L1/L2 las consuman — el gate de L0 es solo la cadena verde end-to-end).
- Carpetas `src/model`, `src/eval`, `src/runtime`, `src/kernel`, `src/cli`, `src/harness` (se crean al arrancar su capa).
- CLI funcional que evalúa `.st` (`st-run` es un stub que sale con código de no-implementado documentado).
- `verifyTraceability` bidireccional y `parseDeviationLog` (son trabajo de L6, tras corpus L1 verde).
- SUnit nativo; resolución ByteString-vs-WideString; `become:`/object table/imagen; cierre legal de licencia (revisión humana).

**Decisiones clave (con origen).**
- TypeScript + ESM, no CommonJS — *ingeniería* (condiciona cómo se escribe el lexer desde el primer commit).
- Node LTS >=20 con matriz CI — *ingeniería* (evita escribir L1 contra APIs no presentes en LTS).
- Vitest como host-runner + JUnit XML — *ingeniería* (espeja gst `AT_DIFF_TEST` / smalltalkCI; SUnit nativo diferido).
- Reporter `reports/junit.xml` — *dialecto:Pharo* (espeja `--junit-xml-output`).
- Anexo A como binding contract de L1; recursive-descent, Ohm.js fallback — *spec-ANSI*.
- Sin imagen; kernel como assets `.st` — *dialecto:Squeak* (Amber-style).
- Licencia/derivación = OPEN QUESTION — *ingeniería* (revisión humana; MIT placeholder).

**API/estructuras.**
- Scripts npm (firmas de comando): `build` (`tsc -p`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:ci` (`vitest run --reporter=default --reporter=junit --outputFile=reports/junit.xml`), `lint`, `format`, `st-run` (stub que falla limpio).
- `RuntimeAdapter` (interfaz): `parse(src: string): unknown` / `evaluate(src: string): { printString: string }`. Implementación stub en L0.
- `LayerModuleMap` (esqueleto): correspondencia carpeta→capa, materializada **incrementalmente** (solo lexer/ast el día 0).
- `JUnitReportConfig`: configuración del reporter de Vitest consumida por CI.

**Criterios de éxito cuantificados (gates CI binarios).**
- `npm ci` desde lockfile termina **exit 0** en checkout fresca.
- `npm run typecheck` (`tsc --noEmit` strict) termina **exit 0** sobre el esqueleto.
- `npm run build` produce `dist/` con `.js` ESM + `.d.ts`, **exit 0**, ejecutable por Node >=20 (import del barrel raíz no lanza).
- `npm run test:ci` pasa el >=1 test trivial y **ESCRIBE `reports/junit.xml` bien formado** (XML con >=1 `<testsuite>` y >=1 `<testcase>`), verificado por aserción/validación XML.
- **Versión de Vitest fijada en el lockfile** (parte del criterio, no solo mitigación), para que la forma del JUnit XML sea estable y CI-verificable.
- El workflow de CI ejecuta `install+typecheck+build+test:ci` en push/PR y queda **VERDE**; el JUnit XML se publica como check/artefacto.
- Carpetas existentes exactamente: `src/lexer`, `src/ast`, `test/` (las demás NO el día 0); todas compilan vacías/placeholder.
- **Node >=20 forzado:** `engines.node >=20` declarado y CI corre en matriz con Node 20 LTS.
- `npm run st-run` (sin args) sale con código de no-implementado documentado (p.ej. 2) y mensaje claro.
- La convención de naming/frontmatter por sección de spec está documentada y referenciada por el test trivial.

**Artefacto de tests.** Tests de toolchain bajo `test/`: (1) un *toolchain smoke test* trivial (NO Smalltalk) que prueba la cadena TS→Vitest→JUnit y demuestra el naming/frontmatter; (2) un test del runner stub que verifica descubrimiento + parseo de frontmatter sin runtime real. El artefacto CI es `reports/junit.xml`.

**Riesgos.**
- **Licencia/derivación sin resolver** ([INSUFFICIENT_EVIDENCE], `§9`): el MIT ya commiteado da falsa sensación de cierre; el riesgo es la POLÍTICA de derivación. Bloquea distribución, no el spike. *Mitigación:* open question visible + revisión humana antes de publicar (gate humano de release, no CI).
- Trampa ESM/NodeNext + TS (extensiones `.js`, `verbatimModuleSyntax`). *Mitigación:* validar la cadena con el test trivial end-to-end ANTES de L1.
- `tsx` vs `ts-node` vs solo `tsc` afecta velocidad de feedback. *Mitigación:* preferir el de menor fricción (`tsx`) y medir.
- Configuración de JUnit XML de Vitest varía entre versiones. *Mitigación:* **versión fijada en lockfile** (ya elevado a criterio) + aserción sobre la forma del XML.
- Drift de versión de Node (local 24 vs target >=20). *Mitigación:* `engines.node` + matriz CI con Node 20.

**Dependencias.** Ninguna.

**Esfuerzo.** M.

---

### 5.1 L1 — Lexer + Parser recursive-descent (3 niveles) sobre el Anexo A

**Mapeo de gate:** gate `§6.1` **capa 1** (lexer/parser).

**Objetivo.** Convertir texto fuente Smalltalk (fragmentos de expresión/método del subconjunto ANSI, draft v1.9) en un AST explícito y tipado, mediante lexer + parser recursive-descent escritos a mano en TS/ESM. Implementa **literalmente** las producciones del Anexo A (A.1 tokens, A.2 mensajes/precedencia, A.3 bloques, A.4 ambigüedades) sin inventar gramática, resuelve las 2 ambigüedades ANSI (`:=` vs keyword; número negativo léxico tras binario) y soporta como extensiones MARCADAS los arrays dinámicos `{ }` y byte-arrays `#[ ]`. En L1 NO hay evaluación, ni objetos Smalltalk, ni semántica de definición de clase.

**Alcance — in.**
- Lexer que produce todos los tokens de A.1: identifier, keyword (`id:`), binarySelector (conjunto `~ ! @ % & * + , / < = > ? \ | -`), `:=`, `^`, separadores `( ) [ ] { } #( #[ . ; |`, y todos los literales.
- Literales numéricos ANSI: decimalInteger, radixInteger (`16rFF`, base 2..36), float con exponente `e`/`d`/`q` (FloatE/D/Q), scaledDecimal (`1.234s4`). **Rango entero ilimitado:** el lexer NO trunca; emite `raw` y delega la promoción a BigInt a L2 (frontera `2^53−1` = `Number.MAX_SAFE_INTEGER`).
- Literales no numéricos: `$c`, `'...'` (con `''` como escape), `#'...'`, `#sym`/`#at:put:`/`#+`, quotedSelector, array literal `#( ... )` (único literal de colección ANSI; admite anidación).
- Número negativo como token **léxico** (`['-'] number`), NO mensaje unario.
- Parser recursive-descent en 3 niveles (unario > binario > keyword, estricta izquierda-a-derecha, **sin precedencia aritmética** → `1 + 2 * 3` produce AST equivalente a 9).
- Producciones A.2: expression, assignment (incl. `a := b := expr`), basic expression, primary, unary/binary/keyword message, cascaded messages (`;`).
- Bloques A.3: `[ args | temps | statements ]`, `^ expr` reconocido **sintácticamente** (la semántica de non-local return es de L3).
- Resolución de las 2 ambigüedades A.4 como reglas deterministas con casos negativos.
- Extensiones MARCADAS: `{ }` (DynamicArrayNode) y `#[ ]` (ByteArrayLiteralNode) con metadato `origin='ext:pharo-squeak'`.
- Posición (línea/columna/offset, start/end) en cada token y nodo.
- Errores estructurados (`ParseError`/`LexError` con `code`+`span`) para rechazo determinista.
- Corpus de tests `.st` estilo `AT_DIFF_TEST` (AST serializado para positivos; clase-de-error/posición para negativos).

**Alcance — diferido.**
- Cualquier evaluación/reducción del AST (L3).
- Object model / interning real de Symbol (L1 emite el TEXTO; el interning es L2/L4).
- Promoción SmallInteger→BigInt / torre numérica (L1 conserva `raw`; el tipo es L2/L4).
- Sintaxis de DEFINICIÓN DE CLASE: `Object subclass:...` se parsea como keyword message ordinario; su semántica es L2.
- Interchange Format ANSI / chunks `!` / fileIn/Tonel/Monticello (L2+).
- Pragmas / `<primitive: n>` (no ANSI; diferido, como extensión marcada si se añade).
- Ohm.js / PEG como motor primario (solo fallback documentado).

**Decisiones clave (con origen).**
- Motor recursive-descent a mano en 3 niveles (`parseKeyword → parseBinary → parseUnary → parsePrimary`) — *ingeniería* (la precedencia ANSI mapea 1:1; control total sobre AST/cascadas/errores).
- Gramática = Anexo A verbatim, cada producción referenciada por nombre — *spec-ANSI* (evita drift; habilita trazabilidad).
- Número negativo = token léxico — *spec-ANSI* (A.1/A.4: `3 - -4` válido; `3 --4` NO es `3 - (-4)`).
- `:=` vs keyword `=` resuelto en lexer (lookahead sin whitespace) — *spec-ANSI* (A.4 caso 1).
- AST como discriminated unions TS con `SourceSpan` — *ingeniería* (exhaustividad + serialización estable).
- `{ }` / `#[ ]` con `origin='ext:pharo-squeak'` — *extensión-propia*.
- `subclass:` NO es sintaxis especial en L1 — *spec-ANSI* (A.5 excluye definición de clase del lexer de expresiones).
- L1 emite lexema de Symbol, no interna — *dialecto:Pharo* (interning para `==` es L2/L4).
- String/Character sobre UTF-16 — *ingeniería* (divergencia ByteString-vs-WideString documentada).
- Errores estructurados con posición — *ingeniería* (gate exige rechazo determinista, estilo `assert_malformed`).
- TS+ESM, Node >=20, sin libs de parsing externas — *ingeniería*.

**API/estructuras.**
- `tokenize(source, opts?): { tokens: Token[]; errors: LexError[] }`.
- `interface Token { type; lexeme; value?: number|bigint|string; span: SourceSpan }`.
- `interface SourceSpan { start:{offset,line,column}; end:{offset,line,column} }`.
- `parse(source, opts?): ParseResult` con `ParseOptions { startRule?; allowExtensions? }`.
- `parseExpression(source): Node`.
- `type ParseResult = { ok:true; ast: ProgramNode } | { ok:false; errors: ParseError[] }`.
- `type Node = ProgramNode | SequenceNode | ReturnNode | AssignmentNode | MessageSendNode | CascadeNode | BlockNode | VariableNode | LiteralNode` (discriminada por `type`).
- `MessageSendNode { kind:'unary'|'binary'|'keyword'; receiver; selector; args; span }`.
- `BlockNode { params; temporaries; body: SequenceNode; span }`.
- `LiteralNode { lit: LiteralKind; raw; value?; origin?: 'ansi'|'ext:pharo-squeak'; span }`.
- `CascadeNode { receiver; messages[]; span }`.
- `class ParseError extends Error { code; span }` / `class LexError { code; span; message }` — códigos estables (`E_NEG_NO_SPACE`, `E_UNTERMINATED_STRING`, `E_ASSIGN_VS_KEYWORD`, `E_UNEXPECTED_TOKEN`).
- `astToJSON(node): unknown` — serialización canónica (orden de claves fijo).

**Criterios de éxito cuantificados (gates CI binarios).**
- **Positivos:** >=40 casos verdes, >=1 por producción del Anexo A — incluye decimalInteger, radixInteger (`16rFF`), FloatE/D/Q, scaledDecimal (`1.234s4`), `$c`, string (con `''`), `#sym`, `#at:put:`, `#+`, `#( )` (incl. anidado); unario/binario/keyword; cascada (`;`); asignación (incl. `a:=b:=expr`); `^`; bloque `[:x :y| ...]`, bloque con temporaries, bloque sin args; primary entre paréntesis; precedencia (`1 + 2 * 3` parsea como `((1+2)*3)`); >=2 casos de extensiones marcadas (`{ 1. 2+3 }` y `#[ 1 2 3 ]` con `origin='ext:pharo-squeak'`).
- **Negativos:** >=15 casos verdes (`parse` devuelve `ok:false` con `code`+`span` esperados): A.4 caso 1, A.4 caso 2 (`3 --4`), string sin cerrar, `$` sin carácter, `#(` sin cerrar, `{` sin cerrar, paréntesis desbalanceado, radix inválido (`16rZZ`/base fuera de 2..36), exponente mal formado, scaledDecimal mal formado, símbolo vacío, keyword message sin argumento, cascada sobre primary sin mensaje previo, token inesperado en primary.
- **Igualdad estructural (corregida):** para cada positivo, `JSON.stringify(astToJSON(parse(src))) === JSON.stringify(fixture)` (comparación de JSON canónico con orden de claves fijo, o `deepEqual`) — NO `===` sobre objetos.
- **Determinismo del rechazo:** cada negativo produce el MISMO `code` y `span` en ejecuciones repetidas; ningún negativo lanza excepción no tipada.
- **Cobertura de origen:** 100% de los nodos `{ }`/`#[ ]` del corpus llevan `origin='ext:pharo-squeak'`; **0** nodos ANSI lo llevan (aserción sobre el AST serializado).
- Build/typecheck/lint verdes; el paquete exporta `tokenize`/`parse`/`parseExpression` como ESM.
- **Trazabilidad:** cada caso referencia su producción (A.1/A.2/A.3) o el caso de A.4; un script cuenta cobertura por producción y falla si alguna producción del gate queda sin caso.
- **Regla de avance:** gate L1 verde en CI antes de iniciar L2.

**Artefacto de tests.** Corpus `.st` estilo `AT_DIFF_TEST` gobernado por el runner host en Vitest: `test/L1/positive/*.st` con fixtures `.ast.json` (>=40), `test/L1/negative/*.st` con fixtures `.err.json` (`code`+`span`) (>=15). Emite JUnit XML. Cada caso lleva metadato de su producción del Anexo A. No usa SUnit nativo.

**Riesgos.**
- Ambigüedad scaledDecimal vs float vs identificador adyacente. *Mitigación:* tests negativos de exponente/scaled mal formado + reglas de sufijo explícitas.
- Conjunto exacto de binaryCharacter incierto en el draft. *Mitigación:* fijar el set listado en A.1 como autoritativo y registrar como desviación cualquier carácter adicional.
- Rango entero ilimitado vs `number` JS. *Mitigación:* L1 conserva `raw`; el `value` numérico es best-effort o se omite para enteros grandes.
- Número negativo léxico interactúa con cascadas/keyword args. *Mitigación:* regla de whitespace A.4 caso 2 con positivos y negativos dedicados.
- Unicode fuera del BMP (surrogate pairs) rompe conteo de columnas. *Mitigación:* iterar por code point; ByteString-vs-WideString diferida.
- Deriva respecto a ANSI por conveniencia. *Mitigación:* flag `origin` obligatorio + aserción de 0 nodos ANSI con flag + log de desviaciones día 1.
- Fragilidad de fixtures ante cambios de AST. *Mitigación:* `astToJSON` canónica y versionada; regeneración controlada.

**Dependencias.** L0 (TS+ESM, Node >=20, runner host Vitest+JUnit). Decisión de modelo Unicode/String/Symbol (solo la DECISIÓN, no la tabla de interning — esa es L2/L4).

**Esfuerzo.** M.

---

### 5.2 L2 — Object model / metamodelo

**Mapeo de gate:** gate `§6.1` **capa 2** — *parte object model* (23 selectores `<Object>`, cierre metacircular).

**Objetivo.** Establecer la espina dorsal reflexiva: un grafo de objetos vivo donde cada objeto Smalltalk es un plain JS object con slots indexados `{ class, hash, format, pointers }`, sin object table; el núcleo invariante Object→Behavior→ClassDescription→Class más Metaclass cableado metacircularmente por mutación (`setClass`) hasta cerrar la *golden braid* (`X class class == Metaclass`); `nil` como única instancia de UndefinedObject; y la reflexión mínima de bootstrap más los 23 selectores del protocolo `<Object>` de `§6.1` disponibles. L2 NO ejecuta sintaxis Smalltalk; construye y expone en TS el metamodelo sobre el que L3 hará dispatch.

**Alcance — in.**
- Estructura de objeto: `STObject` plain JS object `{ class, hash, format, pointers[] }` — ivars **indexadas por entero**, sin object table.
- Núcleo de 5 clases: Object, Behavior, ClassDescription, Class, Metaclass (jerarquía + Metaclass hermana de Class).
- Behavior porta el estado mínimo: `superclass`, `methodDict: Map<SymbolId,CompiledMethod>`, `format`/`instSize`, `basicNew`.
- Cierre metacircular por mutación (`setClass`) estilo JsSOM, con el paralelismo `X class superclass == X superclass class` y la trampa `Object class superclass == Class`.
- `nil` = única instancia de UndefinedObject; superclase de la raíz = `nil`; pointers no inicializados = `nil`.
- Method dictionary `Map<SymbolId,CompiledMethod>`; `addSelector:withMethod:`/`removeSelector:`; helper de lookup por superclass chain.
- Los **23 selectores** del protocolo `<Object>` de `§6.1` como primitivas del kernel: `= == ~= ~~ class copy doesNotUnderstand: error: hash identityHash isKindOf: isMemberOf: isNil notNil perform: perform:with: perform:with:with: perform:with:with:with: perform:withArguments: printOn: printString respondsTo: yourself`.
- Reflexión mínima de bootstrap: `basicNew`, `instVarAt:`/`instVarAt:put:` (base 1), `perform:withArguments:`, `class`, `respondsTo:`.
- Identidad: `identityHash` estable (contador/WeakMap), `==` por referencia; integración con la tabla de interning de Symbol.
- SmallInteger/Character como valores nativos JS; `classOf` mapea `typeof` → clase Smalltalk sin convertir en STObject.
- `doesNotUnderstand:` por defecto en Object como **hook/slot** (reificación de Message diferida a L3).
- `bootstrapKernel(): Universe` con referencias nombradas + `nil`/`true`/`false`.

**Alcance — diferido.**
- ProtoObject como raíz (extensión Squeak/Pharo; el MVP enraíza en Object→`nil`).
- Traits.
- `become:` eficiente, `allInstances`/`allObjects` baratos.
- Object table / tagged pointers / header binario Spur (explícitamente NO).
- Class variables / shared pools / class-instance variables completas.
- Recompilación/migración/reshape en caliente más allá de `addSelector:`/`removeSelector:`.
- `thisContext`/Context reificado.
- Definición de clases vía sintaxis (`Object subclass:...` o `Class named:...`) — eso es L1/L3; L2 expone la API TS de construcción. **La primitiva `subclass:` que consume esa API TS (anclada por selector, propiedad de L2) se especifica en §5.4.0 (KERNELLOAD).**
- `copy` profundo (el `copy` de `<Object>` es **shallow** como decisión de ingeniería/dialecto, **NO contrato ANSI**).

**Decisiones clave (con origen).**
- Estructura plain JS object con ivars indexadas, sin object table — *dialecto:Squeak* (lección SqueakJS; delegar memoria a V8).
- Núcleo de 5 clases con Metaclass hermana de Class — *dialecto:Pharo*.
- Cierre metacircular por mutación (`setClass`) — *dialecto:Squeak* (patrón JsSOM, más simple y depurable).
- Tabla de interning propia + `identityHash` + `==` por referencia — *ingeniería*.
- SmallInteger/Character nativos sin box/tag — *ingeniería*.
- `nil` = única instancia de UndefinedObject; termina cadenas — *spec-ANSI*.
- Object como raíz con superclase `nil`; ProtoObject diferido — *spec-ANSI*.
- Reflexión de bootstrap mínima (Hazelnut/Espell) — *dialecto:Pharo*.
- L2 expone solo el primitivo de lookup; `send`/super/Message reificado en L3 — *ingeniería*.
- `copy` shallow como **decisión de ingeniería/dialecto**, no contrato ANSI — *ingeniería* (corrección de etiquetado).

**API/estructuras.**
- `enum ObjectFormat { Pointers, IndexablePointers, Bytes, Words, CompiledMethod }`.
- `interface STObject { class: STClass|null; hash; format; pointers[] }`.
- `interface CompiledMethod { selector; invoke(rcvr,args,ctx): STObject; sourceNode?; primitive? }`.
- `class STClass implements Behavior { superclass; methodDict; format; instSize; name?; metaclass; setClass(); basicNew(); lookup(sel) }`.
- `bootstrapKernel(symbols: SymbolTable): Universe` (idempotente por instancia).
- `interface Universe { Object; Behavior; ClassDescription; Class; Metaclass; UndefinedObject; SmallInteger; Character; nil; true_; false_; classOf(v) }`.
- `classOf(universe, value): STClass`; `instVarAt/instVarAtPut` (base 1); `basicNew(cls)`; `addSelector/removeSelector`; `lookupMethod(startClass, sel)`.
- Kernel `<Object>` primitives instaladas en `Object.methodDict`.

**Criterios de éxito cuantificados (gates CI binarios).**
- **23 selectores `<Object>` presentes** (conteo `=== 23`) y alcanzables desde una instancia de cualquier clase del kernel. *Aclaración (corrección de tensión L2/L3):* el gate verifica **presencia + semántica de los selectores que NO requieren envío**; `doesNotUnderstand:` se verifica como **hook presente** en L2 y su semántica ANSI end-to-end (reificación de Message → MessageNotUnderstood) se gatea en L3/L5.
- **Cierre metacircular (aserción binaria):** para cada clase X del kernel, `classOf(classOf(X)) === Universe.Metaclass`, incluido `Metaclass class class === Metaclass`; test que itera las >=6 clases núcleo → todas verdes.
- **Paralelismo:** para cada X con superclase no-`nil`, `classOf(X).superclass === classOf(X.superclass)`; + trampa `classOf(Object).superclass === Universe.Class` y cadena Class→ClassDescription→Behavior→Object recorrible.
- **`nil` singleton:** `classOf(Universe.nil) === Universe.UndefinedObject`, `UndefinedObject.superclass === Universe.Object`, superclase de la raíz `=== Universe.nil`; `nil isNil` → true, `Object new isNil` → false.
- **`basicNew`:** para instSize N, `pointers.length === N` y todos `=== nil`; `instVarAt:put:` en `i` seguido de `instVarAt: i` devuelve lo escrito; `instVarAt: 0` o `N+1` lanza error de rango.
- **Identidad y dispatch primitivo:** dos `basicNew` distintos → `a == b` false, `a == a` true; `identityHash` estable; `lookupMethod` resuelve a la superclase definidora correcta.
- **Identidad sobre inmediatos (corrección de gap, compartida con L4):** `3 == 3` → **true por valor**; `$a == $a` → **true**; `identityHash` sobre un inmediato es estable y consistente con `==` por valor. Sin esto el contrato de identidad de SmallInteger/Character queda indefinido.
- **`perform:` round-trip:** `perform:withArguments:` con un selector del kernel == envío directo (verificado para `yourself`, `class`, `identityHash` y >=1 `perform:with:` aridad 1).
- **`respondsTo:`/`isKindOf:`/`isMemberOf:`** con semántica correcta (positivos y negativos).
- **Build/CI verde:** compila bajo TS estricto + ESM (Node >=20); la suite Vitest de L2 emite JUnit XML. Regla de avance: gate verde antes de L3.

**Artefacto de tests.** Suite Vitest (TS puro) de unit tests del metamodelo — NO fragmentos `.st`. Construye un `Universe` vía `bootstrapKernel()` y asevera: conteo/presencia de los 23 selectores, identidades de cierre, paralelismo, `nil` singleton, `basicNew`/`instVarAt:` round-trip, identidad sobre inmediatos, `identityHash` estable, lookup por superclass chain, `perform:`/`respondsTo:`/`isKindOf:`. Cada test referencia la regla o el selector que cubre. Emite JUnit XML.

**Riesgos.**
- Bug clásico del lookup de metaclases (mensajes de clase suben por metaclases, no por superclases de la instancia). *Mitigación:* test explícito + aserción del paralelismo.
- Orden de bootstrap frágil. *Mitigación:* replicar la secuencia JsSOM y aseverar el cierre al final de `bootstrapKernel`.
- Acoplamiento con interning de Symbol. *Mitigación:* `SymbolTable` inyectada; gate L1/L0 verde primero.
- `classOf` con inmediatos vs STObject. *Mitigación:* centralizar en `classOf()` + tests de SmallInteger/Character.
- Tentación de adelantar `become:`/`allInstances`/ProtoObject/traits. *Mitigación:* diferidos; el gate no los exige.
- **Frontera L2/L3 difusa** en `doesNotUnderstand:`. *Mitigación (corregida):* en L2 solo el hook; la reificación de Message y `send`/super son criterios de L3 — el gate de los 23 verifica presencia + semántica de los que no requieren envío.
- Prospectivo, sin código aún ([UNVERIFIED]): las firmas TS pueden requerir ajuste al primer contacto con el evaluador. *Mitigación:* gate de cierre temprano.

**Dependencias.** L0, L1.

**Esfuerzo.** L.

---

### 5.3 L3 — Evaluador tree-walking (send/super/dNU + bloques-closures + non-local return + Boolean mínimo)

**Mapeo de gate:** gate `§6.1` **capa 2** — *parte evaluador*. **Incluye el gate de Boolean mínimo** (que el research `§6.1` ancla en capa 2, NO en capa 3).

**Objetivo.** Ejecutar el modelo computacional ANSI (sección 3.1, draft v1.9) directamente sobre el AST de L1, recorriendo la cadena de clases de L2: envío con resolución self/super, `doesNotUnderstand:` con Message reificado, bloques como closures JS que capturan self/temporales con semántica ANSI de aridad→protocolo, y non-local return (`^`) que retorna desde la home activation viva. Es el primer punto donde un fragmento `.st` produce un **valor evaluado**. Deja el **hook de unwind** preparado para que L5 monte el contrato de excepciones sobre la MISMA máquina `try/catch/throw`.

**Alcance — in.**
- Walker del AST: `evalNode(node, ctx)` por familia (literal, variable, assignment, unary/binary/keyword, cascade, return, block, sequence).
- `send(receiver, selector, args)`: lookup por la cadena de clases de L2 desde la clase del receptor real (redispatch dinámico).
- `superSend`: lookup desde la **superclase de la clase que DEFINE el método actual** (estático, tomado del `CompiledMethod` en ejecución).
- `doesNotUnderstand:`: al agotar la cadena, reificar `Message {selector, arguments}` y reenviar; el default (kernel) señala MessageNotUnderstood.
- Activación: `MethodContext` con `self`, args (inmutables), temporales y un `HomeMarker` único (etiqueta de non-local return).
- Bloques como closures: `BlockClosure` captura por **referencia léxica** el contexto encerrante y el `HomeMarker`.
- **Captura de temporales (corrección de over-engineering):** en el MVP, capturar el contexto encerrante **por referencia directa** (un solo objeto de bindings compartido, estilo JsSOM). La mutación compartida es correcta por construcción, **sin tempVector/indirection-vector** ni análisis de captura. El tempVector se **difiere a optimización**.
- Evaluación por aridad: `value`/`value:`/`value:value:`/`value:value:value:`/`valueWithArguments:`; chequeo de aridad (`WrongArgumentCount`).
- `self` dentro del bloque = el de la home activation.
- Non-local return: `^` en método retorna del método; `^` en bloque lanza `NonLocalReturn` etiquetada con el `HomeMarker`; capturada comparando identidad; home muerta → `BlockCannotReturn`.
- **Mecanismo de unwind (`withUnwind`):** el evaluador EXPONE el mecanismo; el **contrato observable de `ensure:`/`ifCurtailed:` como mensajes Smalltalk es gate de L5**, NO de L3.
- Cascadas (`;`): re-envío al receptor de la primera expresión; valor = último mensaje.
- Asignación (incl. `a := b := expr`).
- Auto-promoción SmallInteger→BigInt cuando el resultado sale del rango seguro `±(2^53−1)` (`Number.MAX_SAFE_INTEGER`) en las primitivas aritméticas.
- **Boolean mínimo (gate de capa 2 del research, ubicado aquí):** `ifTrue:ifFalse:`, `and:`, `or:`, `not` sobre `true`/`false`, evaluando bloques con `send value` (sin inlining).
- Tabla de primitivas mínima invocable desde `send`.
- Manejo de receptor `nil` sin caer en `undefined`/`null` de JS.

**Alcance — diferido.**
- Inline cache propia por call-site (L-optim, solo si los benchmarks la piden).
- Compilación de métodos calientes a JS.
- `thisContext`/`MethodContext` reificado accesible desde Smalltalk.
- **Contrato ANSI completo de excepciones** (`on:do:`/`signal`/`retry`/`resume:`/`pass`/`outer`/...): es L5. L3 solo entrega throw/unwind y los hooks.
- **`ensure:`/`ifCurtailed:` como mensajes observables:** su contrato se gatea en L5 (corrección de solapamiento). L3 solo gatea el mecanismo `withUnwind` + non-local return.
- **tempVector/indirection-vector:** diferido a optimización (corrección de over-engineering).
- Optimización de clean blocks; `cannotInterpret:`; `become:`; Process/Semaphore; stack traces/REPL.

**Decisiones clave (con origen).**
- Tree-walking + `send()` explícito vía Map, sin IC — *ingeniería* (corrección y depurabilidad primero).
- super desde la superclase de la clase definidora — *spec-ANSI* (NORMATIVO).
- dNU reifica Message; el default vive en el kernel — *spec-ANSI*.
- Bloques como closures; `self` = home — *spec-ANSI* (Anexo A.3 NORMATIVO).
- **Captura por referencia directa del contexto encerrante (sin tempVector) en el MVP** — *ingeniería/dialecto:Squeak* (patrón JsSOM; corrección de over-engineering).
- Non-local return = objeto JS **plano** etiquetado con `HomeMarker`, lanzado con `throw` (**NO `extends Error`**, sin captura de stack) — *dialecto:Squeak* (JsSOM/SqueakJS).
- **Home muerta → señalar `BlockCannotReturn`** — *ingeniería/desviación* (ANSI declara este caso *undefined*; señalar `BlockCannotReturn` es una **decisión de implementación**, NO contrato ANSI; ver §8.3 y log de desviaciones en L6). El test es binario (verifica la política), pero su origen NO es `spec-ANSI`.
- Máquina compartida con excepciones (L5) vía el mismo unwind — *ingeniería*.
- Auto-promoción a BigInt en overflow — *ingeniería*.
- Cascadas / asignación múltiple — *spec-ANSI* (Anexo A.2).
- **Boolean mínimo sin inlining, gateado en L3** — *spec-ANSI / ingeniería* (es capa 2 del research; un no-Boolean que reciba `ifTrue:` debe hacer dNU, lo que solo se garantiza sin inlining).

**API/estructuras.**
- `interface Evaluator { evaluate(node: ProgramAST, env: GlobalEnv): STObject }`.
- `send(receiver, selector, args)`; `superSend(receiver, selector, args, definingClass)`; `lookupMethod(startClass, selector)`.
- `activate(method, receiver, args)` — crea `MethodContext`, captura `NonLocalReturn` cuyo `home === marker`, marca home dead al salir (en `finally`).
- `evalBlock(closure, args)` — chequea aridad, `self`/home del `outerContext`.
- `reifyMessage(selector, args)` + ruta dNU.
- `class NonLocalReturn { home; value }` — **objeto JS plano, NO `extends Error`** (se lanza con `throw` igual, pero evita el coste de captura de stack trace de V8 en el hot path de cada `^` no-local).
- `withUnwind(action, unwindBlock, kind)` — superficie mínima consumida por L5; unwind en orden inverso.
- `evalNode(node, ctx)` — dispatcher interno.
- Estructuras: `MethodContext { home, receiver, method, args, temps (referencia compartida), definingClass }`; `HomeMarker` (identidad); `BlockClosure { class, outerContext, home, numArgs, node }`; `NonLocalReturn`; `Message { class, selector, arguments }`; registro de `UnwindBlock`.

**Criterios de éxito cuantificados (gates CI binarios).**
- **send/self/super (>=8 positivos):** unario; binario; keyword 1/2/3 args; self redispatch desde método heredado; super salta al método de la superclase (override chain A<B<C: C hace `super m`, ejecuta el de B); cascada; asignación múltiple `a:=b:=expr`; receptor `nil` entiende mensajes de UndefinedObject sin `undefined` JS.
- **doesNotUnderstand: (>=3):** selector inexistente dispara dNU → MessageNotUnderstood; override de `doesNotUnderstand:` recibe Message con selector interned + arguments en orden; el Message reificado responde `selector` y `arguments`.
- **Bloques-closures (>=6):** `value`/`value:`/.../`valueWithArguments:` devuelven la última expresión; bloque vacío → `nil`; aridad incorrecta → `WrongArgumentCount`; `self` en bloque == self de la home; una temporal mutada dentro de un bloque y leída por la home (o por hermano) refleja el valor compartido **por referencia directa**; temporal de solo lectura conserva su valor.
- **Non-local return (>=5):** `^expr` en bloque pasado a `do:`/`detect:` termina el método home; `^` atraviesa múltiples frames hasta la home correcta; con A<B, `^` retorna de la home de B (quien creó el bloque), no de A; un `^` cuya home ya retornó señala `BlockCannotReturn`. **Este último caso verifica una POLÍTICA de implementación sobre comportamiento ANSI-*undefined*, no conformidad ANSI** (origen=ingeniería/desviación, enrutado al log L6 — §8.3). *(Nota: `ensure:`/`ifCurtailed:` ya NO se gatean aquí — pasan a L5.)*
- **Boolean mínimo (gate de capa 2, ubicado en L3):** `ifTrue:ifFalse:`, `and:`, `or:`, `not` sobre `true`/`false` con semántica ANSI; >=8 positivos (incl. perezosidad: el bloque no tomado NO se evalúa, verificado por efecto lateral) + >=1 negativo (un no-Boolean recibe `ifTrue:` → `doesNotUnderstand:`, demostrando ausencia de inlining).
- **Mecanismo de unwind:** `withUnwind` ejecuta el bloque de unwind en orden inverso cuando un `^` no-local atraviesa el frame (verificado a nivel de **mecanismo**, no como contrato de `ensure:`/`ifCurtailed:`).
- **Trazabilidad:** cada caso referencia su sección ANSI / producción del Anexo A (o `origin=ingeniería` + entrada de log para la política de home muerta); el harness emite JUnit XML.
- **Regla de avance:** gate L2 verde antes de mergear L3; gate L3 verde (incl. Boolean mínimo) es prerequisito de L5.

**Artefacto de tests.** Fragmentos host evaluados con el runner Node/Vitest: cada caso es un fragmento `.st` + resultado esperado (igualdad de valor o efecto observable), agrupado por sub-gate (send/self/super, dNU, bloques, non-local return, **Boolean mínimo**). En `tests/eval/` consumiendo corpus `.st` con frontmatter de trazabilidad. Negativos explícitos (aridad incorrecta, home muerta, dNU, no-Boolean `ifTrue:`). Emite JUnit XML. SUnit nativo NO se usa aquí.

**Riesgos.**
- Identidad de home y bloques escapados (mecanismo sutil, alta incertidumbre). *Mitigación:* **spike temprano de non-local return de L3** (Red→Green), simétrico al spike de `resume:` que pide §5.5, antes de construir el resto de L3; marcar dead en `finally` de `activate()` + test de `BlockCannotReturn`.
- Coste/corrección del unwind compartido con L5. *Mitigación:* diseñar `withUnwind()` pensando en `on:do:` de L5; triangular contra GNU Smalltalk.
- Megamorfismo en V8 con `send()` genérico ([UNVERIFIED], sin benchmark): riesgo de PERF, no de corrección. *Mitigación:* `tinyBenchmarks` propios antes de decidir IC.
- Recursión JS profunda (sin TCO en V8). *Mitigación (ver §5.3.1):* bucles (`whileTrue:`/`to:do:`/`repeat`) como special-forms iterativas (O(1) en stack, sin recursión por iteración); recursión Smalltalk genuina no-bucle = límite de stack de V8 aceptado en el MVP, mapeado a un `Error` señalable, con test de estrés informativo (no gate pass/fail); trampoline/CPS diferido a L-optim.
- `thisContext` no reificado: features reflexivas fuera. *Mitigación:* registrar en el log de desviaciones (L6).
- Frontera `nil` Smalltalk vs `undefined`/`null` JS. *Mitigación:* `nil` siempre es la única instancia STObject de UndefinedObject; ningún camino devuelve `undefined`/`null` crudo.

**Dependencias.** L0, L1, L2.

**Esfuerzo.** L.

#### §5.3.1 Control-flow del evaluador: condicionales como envíos, bucles como special-forms iterativas

**Tensión resuelta (cierra §7-VIA-1).** V8 no implementa eliminación de llamadas de cola (TCO): los proper tail calls de ES2015 se implementaron y luego se RETIRARON, y nunca llegaron a Node. Un evaluador tree-walking que use recursión JS por cada `send` desborda el stack si los bucles (`whileTrue:`, `to:do:`, `timesRepeat:`) se evalúan como envíos recursivos a métodos `.st`. A la vez, GATE-L4-NO-INLINING exige que un no-Boolean que reciba `ifTrue:` haga `doesNotUnderstand:`, lo que prohíbe inlinear `ifTrue:`. La resolución separa dos cosas que el plan mezclaba: **(A) despacho de control-flow del evaluador** (legítimo y necesario para no desbordar el stack) y **(B) inlining de métodos / PIC / compile-to-JS arbitrario** (lo que GATE-L4-NO-INLINING prohíbe).

**Relación con el dialecto Squeak/Smalltalk-80 (divergencia consciente, NO alineamiento total).** El compilador de Squeak inlinea a bytecodes de salto un conjunto `MacroSelectors` que incluye —además de los bucles— `ifTrue:`, `ifFalse:`, `ifTrue:ifFalse:`, `ifFalse:ifTrue:`, `and:`, `or:`, `ifNil:`, `ifNotNil:` y `caseOf:`, **solo cuando los argumentos son bloques literales**. pandi-sm inlinea como special-forms **SOLO el subconjunto de BUCLE** de `MacroSelectors` (`whileTrue:`/`whileFalse:`/`whileTrue`/`whileFalse`/`to:do:`/`to:by:do:`/`repeat`). Los condicionales/lógicos (`ifTrue:`/`ifFalse:`/`ifTrue:ifFalse:`/`ifFalse:ifTrue:`/`and:`/`or:`/`not`) —que Squeak SÍ inlinea— se dejan como **envíos reales** por conformidad ANSI (para preservar el `doesNotUnderstand:` de un no-Boolean). Esto es una **divergencia deliberada de Squeak**, no un alineamiento: se registra en el log de desviaciones. (Tampoco se inlinean `ifNil:`/`ifNotNil:`/`caseOf:`: el subconjunto special-form de pandi-sm es BUCLES-solo, sin paridad con `MacroSelectors`.) Lo que SÍ se hereda del Blue Book es la disciplina del *gating por bloque literal* y la propiedad de "sin contexto nuevo por iteración": los bloques de `ifTrue`/`whileTrue` no se generan como objetos-bloque completos cuando son literales sin argumentos, sino compilados en la cabecera sin crear un contexto nuevo.

**Decisión (origen=ingeniería).**

1. **Condicionales y lógicos = ENVÍOS REALES (sin inlining), en L3.** `ifTrue:`, `ifFalse:`, `ifTrue:ifFalse:`, `ifFalse:ifTrue:`, `and:`, `or:`, `not` se evalúan despachando a `True`/`False`/`UndefinedObject` y ejecutando el bloque no-tomado con `send value` (perezosidad real). No hacen bucle → no introducen recursión ilimitada → no hay riesgo de stack overflow. Esto **preserva intacto** el negativo de GATE-L4-NO-INLINING: un no-Boolean que recibe `ifTrue:` cae en `doesNotUnderstand:` porque el evaluador NO reconoce `ifTrue:` como forma especial.

2. **Bucles = SPECIAL-FORMS ITERATIVAS en el evaluador, en L3.** `whileTrue:`, `whileFalse:`, `whileTrue`, `whileFalse`, `to:do:`, `to:by:do:` y `repeat` se reconocen en `evalNode` **únicamente cuando el receptor (en whileX) y los argumentos relevantes son `BlockNode` LITERALES en el AST** (mismo predicado que el gating-por-bloque-literal de Squeak). En ese caso el evaluador ejecuta un `while`/`for` de JS que reusa el frame actual y llama a `evalBlockBody(blockNode, ...)` por iteración **sin crear un `MethodContext`/activación nuevo por vuelta y sin recursión JS por iteración**. El cuerpo respeta non-local return: un `^` dentro del bloque de bucle lanza el `NonLocalReturn` plano de L3 y atraviesa el `while` de JS por el `throw`/`catch` normal (el `while` no lo intercepta).

3. **Fallback a envío real cuando NO hay bloque literal.** Si el receptor/argumento de un selector de bucle NO es un `BlockNode` literal (p.ej. `cond whileTrue: body` con `cond`/`body` en variables, o `aBlock repeat`), el evaluador NO usa la special-form: hace un **envío real** a los métodos `.st` de `BlockClosure` (`whileTrue:`, `whileFalse:`, `repeat`, etc.). Esos métodos `.st` están escritos en términos del `whileTrue:` literal interno y por tanto **también iteran** (no recursan), pero el camino es el mismo despacho dinámico ordinario. Esto preserva la semántica de mensajes de primera clase: `whileTrue:` sigue siendo un selector entendible por `BlockClosure`.

4. **`timesRepeat:` = método `.st` real (NO special-form).** Squeak NO inlinea `timesRepeat:` (está ausente de `MacroSelectors`) y su `.st` canónico se escribe con un `whileTrue:` interno. pandi-sm lo implementa como `Integer>>timesRepeat: aBlock` delegando en `1 to: self do: [:i | aBlock value]`, que SÍ entra por la special-form iterativa de `to:do:`. Resultado: `timesRepeat:` no recursa por iteración pese a no ser forma especial. Difiere tanto de Squeak (no inlinado) como del `.st` canónico del Blue Book (que usa `whileTrue:` interno, no `to:do:`): es una elección de pandi-sm por simplicidad del evaluador, registrada como desviación.

5. **Recursión profunda NO-bucle: límite de stack de V8, aceptado en el MVP.** La recursión Smalltalk genuina (un método que se autoenvía, p.ej. `factorial`/`fib` recursivos) sigue consumiendo un frame JS por envío. Sin TCO en V8, una profundidad suficientemente grande lanza `RangeError: Maximum call stack size exceeded`. **No se resuelve en el MVP** (un trampoline/CPS o un stack explícito de contextos reificados queda diferido a L-optim, junto con compile-to-JS). Se documenta como desviación y se añade un test de estrés que MIDE el umbral aproximado (informativo), sin convertirlo en gate pass/fail sobre una profundidad concreta. Se mapea el `RangeError` de V8 a un error Smalltalk señalable (`Error` con `messageText` 'call stack depth exceeded') capturable con `on:do:` de L5.

**Mecanismo (precisión de implementación).**
- `evalNode(MessageSendNode)`: antes del despacho dinámico, un predicado `tryLoopSpecialForm(node)` comprueba `selector ∈ {whileTrue:, whileFalse:, whileTrue, whileFalse, to:do:, to:by:do:, repeat}` Y que los operandos exigidos sean `BlockNode` literales (whileX: receptor literal y, para `whileTrue:`/`whileFalse:`, arg literal; `to:do:`/`to:by:do:`: el último arg literal). Si encaja, ejecuta el bucle JS; si no, retorna `null` y cae al `send()` normal.
- `to:do:` literal: `for (let i = start; i <= stop; i++) evalBlockBody(bodyBlock, [stIntFor(i)])`; `to:by:do:` ajusta el test según el signo de `by`. `whileTrue:` literal: `while (truthy(evalBlockBody(condBlock,[]))) evalBlockBody(bodyBlock,[])`. `repeat`: `while (true) evalBlockBody(bodyBlock,[])` (la salida es por non-local return o excepción).
- **`truthy(v)` señala, no asume falsy** (cierra el agujero de Booleanidad): la condición de un bucle special-form se evalúa enviando `value` al bloque-condición y comparando el resultado contra los singletons `true`/`false`. Si el resultado es `true` → continúa; si es `false` → termina; si **no es ni `true` ni `false`**, `truthy` lanza el MISMO `doesNotUnderstand:`/`mustBeBoolean` que produciría un `ifTrue:` real sobre un no-Boolean —NO trata cualquier no-`false` como `true`, NO cae en bucle infinito, NO hace un `if (v)` de JS sobre el objeto boxed—. Así la special-form de bucle nunca asume Booleanidad del receptor de condición.
- Los bloques de bucle comparten el `MethodContext`/`HomeMarker` del método que los contiene ("clean/copying blocks" desde el punto de vista del home), igual que en Smalltalk real, por lo que `^` retorna de la home correcta.
- **Margen de stack para el handler de RangeError (punto 5):** al mapear el `RangeError` de V8 a `Error` Smalltalk, el handler de `on:do:` NO se ejecuta inmediatamente sobre el frame que acaba de desbordar (ejecutar más envíos = más frames cerca del límite relanzaría `RangeError` dentro del handler). El mapeo primero desenrolla hasta el frame `on:do:` protector (reduciendo la profundidad) y ejecuta el `handlerBlock` con stack disponible; si la maquinaria de L5 requiere correr el handler antes de desenrollar (modelo condition-system), se trampoliniza la invocación del handler vía `setImmediate`/cola para garantizarle margen de stack. Sin esto, GATE-L3-RECURSION-LIMIT sería flaky.

**Por qué esto NO viola GATE-L4-NO-INLINING.** El gate prohíbe que el evaluador trate `ifTrue:`/Boolean como sintaxis (lo que ocultaría el `doesNotUnderstand:`). Las special-forms de bucle (a) NO incluyen ningún selector Boolean ni `ifTrue:`; (b) solo afectan selectores de bucle de `BlockClosure`/`Integer`; (c) su condición se evalúa por envío de `value` + comparación con singletons, con señalización si no es Boolean. Un no-Boolean nunca recibe trato especial. El gate se reescribe abajo para hacer explícita esta frontera.

**Anclaje de entorno.** Los gates de bucle son O(1) en stack (reusan el frame), por lo que pasan independientemente del `--stack-size`; aun así el test corre en la matriz Node 20 ya fijada en L0. El test de estrés INFORMATIVO de recursión no-bucle SÍ depende del límite de stack por defecto (varía por plataforma/versión): su número NO es comparable entre entornos y NO es criterio de aprobación.

---

### 5.5 L5 — Excepciones (contrato ANSI)

**Mapeo de gate:** gate `§6.1` **capa 4** (excepciones). **Entra ANTES de L4** rompiendo la circularidad declarada.

> **Corrección de etiquetado ANSI:** las versiones previas citaban "§5.5 ANSI" como fuente del contrato de excepciones. Ese número de sección **no aparece en el research** y se elimina. La referencia respaldada es: **[NORMATIVO] — protocolo de excepciones plenamente especificado (research §4 T1)**; el número de sección exacto del draft v1.9 queda marcado **[UNVERIFIED — confirmar contra el draft, candidato §8.5]**. Aplica a todo el alcance, decisiones, criterios y artefacto de tests de L5.

**Objetivo.** Implementar el contrato de excepciones ANSI ejecutable sobre `try/catch/throw` de JS, **reutilizando** la maquinaria de non-local return de L3, pasando el gate cuantificado de la capa 4 de `§6.1` (contrato ANSI + casos negativos, incluido `resume` de no-resumable = *erroneous*) y habilitando el posterior bootstrap de SUnit nativo.

**Alcance — in.**
- Jerarquía núcleo en `.st`/kernel: Exception → Error / Warning / ZeroDivide / MessageNotUnderstood / SystemExceptions, montada sobre L2 (`Object subclass:...`, extensión Pharo/Squeak). MVP mínimo: Exception, Error, Warning, ArithmeticError→ZeroDivide, MessageNotUnderstood.
- Evaluación protegida: `on:do:` (un handler), `on:do:on:do:`, `ExceptionSet` vía coma (`Exception , Exception`).
- Terminación garantizada: `ensure:` (siempre) y `ifCurtailed:` (solo terminación anormal). **Su contrato observable se cierra AQUÍ** (no en L3).
- Señalización: `signal`/`signal:` (clase e instancia); resolución de handler activo recorriendo la pila de frames protegidos.
- Acciones del handler: `return`/`return:`, `retry`, `retryUsing:`, `resume`/`resume:` (solo si resumable), `pass`.
- Consulta de la excepción: `selector`/`messageText`/`description`/`signalerContext` (mínimo) + `isResumable`.
- Acción por defecto: `defaultAction`; Error termina (no resumable); Warning resume con `nil` (resumable).
- Integración con `doesNotUnderstand:` de L3: el default señala MessageNotUnderstood (Error) con el Message reificado.
- Integración numérica: división por cero señala ZeroDivide (ArithmeticError) — **caso de cierre que se valida cuando F2-Number de L4 esté verde**.
- Orden de unwind: `ensure:`/`ifCurtailed:` pendientes en **orden inverso** durante cualquier salida que cruce esos frames (non-local return de L3, `return:`/`retry`/`pass`, excepción que escapa). **Una sola maquinaria compartida** L3↔L5.
- Tests de capa 4 (host Node/Vitest) cubriendo positivos por selector + negativos; emisión JUnit XML.

**Alcance — diferido.**
- `outer` (la pieza más sutil; `pass` cubre el 80%).
- `resignalAs:` (no está en el gate).
- `isNested`/nested handling y `selectorValue`/`argument` completos.
- `signalOn:...` y la familia SystemExceptions completa (crece con L4).
- Reificación de `thisContext`/Context navegable (`signalerContext` opaco/implementation-defined en MVP).
- ExceptionSet con subsunción avanzada más allá de la coma binaria.
- Cadenas de causa al estilo moderno (no ANSI).
- Handler de Warning interactivo (UI/REPL).
- SUnit nativo (lo habilita L5, se construye después).

**Decisiones clave (con origen).**
- Conjunto de mensajes = exactamente el gate `§6.1` capa 4 — *spec-ANSI* ([NORMATIVO] §4 T1; sección exacta [UNVERIFIED]).
- Sobre `try/catch/throw` reutilizando el unwind de L3 — *ingeniería* (una sola maquinaria).
- **Ejecutar el handlerBlock ANTES de desenrollar** (condition-system ANSI), no después — *spec-ANSI* (es lo que hace posible `resume`/`resume:`; la decisión más delicada de L5).
- **Reducir a 2 mecanismos de control-flow excepcional (corrección de over-engineering):** las acciones del handler (`return:`/`retry`/`resume:`/`pass`) se resuelven como **valores de retorno** del handlerBlock interpretados por el frame `on:do:` (usando el tipo `HandlerAction` como return value), **NO como un tercer throw** (`HandlerActionSignal`). Se reserva `throw` solo para `NonLocalReturn` (L3) y `SignalException` (propagación real). *— ingeniería.*
- **`resume`/`resume:` sobre no-resumable → señalar un Error concreto** — *ingeniería/desviación* (ANSI declara este caso *erroneous* = comportamiento indefinido; convertirlo en aserción de igualdad sobre un Error concreto es una **decisión de implementación sobre comportamiento *erroneous***, NO contrato ANSI puro, por la misma disciplina de §8.3 aplicada a la home muerta de L3). El test es binario (verifica la política), pero su origen NO es `spec-ANSI`; se enruta al log de desviaciones (L6). El research §6.1 sí lista este caso como negativo *erroneous*; lo que se corrige es su **etiqueta de origen**, no su inclusión.
- `defaultAction` por clase (Error termina, Warning resume `nil`) — *spec-ANSI*.
- Jerarquía vía `Object subclass:...` (no `Class named:...`) — *dialecto:Pharo* (ANSI manda el protocolo, no las clases).
- ExceptionSet vía coma binaria — *spec-ANSI*.
- `signalerContext` opaco/implementation-defined en MVP — *ingeniería* (Context reificado diferido; registrado en log de desviaciones; NO se asevera igualdad sobre él).
- MessageNotUnderstood integrada con dNU de L3 — *spec-ANSI* (cierra el lazo L3↔L5).

**API/estructuras.**
- Kernel `.st`: `BlockClosure>>on:do:`, `on:do:on:do:`, `ensure:`, `ifCurtailed:`; `Exception class>>signal`/`signal:`; `Exception>>signal`/`signal:`/`messageText`/`description`/`selector`/`isResumable`/`signalerContext`; `Exception>>return`/`return:`/`retry`/`retryUsing:`/`resume`/`resume:`/`pass`; `Exception>>defaultAction`; `Exception class>>','`.
- Internas JS: `class SignalException { st: STObject }` — **objeto JS plano, NO `extends Error`** (igual que `NonLocalReturn`: evita la captura de stack en cada `signal`); `interface HandlerContext { exceptionClass; handlerBlock; protectedBlock; marker; active }`; `signal(interp, stException)` (recorre la pila, ejecuta el handler **sobre el stack del signal vivo** y interpreta su `HandlerAction` como valor de retorno); `runProtected(interp, protectedBlock, handlers)`; `unwindTo(interp, targetMarker, curtailed)` **compartida con L3**.
- `HandlerAction` = unión etiquetada `{ kind:'return'|'retry'|'retryUsing'|'resume'|'pass'|'fallOff'; ... }` usada como **valor de retorno** (no como throw).
- `ExceptionSet { elements: STClass[] }` con `handles:`.

**Criterios de éxito cuantificados (gates CI binarios).**
- **Gate capa 4 VERDE en CI:** los **12 selectores** ejecutan con semántica ANSI (>=1 positivo cada uno). Lista exacta y exhaustiva (conteo `=== 12`, coincide con research §6.1 línea 797): `on:do:` `ensure:` `ifCurtailed:` `signal` `signal:` `return` `return:` `retry` `retryUsing:` `resume` `resume:` `pass`. *(`on:do:on:do:` y `ExceptionSet ,` son superficie del gate pero NO cuentan como selectores núcleo del conteo de 12; se cubren en los positivos.)*
- **Positivos >=20:** (1) `on:do:` captura tipo exacto; (2) captura subtipo (`isKindOf:`); (3) NO captura tipo no relacionado; (4) ExceptionSet captura ambos; (5) `return: v` devuelve `v`; (6) `return == return: nil`; (7) handler que cae normalmente devuelve el valor del bloque (`fallOff == return:`); (8) `retry` re-evalúa y tiene éxito a la 2a; (9) `retryUsing:` reemplaza el protegido; (10) `resume: v` hace que `signal` devuelva `v` y el bloque continúe (Warning); (11) `resume == resume: nil`; (12) `pass` delega al handler externo del mismo tipo; (13) `signal:` fija `messageText` recuperable; (14) `ensure:` corre en retorno normal; (15) `ensure:` corre cuando una excepción escapa; (16) `ensure:` corre durante non-local return de L3; (17) `ifCurtailed:` NO corre en retorno normal; (18) `ifCurtailed:` corre en salida anormal; (19) `Warning>>signal` sin handler resume `nil` (`defaultAction`); (20) MessageNotUnderstood capturable con `on: MessageNotUnderstood do:`.
- **Negativos >=6** (rechazo definido, estilo `assert_invalid`): (1) `resume` de Error (no resumable) señala un Error concreto **— verifica la POLÍTICA elegida sobre comportamiento ANSI-*erroneous*, origen=ingeniería/desviación, enrutado al log L6 (§8.3); NO es aserción de conformidad ANSI**; (2) `resume:` sobre Exception base (no resumable por defecto) señala un Error concreto **— misma política, mismo origen=ingeniería/desviación**; (3) `return`/`retry`/`resume` fuera de un handler activo = error; (4) `signal` de Error sin handler propaga al top-level; (5) `pass` sin handler externo → `defaultAction`; (6) **orden de unwind:** anidamiento `ensure:[a] ensure:[b]` con `signal` que escapa ejecuta **b antes que a** (orden inverso), verificado por traza.
- **Cierre de integración (Integer):** división por cero entera señala ZeroDivide capturable por `on: ZeroDivide do:` y por `on: ArithmeticError do:` (subtipo). *(El caso completo Integer+Float se cierra en F2 — `Float/0` señala ZeroDivide de forma uniforme, decisión fijada en §8.2.)*
- **Trazabilidad:** cada test referencia su origen ([NORMATIVO] §4 T1 / selector para los positivos de protocolo; `origin=ingeniería` + entrada de log para los negativos #1/#2 de `resume`); las desviaciones (`signalerContext` implementation-defined, jerarquía Error/Warning de-facto, política `resume` de no-resumable) registradas en el log de desviaciones (L6).
- CI emite JUnit XML; regla de avance: gate L5 verde antes de bootstrapear SUnit nativo.

**Artefacto de tests.** Fragmentos `.st` evaluados por el harness host en Node/Vitest (mismo runner que L2/L3), agrupados por selector y por categoría positivo/negativo. Negativos modelados como `assert_invalid`/`assert_trap` (error definido, no crash). Emite JUnit XML. NO usa SUnit nativo (lo habilita). Trazabilidad por frontmatter al selector ANSI ([NORMATIVO] §4 T1), salvo los negativos de política (`origin=ingeniería`).

**Riesgos.**
- Modelo de ejecución del handler (correr handlerBlock antes de desenrollar) es la pieza más sutil; al estilo Java/JS `resume:` se vuelve imposible. *Mitigación:* tests de `resume:` tempranos (Red→Green) + spike que valide `resume:` antes de construir el resto.
- Maquinaria de unwind compartida L3↔L5 acopla las capas. *Mitigación:* tests 14–18 + negativo de orden inverso ejercitan ambas rutas.
- `pass`+`outer`: `outer` diferido, pero patrones de `pass` real pueden empujar a necesitarlo. *Mitigación:* si un caso del gate lo exige, promoverlo; el gate `§6.1` NO lista `outer`.
- `signalerContext` sin Context reificado. *Mitigación:* documentar como implementation-defined; sin aserciones de igualdad sobre el contexto.
- **Float/0 (decisión fijada, ver §8.2):** `Float/0` da `Infinity` en JS; el plan **señala ZeroDivide** de forma uniforme. *Mitigación:* primitiva de `Float>>/` chequea divisor cero antes de delegar a JS y señala ZeroDivide; el cierre cubre Integer Y Float de forma determinista; divergencia de IEEE registrada como desviación.
- Megamorfismo/perf de la pila de handlers ([UNVERIFIED]). *Mitigación:* `handlerStack` simple; anotar para `tinyBenchmarks`.

**Dependencias.** L1, L2, L3. (L4 solo para el caso de cierre ZeroDivide; la máquina de excepciones NO depende de L4.)

**Esfuerzo.** L.

#### §5.5.1 Mecanismo de excepciones resumables (precisión de implementación)

> **Origen y verificación.** Esta subsección hace *cristalino* el mecanismo ya decidido en §5.5 (no lo reinventa) y lo verifica contra fuentes primarias. La tesis central —**el handler corre ANTES de desenrollar**— es exactamente el modelo de dos fases del *condition system* de Common Lisp (`handler-bind`) y del modelo de excepciones de Pharo/Squeak/GNU Smalltalk. Fuentes citadas al final. Etiquetas de origen consistentes con §5.5: *spec-ANSI* lo que el research §4 T1 [NORMATIVO] respalda; *ingeniería* las decisiones de implementación.

##### A. El invariante: dos fases, una sola pila JS viva

El error clásico (modelo Java/JS/`handler-case`) es: `signal` hace `throw` → la pila se desenrolla hasta el `catch` → recién ahí corre el handler. Con ese orden **`resume:` es imposible**, porque el frame del `signal` ya murió y no hay punto al que volver. pandi-sm —como el `condition system`— invierte el orden:

- **Fase 1 (handler sobre la pila viva, SIN throw):** `signal()` *busca* el handler activo en una pila explícita y lo *invoca como una llamada de función JS normal*, **encima** del frame del `signal` que sigue vivo. El handler decide qué hacer y lo comunica como **valor de retorno** (`HandlerAction`), nunca como un tercer `throw`.
- **Fase 2 (desenrollado, solo si hace falta, vía throw):** únicamente cuando el `HandlerAction` es `return:`/`retry`/`retryUsing:`/`fallOff` se necesita salir del frame del `signal` hacia el `on:do:`. Ahí —y solo ahí— se hace `throw` de un objeto `Unwind` plano con el `marker` del `on:do:`, reutilizando `unwindTo()` de L3 (la misma maquinaria del non-local return). `resume:` y `pass` NO desenrollan en fase 2.

Esto coincide literalmente con Common Lisp: *"the handler function bound by HANDLER-BIND will be run without unwinding the stack — the flow of control will still be in the call to parse-log-entry when this function is called"* (gigamonkeys, cap. 19). De ahí se sigue (paráfrasis propia, no cita) que los restarts desenrollan **solo lo necesario** para ejecutarse. Y con Pharo: `resume:` *"Resume the execution of the protected block just after the call to #signal"* (pharo-wiki).

##### B. Por qué `signal()` puede correr el handler SIN `throw` (el punto que pedía aclararse)

En JS un `throw` desenrolla; por eso `signal()` **no usa `throw`** para llegar al handler. El handler ya está registrado en una estructura de datos en el *heap* (la `handlerStack`), independiente de la pila de llamadas JS. `signal()`:

1. recorre `handlerStack` de tope a base buscando el primer `HandlerContext` con `active===true` cuyo `exceptionClass.handles(stException)` sea verdadero;
2. lo marca `active=false` ("handler disabled while running"): en Squeak/Pharo el `ExceptionHandler` queda deshabilitado durante la ejecución de su propio handler block (fuente concreta, no inferencia: pharo-wiki — General/Exceptions), de modo que un `signal` re-entrante salta ese handler y busca el siguiente más externo;
3. **llama** `handlerBlock.value(stException)` a través del evaluador, como una llamada ordinaria. Esa llamada empila frames JS *por encima* del frame de `signal()`, que **permanece vivo en la pila** todo el tiempo;
4. inspecciona el `HandlerAction` que devuelve el handler y actúa.

Clave: el frame de `signal()` está vivo porque nunca lo abandonamos —solo hicimos una sub-llamada y volvimos—. Esto es exactamente "the flow of control will still be in the call to the signaler" del condition system. Evidencia primaria directa en Smalltalk: GNU Smalltalk lo enuncia sin ambigüedad —*"when a handler is invoked, the stack is not unwound"*— y razona que *"the #resume: feature does not make sense if the stack is unwound"* (su ejemplo `n := 42` / `n := 24` muestra que el valor del `signal` se decide tras volver del handler, con la pila intacta).

```text
unwindStack JS en fase 1 (mientras corre el handler):
   ... → on:do: → protectedBlock → ... → método que envía signal → signal() → handlerBlock(...)
                                                                     ^^^^^^^^  ← VIVO; aquí volveremos
```

##### C. Las cinco acciones, mecánicamente

Sea `HandlerAction = { kind:'return'|'retry'|'retryUsing'|'resume'|'pass'|'fallOff'; value?; block? }` (§5.5 ya lo fija como valor de retorno). En `signal()`, tras `const action = runHandler(hc, stException)`:

- **`resume:` / `resume`** → `action.kind==='resume'`. `signal()` simplemente **`return action.value`** a su llamador. Como el frame de `signal()` está vivo (B), ese `return` entrega el valor *en el punto exacto del envío de `signal`* y la ejecución del bloque protegido continúa. **Cero `throw`, cero unwind.** Antes de retornar, `signal()` re-activa el `HandlerContext` (`active=true`) para que siga vigente durante la continuación —complemento de la invariante "handler disabled while running" de Squeak/Pharo (el `ExceptionHandler` está deshabilitado solo *mientras* corre su block; fuente concreta: pharo-wiki — General/Exceptions, no inferencia)—. Confirmado por GNU Smalltalk: `resume:` *"answers the argument from the #signal send"*; y Pharo: *"The call to #signal is worth nil/aValue"*. **Guarda de resumabilidad:** si `!stException.isResumable`, `resume`/`resume:` es ANSI-*erroneous*; §5.5 ya fija la política (señalar un Error concreto, origen=ingeniería, log L6) — esa señalización ocurre *dentro de la ejecución del handler*, no en `signal()`.

- **`return:` / `return` / `fallOff`** → `action.kind` ∈ {`return`,`fallOff`}. `fallOff` (el handler termina normalmente sin invocar acción) es **idéntico** a `return:` con el valor del último envío del handler (positivo #7 del gate; en Pharo es el comportamiento por defecto). Aquí SÍ hay que abandonar el frame de `signal` y todo lo que hay entre él y el `on:do:`. `signal()` hace **`throw new Unwind(hc.marker, action.value, /*curtailed*/true)`** —objeto plano, mismo tipo de marca que el `NonLocalReturn` de L3—. `unwindTo()` (compartida con L3) lo propaga corriendo los `ensure:`/`ifCurtailed:` intermedios en orden inverso; el frame de `on:do:` reconoce `unwind.marker === miMarker` y **devuelve `unwind.value`** como valor de la expresión `protected on: E do: H`. Pharo: *"the execution continues as if the protected block has returned that value"* / GNU: *"exit the block that received #on:do:"*.

- **`retry`** → `action.kind==='retry'`. Igual que `return:` en cuanto a unwind (se hace `throw Unwind(marker,...)` hacia el `on:do:`), pero el `on:do:` —al recibir un `Unwind` etiquetado como retry— **re-evalúa el `protectedBlock` desde cero** bajo el mismo `HandlerContext` (re-activado), en lugar de devolver un valor. No crece la pila (GNU: `retry` *"does not increase the stack height"*). `retryUsing: b` es idéntico pero sustituyendo `protectedBlock` por `b`.

- **`pass`** → `action.kind==='pass'`. `signal()` **NO desenrolla ni retorna**: continúa el bucle del paso (1) buscando el **siguiente** `HandlerContext` activo más externo del mismo tipo, y le aplica de nuevo (2)-(4). Esto es literalmente el "decline" del condition system: *"the function can decline... by simply returning normally, in which case control returns to the SIGNAL function, which will search for the next most recently established handler"* (gigamonkeys). Pharo: *"Skip the current handler and keep looking"*. Si no hay más handlers → `defaultAction` (Error termina propagando al top-level; Warning hace `resume: nil`).

##### D. `ensure:` / `ifCurtailed:`: la misma maquinaria de unwind (fase 2)

`ensure:` e `ifCurtailed:` registran un `UnwindBlock` en la misma estructura que usa `unwindTo()`. Cualquier salida que cruce esos frames —`NonLocalReturn` de L3, `Unwind` de `return:`/`retry`, o una `SignalException` que escapa sin handler— pasa por `unwindTo()`, que ejecuta los `UnwindBlock` pendientes **en orden inverso** (más interno primero) antes de ceder el control al destino. `ensure:` corre siempre (también en retorno normal, vía el `finally` de su propio frame); `ifCurtailed:` corre **solo** si la salida es anormal (`curtailed===true`). Negativo #6 del gate, con el anidamiento canónico explícito `[[E signal] ensure: [trace add: #a]] ensure: [trace add: #b]` y una salida que cruza ambos frames ⇒ el `ensure:` **más interno** (`#a`) corre primero, traza `#(#a #b)`, verifica exactamente esto. Pharo: `ensure:` *"no matter what"*; `ifCurtailed:` *"only if the receiver block signals an exception"*. **Punto fino:** `resume:` y `pass` NO disparan `unwindTo()` (no cruzan frames hacia afuera), por lo que `ensure:`/`ifCurtailed:` **no** corren en un `resume:` exitoso — correcto y deseado.

##### E. Por qué objetos PLANOS, no `extends Error` (ya fijado, V8-2)

`SignalException` y `Unwind`/`NonLocalReturn` son objetos JS planos (no extienden `Error`) para **evitar la captura de stack trace de V8** en el hot path: cada `^` no-local y cada `signal`/`return:`/`retry` haría un `throw`, y construir un `Error` captura el stack (coste O(profundidad), caro). Como aquí el `throw` es puro control de flujo (no diagnóstico), el stack trace JS es ruido. Esto es la práctica de SqueakJS/JsSOM para non-local return, generalizada. Nota de coherencia: el objeto Smalltalk de excepción (`stException`, instancia de la jerarquía `Exception` en `.st`) es independiente del envoltorio JS `SignalException{ st }`; solo el envoltorio de control-flow es plano.

##### F. Interacción con la marca de stack del `RangeError` de §5.3.1

§5.3.1 punto 5 mapea el `RangeError: Maximum call stack size exceeded` de V8 a un `Error` Smalltalk señalable. La interacción crítica con §5.5.1 es: **el handler de §5.5.1 corre sobre la pila viva (fase 1)**, pero en el caso del `RangeError` la pila viva está *exactamente en el límite* — correr el `handlerBlock` ahí (que envía más mensajes) relanzaría `RangeError` dentro del handler. La solución, **única estrategia adoptada**, es un **trampolín SÍNCRONO**: desenrollar hasta el `on:do:` protector (ganando margen de stack) y **re-invocar el handler en un frame somero**, manteniendo `on:do:` **síncrono** (su retorno sigue siendo síncrono; no se difiere la continuación). Se descarta explícitamente cualquier `setImmediate`/cola: volvería **asíncrona** la continuación y rompería el contrato de retorno síncrono de `on:do:`. Esto es una **excepción consciente al invariante "handler antes de unwind"**, justificada y acotada al mapeo de `RangeError` (no aplica a `signal` ordinario). **Consecuencia directa:** como se desenrolla hasta el `on:do:` para ganar margen de stack, el punto del `signal` ya no existe; por tanto el `Error` mapeado de `RangeError` es **no-resumable de facto** (`resume:` no está garantizado y no se ofrece). Documentar como desviación.

##### G. Pseudocódigo de referencia (precisión, no normativo)

```js
// objetos PLANOS de control-flow (NO extends Error)
class SignalException { constructor(st){ this.st = st; } }   // se construye, rara vez se throwea
class Unwind { constructor(marker, value, curtailed, retry=false, retryBlock=null){
  this.marker=marker; this.value=value; this.curtailed=curtailed; this.retry=retry; this.retryBlock=retryBlock; } }

// pila explícita en el heap, NO la pila JS
interp.handlerStack = [];   // [{ exceptionClass, handlerBlock, marker, protectedBlock, active }]

function signal(interp, stException) {
  let i = interp.handlerStack.length - 1;
  while (i >= 0) {
    const hc = interp.handlerStack[i];
    if (hc.active && hc.exceptionClass.handles(stException)) {
      hc.active = false;                                  // handler deshabilitado mientras corre (Squeak/Pharo: ExceptionHandler disabled durante su propio block)
      bindHandlerSlots(stException, hc);                  // signalerContext (opaco), handlerContext
      const action = interp.callBlock(hc.handlerBlock, [stException]); // FASE 1: llamada normal, SIN throw
      switch (action.kind) {
        case 'resume':                                    // (b) sin unwind: el frame de signal vive
          hc.active = true;                               // sigue vigente para la continuación
          return action.value;                            // RETORNA al punto del signal
        case 'pass':                                      // delega: NO unwind, NO return; busca siguiente
          hc.active = true; i--; continue;                // (re-habilitar discutible; ver gate G5)
        case 'return': case 'fallOff':                    // (c) FASE 2: throw hacia on:do:
          throw new Unwind(hc.marker, action.value, /*curtailed*/true);
        case 'retry':
          throw new Unwind(hc.marker, undefined, true, /*retry*/true, hc.protectedBlock);
        case 'retryUsing':
          throw new Unwind(hc.marker, undefined, true, true, action.block);
      }
    }
    i--;
  }
  return defaultAction(interp, stException);              // Error: propaga top-level; Warning: resume nil
}

function runProtected(interp, protectedBlock, handlers) { // BlockClosure>>on:do: (y on:do:on:do:)
  const marker = new Marker();
  for (const h of handlers) interp.handlerStack.push({ ...h, marker, protectedBlock, active:true });
  const depth0 = interp.handlerStack.length - handlers.length; // capturado TRAS el push; = base de la pila
  // invariante de propiedad: este on:do: posee exactamente [depth0 .. depth0+handlers.length)
  let blockToRun = protectedBlock;
  for (;;) {                                              // bucle para soportar retry sin recursión
    try {
      const v = interp.callBlock(blockToRun, []);
      return v;                                           // fallOff/retorno normal del protegido
    } catch (e) {
      if (e instanceof Unwind && e.marker === marker) {   // dirigido a ESTE on:do:
        if (e.retry) {                                    // retry/retryUsing:
          blockToRun = e.retryBlock;
          // un signal re-entrante durante fase 1 NO debe dejar entradas por encima de las nuestras:
          interp.handlerStack.length = depth0 + handlers.length;       // restaurar longitud exacta
          assert(interp.handlerStack.length === depth0 + handlers.length);
          reactivate(interp, depth0);                     // re-activar SOLO nuestros handlers
          continue;
        }
        return e.value;                                   // return:/return/fallOff
      }
      throw e;                                            // NonLocalReturn de L3 u otro Unwind: sigue subiendo
    } finally {
      interp.handlerStack.length = depth0;                // pop SIEMPRE (incl. resume que ya retornó)
    }
  }
}

// unwindTo(): COMPARTIDA con L3. Propaga NonLocalReturn/Unwind corriendo ensure:/ifCurtailed:
// pendientes en ORDEN INVERSO; ifCurtailed solo si curtailed===true; ensure siempre.
```

> **Sutileza a corregir en el `finally`:** el `finally` que hace `pop` de la `handlerStack` debe ejecutarse al salir de `runProtected`, pero **no** durante un `resume:` (que retorna *desde `signal()`*, dentro del `protectedBlock`, sin salir de `runProtected`). El esquema de arriba es correcto porque `resume:` retorna a `signal()` → al cuerpo del bloque protegido → este sigue corriendo *dentro* del `try`; el `finally` solo dispara cuando el `protectedBlock` finalmente retorna o un `Unwind` lo abandona. Verificarlo con el positivo #10 (resume continúa el bloque).

##### H. Comparación explícita

| Aspecto | Common Lisp (condition system) | SqueakJS / Squeak-Pharo | pandi-sm §5.5.1 |
|---|---|---|---|
| ¿Handler antes de unwind? | Sí (`handler-bind`); `handler-case` desenrolla antes | Sí: el handler corre sobre el contexto del `signal` vivo | **Sí** (fase 1, llamada normal sobre frame de `signal` vivo) |
| Mecanismo para llegar al handler | `signal` busca handler dinámico y lo *llama* | `signal` busca `HandlerContext` en la pila de contextos y lo activa | `signal()` recorre `handlerStack` (heap) y **llama** `handlerBlock` |
| `resume:` | Restart `use-value`/`continue`: vuelve al punto del restart | `resume:` "answers the #signal send" sin unwind | `signal()` **`return value`** (frame vivo); sin throw |
| `return:` | "non-local exit" del handler-case / `return-from` | Unwind hasta el `on:do:` | `throw Unwind(marker,value)` → `unwindTo()` L3 → `on:do:` devuelve |
| Declinar / `pass` | Handler retorna normalmente → SIGNAL busca el siguiente | `pass` reactiva búsqueda al handler externo | `HandlerAction{kind:'pass'}` → bucle de `signal()` sigue al siguiente |
| Unwind solo lo necesario | Sí (la pila se desenrolla solo hasta el restart) | Sí | Sí (`resume:`/`pass` no desenrollan; `return:`/`retry` solo hasta el `marker`) |
| Objeto de control-flow | (interno VM) | non-local return ligero (sin coste de traza) | objetos **planos** `Unwind`/`SignalException` (no `extends Error`) |
| `ensure:`/unwind-protect | `unwind-protect` corre en todo unwind | `ensure:`/`ifCurtailed:` vía la misma maquinaria de unwind | misma `unwindTo()` compartida L3↔L5, orden inverso |

Divergencias deliberadas de pandi-sm (todas registrables en log L6): (1) las acciones del handler son **valores de retorno** (`HandlerAction`), no un tercer `throw` — simplificación de ingeniería; Pharo/Squeak las implementan como envíos al objeto excepción que ejecutan non-local exits internamente. (2) `signalerContext` **opaco** (Context no reificado en MVP) — Squeak/Pharo lo exponen navegable. (3) `RangeError`→`Error` rompe el invariante "handler antes de unwind" por necesidad de margen de stack (§5.3.1 F).

##### I. Puntos del plan §5.5 que quedan ambiguos o que conviene precisar (correcciones)

1. **[AMBIGÜEDAD — `pass` y re-activación del handler]** §5.5 dice "`pass` delega al siguiente handler" pero no fija si el handler que hizo `pass` queda *reactivado* (vuelve a ser elegible) tras delegar. La regla, sustentada en la invariante concreta "handler disabled while running" de Squeak/Pharo (el `ExceptionHandler` está deshabilitado durante su propio block; fuente: pharo-wiki — General/Exceptions, no inferencia): un handler que pasó **no** se re-elige para *esta* señal mientras el handler externo corre, pero sí queda restaurado para señales futuras. El pseudocódigo de arriba reactiva (`hc.active=true; i--`); debe documentarse que la reactivación es para *señales futuras* y que el descenso `i--` impide reentrada en *esta* señal. **Corrección:** declarar explícitamente la política y cubrirla con un positivo dedicado (no solo el #12), tal como hace GATE-L5-PASS-CHAIN con sus dos aserciones (no-reentrada en esta señal + reelegibilidad futura).

2. **[PRECISIÓN — `signal` re-entrante]** §5.5 no menciona qué pasa si el `handlerBlock` (fase 1) envía otro `signal`. Debe quedar fijado: como el `HandlerContext` actual está `active=false`, un `signal` re-entrante salta ese handler y busca uno más externo (igual que Pharo). Sin este invariante, un handler que loguea-y-pasa puede entrar en bucle.

3. **[CORRECCIÓN — `resume:` y `ensure:`/`ifCurtailed:`]** §5.5 lista `ensure:` "siempre" (alcance-in) pero el invariante correcto es: `ensure:` corre cuando su frame se *abandona* (retorno normal o unwind), **no** durante un `resume:` que continúa dentro de él. El positivo #14 ("ensure corre en retorno normal") y #10 ("resume continúa") juntos deben demostrar que un `resume:` que ocurre *dentro* de un `[...] ensure: [...]` no dispara el `ensure:` prematuramente. Añadir como sub-aserción.

4. **[CONFIRMACIÓN — `fallOff == return:`]** El positivo #7 ya lo fija; el pseudocódigo lo trata uniendo `case 'return': case 'fallOff'`. Correcto y alineado con Pharo. Sin cambio, solo verificar que `callBlock(handlerBlock)` que termina normal produce `HandlerAction{kind:'fallOff', value: <último envío>}`.

5. **[AMBIGÜEDAD — `defaultAction` de Warning vs `resume:`]** §5.5 dice "Warning resume con nil (resumable)". Debe precisarse que `defaultAction` de Warning hace `self resume: nil`, lo que en este modelo equivale a que `signal()` **retorne `nil`** al punto del señalamiento (no a un `throw`), idéntico a un `resume:` de handler. Coherente con el flujo (b).

##### J. Gates binarios que el plan debe añadir (sobre los ya listados en §5.5)

- **GATE-L5-RESUME-NO-UNWIND** (corona el spike de `resume:` que §5.5 ya pide): un `[... x := E signal. x + 1] on: E do: [:e | e resume: 10]` evalúa a `11` **y** una traza/contador demuestra que el frame del `signal` **nunca se abandonó** (p.ej., una variable temporal escrita *antes* y *después* del `signal` conserva continuidad; o un `ensure:` interno que NO corrió durante el resume). Binario: pasa solo si valor`===11` y `ensureRan===false`.
- **GATE-L5-RETURN-IS-UNWIND**: `[... E signal. self error: 'inalcanzable'] on: E do: [:e | e return: 42]` evalúa a `42` **y** la línea posterior al `signal` no se ejecutó (centinela). Binario.
- **GATE-L5-PASS-CHAIN**: handler interno `pass` + handler externo del mismo tipo. **Dos aserciones binarias separadas:** (i) **no-reentrada en ESTA señal** — con el externo haciendo `e return:`, un centinela de invocación del handler interno vale exactamente `1` (el `pass` NO se lo vuelve a entregar); (ii) **reelegibilidad para señales futuras** — con el externo haciendo `e resume:`, una **nueva** señal del mismo tipo emitida después por el `protectedBlock` SÍ es elegible por el handler interno (su centinela pasa a `2`). Pasa solo si ambas se cumplen. Binario.
- **GATE-L5-REENTRANT-SIGNAL**: un handler que vuelve a hacer `signal` de la misma clase es atendido por el handler externo, **no** por sí mismo (no-bucle). Binario: termina y produce el valor del externo.
- **GATE-L5-UNWIND-ORDER** (refuerza el negativo #6, lo hace gate propio): anidamiento canónico fijo `[[E signal] ensure: [trace add: #a]] ensure: [trace add: #b]` con un handler que hace `e return: <v>` (un `Unwind` cruza ambos `ensure:`). El `ensure:` **más interno** (`#a`) corre primero. Aserción binaria: `trace = #(#a #b)`. Misma convención de anidamiento que el negativo #6 de §5.5 (más-interno-primero), de modo que el orden es inequívoco. Binario.
- **GATE-L5-RANGEERROR-NONRESUMABLE** (cierra §5.3.1 F): el `Error` sintetizado del `RangeError` es capturable por `on: Error do:` y `e isResumable` es `false`; intentar `e resume:` señala la política de no-resumable (§5.5 negativo #1). Binario.

> Verificado contra: Common Lisp condition system — *handler-bind* corre sin desenrollar (cita literal verificada) y declinar = retornar; de ello inferimos (paráfrasis propia, no cita textual de la fuente) que los restarts desenrollan solo lo necesario; Pharo, GNU Smalltalk y Squeak — `resume:` vuelve al punto del `#signal`, el handler corre con la pila **sin** desenrollar, `return:` sale del `on:do:`, `pass` sigue buscando, `ensure:`/`ifCurtailed:`; SqueakJS — objetos de control-flow ligeros sin captura de traza. El diseño de §5.5 es **correcto y coherente** con ese cuerpo de fuentes; las correcciones I-1..I-5 y los gates J son refinamientos de precisión, no cambios de fondo.
>
> Fuentes:
> - Common Lisp condition system / handler-bind vs handler-case / restarts: [gigamonkeys, *Practical Common Lisp*, cap. 19](https://gigamonkeys.com/book/beyond-exception-handling-conditions-and-restarts.html); [CL Cookbook — Error handling](https://lispcookbook.github.io/cl-cookbook/error_handling.html); [Wikibooks — Condition System](https://en.wikibooks.org/wiki/Common_Lisp/Advanced_topics/Condition_System)
> - Pharo: [pharo-wiki — General/Exceptions](https://github.com/pharo-open-documentation/pharo-wiki/blob/master/General/Exceptions.md); [RMoD MOOC — Powerful Exceptions](https://rmod-pharo-mooc.lille.inria.fr/Old/MOOC_P5-Slides/Week5/C019-W5S04-Exceptions.html)
> - Squeak/Pharo — "handler disabled while running": el `ExceptionHandler` (clase `BlockClosure>>on:do:` / `MethodContext`) queda **deshabilitado durante la ejecución de su propio handler block**, de modo que un `signal` re-entrante salta ese handler y busca el siguiente más externo (fuente concreta, no inferencia): [pharo-wiki — General/Exceptions](https://github.com/pharo-open-documentation/pharo-wiki/blob/master/General/Exceptions.md) (sección sobre `pass`/`outer`/re-señalamiento)
> - GNU Smalltalk — Handling exceptions (`resume:` "answers the #signal send", `return:`, `retry` sin crecer stack): [gnu.org](https://www.gnu.org/software/smalltalk/manual/html_node/Handling-exceptions.html)
> - GNU Smalltalk — Handler stack unwinding caveat (evidencia directa del invariante "handler antes de unwind": *"when a handler is invoked, the stack is not unwound"*; *"the #resume: feature does not make sense if the stack is unwound"*; ejemplo `n:=42`/`n:=24`): [gnu.org](https://www.gnu.org/software/smalltalk/manual/html_node/Handler-stack-unwinding-caveat.html)
> - SqueakJS (objetos de control-flow ligeros, contextos/unwind): [codefrau/SqueakJS](https://github.com/codefrau/SqueakJS); [Cog — Context & BlockClosure](https://clementbera.wordpress.com/2015/01/21/context-and-blockclosure-implementation/)

---

### 5.4 L4 — Biblioteca base / kernel (familias de conformidad F1..F6)

**Mapeo de gate:** gate `§6.1` **capa 3** (biblioteca base). **Entra DESPUÉS de L5** (su precondición es L5-core verde).

> **Corrección de etiquetado ANSI:** el research `§6.1` ubica **Boolean mínimo (`ifTrue:ifFalse:`, `and:`, `or:`, `not`) en la capa 2 (evaluador)**, no en la capa 3. Por tanto el **gate binario de Boolean mínimo vive en L3** (ver §5.3). En L4/F1 se conserva **solo la EXTENSIÓN** (`ifTrue:`, `ifFalse:`, `ifFalse:ifTrue:`, `&`, `|`, `xor:`), **marcada como extensión/ingeniería (origen NO spec-ANSI)** — ver corrección de origen abajo.

> **Corrección de nomenclatura (declarada explícitamente):** el research §4/§6.1 usa `SequencedCollection`; este plan usa **`SequenceableCollection`** (nombre real en Pharo/Squeak). Es una **elección de dialecto deliberada**, no una transcripción literal de la fuente; se registra en el log de desviaciones (§8.9). Las demás correcciones del plan se declaran meticulosamente; esta lo hace igual.

**Objetivo.** Bootstrappear, en orden de dependencia, las clases kernel que dan cuerpo a los protocolos ANSI de cada familia, montadas SOBRE L2 (metamodelo) y L3 (dispatch) + L5 (excepciones) ya verdes. Cada familia es una *capa de conformidad* gateada de forma independiente. Se reusa V8 para number/string/array, pero se reimplementa explícitamente: identidad `==`, Symbol con tabla de interning propia, y auto-promoción SmallInteger→BigInt. Se difiere honestamente la torre numérica completa y las colecciones avanzadas.

**Alcance — in.**
- Orden de bootstrap por familia (cada una un gate): **F0** identidad/igualdad + interning de Symbol; **F1** Boolean/nil **(solo la extensión; el mínimo es gate de L3)**; **F2** Magnitude→Number/SmallInteger/Float + Character; **F3** Collection (enumeración); **F4** SequenceableCollection→Array+Interval; **F5** String+Symbol; **F6** Stream→Read/Write/ReadWrite.
- **F1 extensión (marcada, origen=ingeniería/extensión — NO spec-ANSI):** `ifTrue:`, `ifFalse:`, `ifFalse:ifTrue:`, `&`, `|`, `xor:` — adiciones de conveniencia sobre el mínimo de L3. El research NO lista estos selectores (solo el mínimo `ifTrue:ifFalse:`/`and:`/`or:`/`not` en capa 2); se marcan [UNVERIFIED] / `origin=ingeniería` igual que `{ }`/`#[ ]`, y tienen entrada en el log de desviaciones. Evaluación perezosa de bloques vía `send value` (sin inlining). UndefinedObject: `isNil`/`notNil`/`ifNil:`/`ifNotNil:`/`ifNil:ifNotNil:`.
- **F2:** Magnitude abstracta (`< <= > >= = max: min: between:and:` derivados de `<` y `=`); Number/SmallInteger/Float `+ - * / < <= > >= = max: min: abs negated`; aritmética delegada a `number`; auto-promoción a BigInt al salir del rango seguro `±(2^53−1)` (`Number.MAX_SAFE_INTEGER`); Character por code point con `asInteger`/`value`/`asCharacter` y comparación. **`Float / 0` señala ZeroDivide** (decisión §8.2), no `Infinity`.
- **F3:** Collection `do: collect: select: reject: detect: detect:ifNone: inject:into: size isEmpty notEmpty includes: add:`; `collect:`/`select:`/`reject:` devuelven la **species** apropiada (p.ej. `Interval collect:` → Array). **El concepto "species" es decisión de ingeniería/dialecto — NO contrato ANSI citable:** la palabra "species" no aparece en el research, y §6.1 capa 3 no lista "species" ni "`collect:` → Array" como criterio; se marca `origin=ingeniería/dialecto` y tiene entrada en el log de desviaciones (§8.10).
- **F4:** SequenceableCollection + Array + Interval `at: at:put: first last , copyFrom:to:`; indexación **1-based**; `at:` fuera de rango señala Error (máquina de L5).
- **F5:** String + Symbol `, size asSymbol asString =`; identidad de Symbol interned (`#foo == #foo`); `=` de String por contenido.
- **F6:** Stream + Read/Write/ReadWrite `next nextPut: atEnd contents upToEnd` (solo en memoria; File Stream Protocols e I/O real diferidos). *(Stream Protocols = sección ANSI **[UNVERIFIED — confirmar número, candidato §5.9]**; se verifica contra el draft v1.9 antes de citarlo en frontmatter.)*
- Reimplementación del *frontier de reuso*: `==`/`identityHash` sobre boxed; interning de Symbol; auto-promoción a BigInt.
- Kernel mixto: primitivas en TS ancladas por selector + métodos `.st` cargados al bootstrap (sin imagen).
- Extensiones reusando familias: `{ }` → Array normal; `#[ ]` → Array de SmallIntegers en MVP (ByteArray reificado real diferido). Ambas marcadas.
- Log de desviaciones: **species (ingeniería/dialecto), F1-ext (ingeniería)**, ByteString-vs-WideString, 1-based, retornos *unspecified* de Stream, `{ }`/`#[ ]` reusando Array, `#[ ]`→Array de SmallIntegers, **`SequenceableCollection` (nomenclatura), `Float/0`→ZeroDivide**.

**Alcance — diferido.**
- Torre numérica completa: Fraction, aritmética de ScaledDecimal (literal parseado en L1, clase/operaciones diferidas), coerción/generality, Large*Integer reificados (MVP usa BigInt nativo).
- Colecciones avanzadas: Dictionary/Set/Bag/SortedCollection/OrderedCollection crecible/LinkedList/Association.
- **Compile-to-JS** de métodos / control-flow a JS nativo, e inline cache/PIC — L-optim (diferido). *(Distíngase de las special-forms ITERATIVAS de bucle del evaluador `whileTrue:`/`to:do:`/`repeat`, que SÍ están en L3 — §5.3.1 — y NO son compile-to-JS: son el `while`/`for` del tree-walker. `ifTrue:`/`and:`/`or:`/`not` nunca se inlinean: son envíos reales.)*
- File Stream Protocols e I/O real.
- SUnit nativo (post-L5).
- ByteArray reificado real; DateAndTime/Duration; inventario exacto de clases ANSI [UNVERIFIED §9].
- `become:`/`allInstances` baratos/weak collections/persistencia.

**Decisiones clave (con origen).**
- Orden de bootstrap por dependencia (F0..F6) — *ingeniería*.
- Magnitude implementa comparaciones en términos de `<` y `=` — *spec-ANSI*.
- Boolean sin inlining — *ingeniería* (un no-Boolean que reciba `ifTrue:` debe hacer dNU; solo se garantiza sin inlining).
- **Boolean mínimo gateado en L3, no en L4** — *corrección de etiquetado* (capa 2 del research); F1 solo extiende.
- **Extensión Boolean F1 (`ifTrue:`, `ifFalse:`, `ifFalse:ifTrue:`, `&`, `|`, `xor:`) — *ingeniería/extensión*, NO spec-ANSI** (no figura en el research; marcada [UNVERIFIED] y registrada en el log, igual que `{ }`/`#[ ]`).
- True/False/nil singletons — *spec-ANSI*.
- SmallInteger/Character nativos sin tag/box — *ingeniería*.
- Auto-promoción a BigInt — *ingeniería*.
- Symbol con interning propio — *ingeniería*.
- `{ }`/`#[ ]` no materializan clases nuevas; reusan Array — *extensión-propia*.
- Indexación 1-based con error señalado por excepción — *spec-ANSI*.
- Kernel mixto (primitivas TS + `.st`) — *dialecto:Squeak* (JsSOM/Amber).
- **`collect:`/`select:`/`reject:` respetan "species" — *ingeniería/dialecto*, NO spec-ANSI** (corrección de origen: "species" no aparece en el research ni en §6.1 capa 3; es una elección de dialecto presentada antes como contrato ANSI; ver §8.10).
- **`SequenceableCollection` en lugar de `SequencedCollection` del research — *dialecto:Pharo*** (corrección de nomenclatura declarada; §8.9).
- `Float / 0` → ZeroDivide (no IEEE Infinity) — *ingeniería* (decisión fijada en §8.2; uniformidad Smalltalk).
- OrderedCollection crecible opcional en MVP — *ingeniería*.

**API/estructuras.**
- Clases kernel como instancias del metamodelo de L2 (no clases TS): Boolean, True, False, UndefinedObject, Magnitude, Number, SmallInteger, Float, Character, Collection, **SequenceableCollection**, ArrayedCollection, Array, Interval, String, Symbol, Stream, PositionableStream, Read/Write/ReadWriteStream.
- `interface SymbolTable { intern(name): StSymbol; readonly size }`.
- `identityEquals(a,b)` (semántica de `==`); `identityHash(o)`.
- `interface NumericOps { add; sub; mul; div; compare; promoteOnOverflow(n): number|bigint }` — `div` chequea divisor cero (Integer y Float) y señala ZeroDivide.
- `interface KernelBootstrap { installPrimitives(vm); loadKernelSources(vm, sources); verifyFamilyGate(family): GateReport }`.
- `type Primitive = (receiver, args, vm) => StObject` registradas por `(className, selector)`.
- Protocolos Collection/SequenceableCollection/Stream en `.st` (firmas Smalltalk).
- `StSource = { selectorOrClassDef; provenanceTag }` — cada fuente `.st` con tag de procedencia. **El cargador que materializa `loadKernelSources(vm, sources)` y `StSource` (dueño de la primitiva `subclass:`, esquema de dos pasadas, formato `.st`) se especifica en §5.4.0 (KERNELLOAD).**

**Criterios de éxito cuantificados (gates CI binarios).**
- **GATE-L4-PRECOND:** el gate de L5 (excepciones) está verde en CI antes de entrar a L4.
- **GATE-F1-BOOLEAN-EXT (extensión, origen=ingeniería — NO gate de capa 3 del research, [UNVERIFIED]):** `ifTrue:`, `ifFalse:`, `ifFalse:ifTrue:`, `&`, `|`, `xor:` responden sobre `true`/`false`; >=6 positivos + >=1 negativo. **Estos selectores NO figuran en el research; el gate verifica la EXTENSIÓN de dialecto, no conformidad ANSI**; cada uno tiene entrada en el log de desviaciones. *(El mínimo `ifTrue:ifFalse:`/`and:`/`or:`/`not` se valida en el gate de L3.)*
- **GATE-F2-NUMBER:** Number/Magnitude responden `+ - * / < <= > >= = max: min: abs negated` (13 selectores); >=15 positivos incluyendo >=1 de auto-promoción a BigInt al cruzar el límite seguro `2^53−1` (`Number.MAX_SAFE_INTEGER`) con resultado exacto (p.ej. `(2^53−1) + 1` exacto vía BigInt) + Character con `asInteger`/comparación.
- **GATE-F3-COLLECTION:** Collection responde `do: collect: select: reject: detect: detect:ifNone: inject:into: size isEmpty includes: add:` (12 selectores); >=12 positivos + 1 de species (`Interval collect:` → Array) + `detect:ifNone:` con bloque de ausencia. **El sub-caso de "species" verifica una decisión de ingeniería/dialecto (origen NO spec-ANSI, §8.10), no un criterio ANSI citable.**
- **GATE-F4-SEQUENCEABLE:** `at: at:put: first last , copyFrom:to:` (6 selectores) 1-based sobre `SequenceableCollection` (nomenclatura de dialecto, §8.9); >=8 positivos + >=2 negativos (`at:` fuera de rango → Error capturable con `on:do:` de L5).
- **GATE-F5-STRING-SYMBOL:** `, size asSymbol asString =` (5 selectores) MÁS identidad de Symbol: `#foo == #foo`, `'foo' asSymbol == #foo` true por identidad, `'foo' = 'foo'` true por contenido, `'foo' == 'foo' copy` false. **>=8 positivos + >=2 de identidad = 10 casos** (ver agregado).
- **GATE-F6-STREAM:** `next nextPut: atEnd contents upToEnd` (5 selectores) en memoria; >=6 positivos incluyendo round-trip (WriteStream → `upToEnd`) + `atEnd` en límite.
- **GATE-L4-IDENTITY:** `==`/`~~`/`identityHash` reimplementados (no `===` sobre boxed) coherentes para todas las familias; objetos distintos con mismo contenido → `==` false y `=` true; >=5 casos cruzando familias. **Incluye el contrato sobre inmediatos compartido con L2:** `3 == 3` true por valor, `$a == $a` true.
- **GATE-L4-NO-INLINING (frontera precisada, ver §5.3.1):** un no-Boolean que recibe `ifTrue:` produce `doesNotUnderstand:`; >=1 negativo verde. El gate prohíbe tratar `ifTrue:`/Boolean (ni `and:`/`or:`/`not`/`ifNil:`) como sintaxis del evaluador — siguen siendo **envíos reales**. NO prohíbe las **special-forms de bucle** de §5.3.1 (`whileTrue:`/`to:do:`/`repeat`, solo con bloques literales), que no incluyen ningún selector Boolean y evalúan su condición por envío de `value` + comparación con los singletons `true`/`false` (señalando `doesNotUnderstand:`/`mustBeBoolean` si no es Boolean). Frontera: special-forms = solo bucles; condicionales/lógicos = envíos reales.
- **GATE-L4-PROVENANCE:** cada fuente `.st` y cada clase llevan tag de procedencia; existe entrada en el log de desviaciones por cada desviación esperada (species (ingeniería/dialecto), F1-ext (ingeniería), Unicode, 1-based, *unspecified* de Stream, `{ }`/`#[ ]` reusando Array, `#[ ]`→Array de SmallIntegers, nomenclatura `SequenceableCollection`, `Float/0`→ZeroDivide). Lint CI: 0 fuentes `.st` sin tag.
- **GATE-F2-ZERODIVIDE (cierre de L5, ahora binario sin ambigüedad):** F2 cierra retroactivamente el caso ZeroDivide de L5 — **`Integer / 0` Y `Float / 0` señalan ZeroDivide** (decisión fijada en §8.2; resultado esperado único y conocido por el implementador), capturable por `on: ZeroDivide do:` y por `on: ArithmeticError do:` (subtipo). La divergencia de IEEE (`Infinity`) se registra como desviación. *(Antes el gate decía "resuelto de forma determinista según la decisión de §8" con §8 abierta — no era binario; ahora el resultado esperado es ZeroDivide en ambos casos.)*
- **GATE-L4-AGGREGATE (recomputado, corrección de gap aritmético):** los 6 gates de familia + identidad + no-inlining verdes simultáneamente en una corrida CI que emite JUnit XML. **Suma real de mínimos por sub-gate:** positivos `6 (F1-ext) + 15 (F2) + 12 (F3) + 8 (F4) + 10 (F5) + 6 (F6) + 5 (identidad) = 62`; negativos `1 (F1-ext) + 2 (F4) + 1 (no-inlining) = 4` (más los que cada familia añada). **Criterio: >=62 positivos y >=4 negativos**, fórmula explícita y verificable contra los sub-gates (sustituye el `>=57/>=9` previo, internamente inconsistente).

**Artefacto de tests.** Corpus de fragmentos `.st` evaluados por el harness host en Node/Vitest, comparados por igualdad de resultado (estilo `AT_DIFF_TEST` a nivel de resultado de evaluación). Organización por familia y trazabilidad estilo Test262/ACATS (cada test referencia su sección ANSI 5.x o su tag de extensión; los casos de species y F1-ext referencian `origin=ingeniería`, no una sección ANSI). Negativos verifican señalización vía la máquina de L5. Casos de referencia tomados de `testsuite.at` de GNU Smalltalk y la batería ANSI de Squeak (como referencia de QUÉ probar). Salida JUnit XML. SUnit nativo NO se usa (post-L5). Un test de procedencia/lint verifica que toda fuente `.st` lleva tag.

**Riesgos.**
- Megamorfismo en V8 ([UNVERIFIED]). *Mitigación:* shapes monomórficos de `STObject` + `tinyBenchmarks`; la IC es L-optim.
- Frontera BigInt (`number` y `BigInt` no se mezclan). *Mitigación:* `NumericOps` centraliza overflow; F2 exige >=1 caso que cruce la frontera con resultado exacto.
- Unicode ByteString-vs-WideString (surrogate pairs). *Mitigación:* Character por code point + desviación documentada.
- `species`/`collect:` incorrecto. *Mitigación:* caso explícito de species en F3, marcado como decisión de ingeniería/dialecto (no ANSI).
- Inlining prematuro de Boolean rompería el negativo de dNU. *Mitigación:* GATE-L4-NO-INLINING lo prohíbe.
- Retornos *unspecified* de ANSI. *Mitigación:* documentar como prosa, no aserción de igualdad; elegir dialecto-oráculo donde haga falta y registrarlo.
- Alcance de OrderedCollection. *Mitigación:* filtrar el corpus a tamaño fijo + Stream; promover solo si un gate la exige.
- Inventario ANSI [UNVERIFIED §9]. *Mitigación:* tratar `§6.1` como mínimo, no tope; triangular cada familia.

**Dependencias.** L1, L2, L3, **L5** (GATE-L4-PRECOND).

**Esfuerzo.** XL.

---

#### 5.4.0 — Cargador de kernel `.st` (KERNELLOAD)

**Mapeo de gate:** entregable de **fin de L3 (prerequisito de L5)**. Materializa `loadKernelSources(vm, sources)` y `StSource{selectorOrClassDef, provenanceTag}` (§5.4). Precondición: L1 (AST), L2 (metamodelo + API TS de construcción) y L3 (dispatch `send`/super/dNU) verdes. **El cargador debe estar verde en L3.5, ANTES de L5**, porque L5 lo consume para montar la jerarquía de excepciones desde `.st`. (Se evita el rótulo "inicio de L4": en este plan L5 precede a L4, así que el consumidor más temprano del cargador es L5, no L4.)

> **Nota de numeración.** Esta subsección se numera §5.4.0 —subsección dentro de §5.4— porque las cabeceras 5.x del plan están fuera de orden numérico por la secuenciación L5-antes-de-L4 (§5.5/L5 precede físicamente a §5.4/L4). NO existe un "§5.5 libre": §5.5 ya es L5. La posición física del splice (tras el `---` de cierre de §5.4, antes de `### 5.6`) es correcta; solo el número del diseño original ("§5.5 L3.5/L4.0") estaba equivocado y se corrige aquí.

> **Por qué existe esta subsección (cierra COMPL-3 / SCOPE-03 / SEQ-1).** El plan declaraba `loadKernelSources(vm, sources)` y `StSource` sin decir (a) quién posee la primitiva `subclass:` ni (b) cómo se resuelven las referencias FORWARD entre clases `.st`. Esta subsección fija ambos como esquema de **dos pasadas** y ancla `subclass:` como **primitiva propiedad de L2**.

> **Reconciliación con el fix de SEQ-1 (este diseño lo SUPERSEDE explícitamente).** El review (SEQ-1, líneas 88/180) fijó como fix minimalista: "L5 construye la jerarquía con la API TS de construcción de L2; NO añadir primitiva `subclass:` (over-engineering para el MVP)". Este diseño **supersede** ese fix con justificación: **L4 requiere la primitiva `subclass:` de todos modos** para bootstrappear F0..F6 desde `.st`, por lo que materializarla también para L5 tiene coste marginal ~0 y deja de ser over-engineering. Bajo la nueva decisión: la prosa `Object subclass: ...` de §5.5/L5 (línea 487) **se mantiene y AHORA tiene dueño** —la primitiva de §5.4.0—, en lugar de eliminarse. Internamente: tanto la API TS directa de L2 como la primitiva `subclass:` enrutan al MISMO código de construcción (`basicNew`/`STClass`/`setClass`/`addSelector:withMethod:`), así que no hay dos caminos divergentes; SEQ-1 y este diseño convergen en la misma maquinaria, difiriendo solo en si L5 la invoca por API TS o por keyword-send.

**Objetivo.** Convertir un conjunto de fuentes `.st` (el kernel) en un grafo de `STClass` vivo y consistente, reusando el AST de L1 y la API TS de L2, con resolución determinista de forward refs, sin imagen/snapshot. Es el puente entre "L2 expone `basicNew`/`addSelector:withMethod:`/`setClass`/`STClass` en TS" y "L4/L5 tienen clases (Boolean/Number/Collection/Exception…) como instancias del metamodelo".

**(1) Propiedad de la primitiva `subclass:` (en L2, anclada por selector).**
- Al evaluar `Object subclass: #Foo instanceVariableNames: 'a b' classVariableNames: '' package: 'Kernel'`, L3 lo trata como un **keyword send ordinario** (sin sintaxis especial). Receptor = la `STClass` `Object`; selector = `subclass:instanceVariableNames:classVariableNames:package:`.
- Ese selector resuelve a una **PRIMITIVA del lado del metamodelo**, instalada en `Class`/`ClassDescription` por `installPrimitives(vm)` de L2 (NO un método `.st`). La primitiva invoca la API TS de construcción de L2: deriva `instSize`/`format`, fabrica la `STClass` vía `basicNew` del lado-metaclase, cablea `setClass`/`superclass`/`metaclass`, registra la clase en el namespace del kernel y devuelve la `STClass` recién creada (como en Pharo/Squeak).
- Familia mínima de primitivas de definición (todas propiedad de L2, *dialecto:Pharo*): `subclass:instanceVariableNames:classVariableNames:package:` (y variante corta `subclass:`), `#name`, `superclass:`, `instanceVariableNames:`, `addSelector:withMethod:`/`compile:`, `>>`.
- **Por qué primitiva y no método `.st`:** `subclass:` debe existir ANTES de cargar cualquier clase `.st` (bootstrap circular). Es el patrón JsSOM (`newSystemClass`/`initializeSystemClass` en TS, antes de cargar cualquier `.som`) y Amber (`klass()`/`setupClass()`/`wireKlass()` en JS, antes de instalar métodos).

**(2) Esquema de DOS PASADAS (resolución de forward refs).**
El cargador recibe `sources: StSource[]`; cada `StSource` es **una clase**. Algoritmo:
- **Pasada 0 — *seed* del núcleo metacircular (TS, no `.st`):** L2 ya entregó vivos `Object, Behavior, ClassDescription, Class, Metaclass, UndefinedObject` (más `nil/true/false`) vía `bootstrapKernel()`. NO se cargan desde `.st`; son la raíz. (Equivale a `newMetaclassClass`/`newSystemClass` del constructor de `Universe` en JsSOM.)
- **Pasada 1 — declarar todos los stubs de clase (forward-ref-safe):** para cada `StSource`, parsear el `class-def` y crear una `STClass` **vacía** (sin métodos) con nombre, superclase **resuelta por nombre contra el namespace** (seed + clases ya declaradas), metaclase cableada, `instSize` derivado de `instanceVariableNames:`, y `methodDict` vacío. La superclase puede referenciar una clase declarada **después**: se permite porque (i) la pasada se ordena topológicamente por superclase antes de ejecutar, o (ii) si hay ciclo/orden imposible se reporta `KernelLoadError`. Resultado: **todas** las `STClass` existen con su superclass/metaclass chain completa. Equivale a la batería `initializeSystemClass(...)` de JsSOM y a `st.init`/`copySuperclass` de Amber.
- **Pasada 2 — instalar métodos compilados:** para cada `StSource`, por cada `method-def`, compilar su cuerpo con el AST/evaluador de L1+L3 a un `CompiledMethod{selector, invoke, sourceNode, provenanceTag}` y hacer `addSelector:withMethod:` (instancia o lado-metaclase). En esta pasada un cuerpo PUEDE referenciar cualquier clase del kernel por nombre (todas existen desde la pasada 1), resolviéndose como `GlobalRead` contra el namespace — esto cierra el caso "una clase `.st` referencia otra aún no cargada". Equivale a `loadSystemClass(...)`/`loadPrimitives(...)` de JsSOM y a `klass._initialize()`/instalación de métodos de Amber.
- **Cierre:** tras la pasada 2, reaseverar el cierre metacircular de L2 sobre TODO el namespace y que cada superclass chain termina en `Object`→`nil`.

Las primitivas TS por familia se instalan vía `installPrimitives(vm)` **entre** pasada 1 y pasada 2, de modo que un método `.st` pueda invocar una primitiva de su propia clase. F0..F6 se cargan como lotes de `StSource[]` por este mismo cargador, respetando el orden de §5.4.

**(3) Formato `.st` del kernel (no-chunk, un archivo por clase).**
- **NO** se usa el Interchange Format ANSI ni chunks `!`/fileIn/Tonel/Monticello (diferidos por §5.1/§5.4). Formato simple, parseable por el AST de L1, un archivo por clase:
  - **`class-def`** (1ª sentencia): keyword send ordinario `Super subclass: #Name instanceVariableNames: '...' classVariableNames: '' package: 'Kernel-Xxx'`. Lo parsea L1 como `MessageSendNode` keyword; lo ejecuta la primitiva de (1).
  - **`method-defs`**: `Name >> selector ... [ cuerpo ]` (instancia) y `Name class >> selector ... [ cuerpo ]` (clase), separados por un delimitador simple (decisión de ingeniería documentada en el log). Cada cuerpo es una secuencia A.2/A.3 que L1 ya parsea.
  - **Frontmatter de procedencia** (comentario `"..."` al inicio) llena `StSource.provenanceTag`.
- El loader **no** necesita parser nuevo: `parse()` de L1 sobre el archivo, separando la 1ª sentencia (`class-def`) del resto (`method-defs`).

**API/estructuras (extiende §5.4).** `loadKernelSources(vm, sources): KernelLoadReport`; `StSource = { className; superclassName; classDefNode; methodDefNodes[]; provenanceTag }`; `declareClassStub(vm, src): STClass` (pasada 1, idempotente por nombre); `installMethods(vm, src): void` (pasada 2); `resolveSuperclass(namespace, name): STClass | throw KernelLoadError`; `type KernelLoadReport = { classesDeclared; methodsInstalled; namespace: Map<string,STClass> }`; `KernelLoadError { kind: 'unresolved-superclass'|'cycle'|'duplicate-class'|'method-on-missing-class'; ... }`. La primitiva `subclass:...` reusa la API TS de L2 sin API nueva.

**Decisiones clave (con origen).** `subclass:` como primitiva anclada por selector, propiedad de L2 — *dialecto:Pharo* (JsSOM `initializeSystemClass`; Amber `klass()`/`setupClass`). Dos pasadas — *dialecto:Squeak* (JsSOM separa `initializeSystemClass` de `loadSystemClass`; Amber separa `st.init`/`copySuperclass` de la instalación de métodos). Forward refs por orden topológico + namespace, error determinista si imposible — *ingeniería*. Formato no-chunk un-archivo-por-clase — *ingeniería/dialecto:Squeak* (Amber organiza el kernel en `Kernel-*.st`; aquí se simplifica). Núcleo metacircular sembrado por L2, no desde `.st` — *dialecto:Squeak*. Delimitador concreto de `method-defs` — *ingeniería* (documentado en el log).

**Criterios de éxito cuantificados (gates CI binarios; conteo PROPIO, separado del >=62/>=4 de GATE-L4-AGGREGATE).**
- **GATE-KERNELLOAD-FORWARDREF (principal, binario):** un kernel de prueba de **N≥5 clases** con **≥2 forward refs** (una clase declarada antes que su superclase; un método cuyo cuerpo referencia una clase declarada después) produce un namespace donde, para cada clase X, recorrer `X.superclass` termina en `Object`→`nil` sin ciclos ni `null` intermedios, y la cadena coincide con la jerarquía declarada (igualdad de secuencia de nombres). ≥1 caso positivo con forward ref de superclase + ≥1 con forward ref en cuerpo de método.
- **GATE-KERNELLOAD-METACLOSURE:** tras la carga, reaseverar el cierre metacircular de L2 sobre TODO el namespace: `classOf(classOf(X)) === Universe.Metaclass` para toda X, y `X class superclass === X superclass class` para toda X con superclase no-`nil`. **Hereda explícitamente el caso especial de la raíz Object de la aserción de L2 (§5.2, líneas 292/338): `classOf(Object).superclass === Universe.Class`** —la "trampa" metaclase—, que la fórmula general excluye porque `Object superclass == nil`. Sin esta herencia, la arista que el propio diseño cita como "la trampa" quedaría sin verificar.
- **GATE-KERNELLOAD-SUBCLASS-PRIM:** `Object subclass: #Foo instanceVariableNames: 'x' classVariableNames: '' package: 'T'` evaluado como keyword send devuelve una `STClass` con `name == #Foo`, `superclass === Object`, `instSize == 1`, `methodDict` vacío, `classOf(Foo class) === Metaclass`. ≥1 negativo: `subclass:` a un no-Behavior → `doesNotUnderstand:` (confirma anclaje por selector, no sintaxis especial).
- **GATE-KERNELLOAD-TWOPASS-METHOD:** una clase `A` cuyo método `A>>m` referencia por nombre a una clase `B` declarada **después** en `sources` carga sin error y `A>>m` resuelve `B` en tiempo de envío (≥1 positivo round-trip). **Nota (VIA-1 abierto):** los cuerpos de método del kernel de prueba y el test de integración F0..F1 usan **profundidad de recursión/iteración ACOTADA** mientras §7-VIA-1 (recursión sin TCO) siga abierto en su capa, para no confundir un `RangeError` de V8 con un fallo de resolución forward. (La special-form iterativa de §5.3.1 ya elimina el riesgo para bucles literales; la cota aplica a recursión genuina.)
- **GATE-KERNELLOAD-ERRORS (negativos):** ≥3 deterministas: (i) superclase inexistente → `KernelLoadError{kind:'unresolved-superclass'}`; (ii) ciclo de herencia → `KernelLoadError{kind:'cycle'}`; (iii) `method-def` sobre clase no declarada → `KernelLoadError{kind:'method-on-missing-class'}`. Cada uno falla en la fase de carga.
- **GATE-KERNELLOAD-PROVENANCE (refuerza, NO duplica, GATE-L4-PROVENANCE):** 0 `StSource` sin `provenanceTag`; el lint de §5.4 ("0 fuentes `.st` sin tag") se extiende a cada `StSource` derivado de un `.st`. Es sub-caso/refuerzo, NO un gate independiente que infle el agregado.

**Artefacto de tests.** Suite Vitest (TS) que construye un `Universe` vía L2, instala las primitivas de definición y carga un kernel de prueba sintético de ≥5 clases con forward refs deliberadas (profundidad acotada), aseverando superclass chains, cierre metacircular (incl. la trampa Object) y los negativos de `KernelLoadError`. MÁS un test de integración que carga F0..F1 reales (Boolean/True/False/UndefinedObject) por este cargador y verifica que `true ifTrue:` responde (puente a §5.4/F1; profundidad acotada). Emite JUnit XML.

**Riesgos.** Orden de bootstrap circular mal resuelto → *mit:* pasada 1 obligatoria + orden topológico + error determinista. Tentación de parser chunk/fileIn prematuro → *mit:* formato no-chunk; chunk/Tonel/Monticello diferidos. Drift entre la primitiva `subclass:` y la API TS de L2 → *mit:* la primitiva no añade lógica de construcción, solo enruta; test que compara clase construida vía primitiva vs vía API TS directa. Compilar `method-defs` antes de existir sus primitivas → *mit:* `installPrimitives` corre ENTRE pasada 1 y 2. Tests tropezando con `RangeError` de VIA-1 → *mit:* profundidad acotada en el kernel de prueba.

**Dependencias.** L1, L2, L3. (NO L5 — el kernel de excepciones se carga por este mismo cargador; por eso el cargador debe estar verde ANTES de L5.)

**Esfuerzo.** M.

**Verificación de fuentes primarias.** JsSOM (`Universe.js`): pre-aloja stubs (`newMetaclassClass`/`newSystemClass`); `initializeObjectSystem()` corre PRIMERO toda la batería `initializeSystemClass(class, superClass, name)` (pasada 1, forward-ref-safe) y LUEGO `loadSystemClass(class)`/`loadPrimitives` (pasada 2) — valida el esquema 1:1. Amber (`support/boot.js`): `klass()`/`setupClass()`/`wireKlass()` cablean estructura en construcción; `st.init`/`copySuperclass` (wiring) y luego instalación de métodos — mismo patrón de dos fases (matiz menor: el nombre `_initialize()` que citaba el diseño no aparece verbatim en el excerpt; no afecta el patrón). SqueakJS bootstrappea por imagen/snapshot, NO por fuentes `.st`; pandi-sm decide NO usar imagen (§2 "Sin imagen"), por eso sigue JsSOM/Amber para la carga y solo toma de SqueakJS la representación de objeto (plain JS object con slots), ya adoptada en §5.2.

---

### 5.6 L6 — Trazabilidad bidireccional y log de desviaciones (metodología `§7`)

**Mapeo de gate:** NO es un gate de capa numerado; materializa la **metodología `§7`** (trazabilidad test↔spec, log de desviaciones). **El runner host básico NO es L6: vive en L0/L1.**

> **Corrección de over-engineering / secuenciación:** el runner host básico (descubrimiento de `.st` + frontmatter + JUnit XML + dos modos de comparación) se **degrada a L0/L1** porque L1 lo necesita para su propio gate. L6 conserva **solo** lo que el research `§7` añade como disciplina: la **verificación de trazabilidad bidireccional** y el **parseo/cruce del log de desviaciones**, **diferidos hasta tener corpus L1 verde** (su dependsOn real).

**Objetivo.** Construir la disciplina *spec-driven* de pandi-sm sobre el runner ya existente: exigir frontmatter de trazabilidad en cada caso (producción del Anexo A o sección ANSI, estilo ACATS/Test262), soportar tests positivos Y negativos clasificados por fase (lex/parse/eval), mantener un log de desviaciones append-only en `doc/research/` (una entrada por desviación: feature, decisión, origen, test que la cubre), y cerrar el bucle con verificación bidireccional CI. Convierte los gates `§6.1` en condiciones binarias CI-verificables y triangula cada divergencia con spec+test+dialecto. SUnit-in-image diferido (post-L5).

**Alcance — in.**
- **Frontmatter de trazabilidad** embebido como comentario Smalltalk al inicio del `.st`: `id`, `spec` (ANSI §x.y o `anexoA:<producción>`), `origin` (`spec-ANSI`|`dialecto:Pharo`|`dialecto:Squeak`|`extensión-propia`|`ingeniería`), `kind` (positive|negative), `phase` (lex|parse|eval), `layer` (L1..L4), `oracle` (`spec`|`dialecto:gst`|`dialecto:pharo`; solo en casos diferenciales golden-master, §7). El runner parsea y VALIDA; sin frontmatter válido el test FALLA (no se salta).
- Parser del frontmatter + modelo de metadata validado por esquema.
- **Tests positivos y negativos clasificados por FASE** (estilo `assert_malformed`/`assert_invalid`/`assert_trap`): un negativo pasa solo si el runtime falla en la fase esperada con la clase de error esperada.
- **Log de desviaciones** append-only en `doc/research/`: una entrada por desviación con feature/decisión/origen/test(s)/triangulación. Sembrado el día 1.
- **Verificador de trazabilidad bidireccional (gate CI, diferido a corpus L1 verde):** toda extensión del log DEBE tener >=1 test que la cubra; todo test con `origin != spec-ANSI` DEBE tener entrada en el log.
- Captura de lo no-ejecutable como prosa (Hayes & Jones): puntos *unspecified*/implementation-defined/*erroneous* documentados como decisiones (`skipped-by-design` con razón) o como tests de política con `origin=ingeniería`, NUNCA como aserciones de conformidad ANSI.
- Integración CI: `npm run conformance` corre el corpus, emite JUnit XML, valida frontmatter + trazabilidad, exit != 0 si algún gate `§6.1` aplicable está rojo (regla de avance).

**Alcance — diferido.**
- SUnit nativo in-image (post-L5).
- **Oráculo diferencial = harness golden-master (promovido de 'solo manual' a activo, §7).** `gst` headless genera *golden fixtures* **offline** (versionadas) + un job CI **no-bloqueante** de *drift*; el gate de conformidad compara contra las fixtures, NO contra un Smalltalk vivo (sin acoplar CI a una imagen). Pharo headless = oráculo **secundario** para triangulación manual de *unspecified*. **Diferido:** un intérprete de referencia diferencial SÍNCRONO como gate BLOQUEANTE de CI (el dialecto vivo nunca es gate duro).
- Importación automática de corpus externos (Camp Smalltalk, batería Squeak, `testsuite.at`): se usan como referencia de QUÉ probar, portando a mano; parser de chunk/fileIn `!`/Tonel/Monticello diferido.
- Reporte de cobertura sobre el Anexo A automatizado (nice-to-have; el gate L1 ya exige >=1 test por producción).
- Benchmarks (`tinyBenchmarks`) — capa de performance separada.
- Fuzzing / property-based.
- Marcado de flakiness/timeouts (runtime síncrono y determinista en MVP).

**Decisiones clave (con origen).**
- Runner host en Vitest, SUnit diferido — *ingeniería* (**el runner ya vive en L0/L1**; L6 solo formaliza la metodología).
- Dos modos de comparación (AST estructural / salida `printString`), estilo `gst -r file.st` + diff — *dialecto:Squeak* (`AT_DIFF_TEST`).
- Tests positivos/negativos por fase — *spec-ANSI* (ANSI define categorías Erroneous; split estilo WebAssembly/Test262).
- Frontmatter en cada `.st`; falla-en-vez-de-saltar — *ingeniería* (evita cobertura fantasma).
- Log de desviaciones append-only en `doc/research/` — *spec-ANSI* (implementation-defined/undefined/erroneous exigen documentación).
- Triangulación spec+test+dialecto; *unspecified* como prosa — *spec-ANSI* (Hayes & Jones).
- Verificación bidireccional como gate CI — *ingeniería* (cierra el bucle ACATS/Test262).
- Oráculo de dialecto vivo fuera de CI — *ingeniería* (evita acoplar CI a una imagen viva).

**API/estructuras.**
- `parseFrontmatter(source): Frontmatter` (throws si falta/malformado).
- `Frontmatter { id; spec:{ansiSection?, anexoA?}; origin; kind; phase; layer; title?; deviation? }`.
- `loadCase(file): ConformanceCase`; `discoverCases(rootDir): ConformanceCase[]`.
- `Expectation = ExpectedOutput | ExpectedAst | ExpectedError(phase, errorClass)`.
- `RuntimeAdapter { parse(src); evaluate(src): { printString } }` (definido en L0).
- `runCase(c, rt): CaseResult` con `status: 'pass'|'fail'|'skipped-by-design'`; `normalizeAst(ast)`.
- `registerCorpus(rootDir, rt)` (puente a Vitest, agrupado por layer y spec).
- **L6 propio:** `parseDeviationLog(mdPath): DeviationEntry[]` y `verifyTraceability(cases, log): { ok; errors }` (bidireccional) — **diferidos hasta corpus L1 verde**.
- `DeviationEntry { id; feature; decision; origin; coveredBy[]; triangulation }`.
- Layout: `conformance/<layer>/<spec-section>/<id>.st` (+ `.expected` cuando no quepa inline).

**Criterios de éxito cuantificados (gates CI binarios).**
- **L6.A (runner verde sobre el corpus de L1):** `npm run conformance` produce los gates `§6.1` capa 1: >=40 positivos (>=1 por producción del Anexo A) + >=15 negativos (incl. OBLIGATORIOS los 2 de A.4), TODOS verdes. Verificable por exit code y conteo en el JUnit XML. *(El runner es de L0/L1; este gate confirma que L6 lo conduce.)*
- **L6.B (JUnit XML válido y agrupado):** `vitest run --reporter=junit` produce XML parseable con `<testsuite>` agrupadas por layer y sección; cada `<testcase>` lleva el `id` del frontmatter; >=55 testcases para L1 con atributos no vacíos.
- **L6.C (frontmatter obligatorio):** 100% de los `.st` tienen frontmatter válido; un `.st` sin frontmatter válido hace FALLAR la carga (test rojo, no skip). Meta-test que inyecta un `.st` sin frontmatter y comprueba que falla.
- **L6.D (negativos por fase):** cada negativo pasa solo si el runtime falla en la fase declarada con la `errorClass` esperada; fallo en otra fase o ausencia de fallo → rojo. Meta-test con fase real != declarada produce `status=fail`.
- **L6.E (trazabilidad bidireccional, diferida a corpus L1 verde):** `verifyTraceability` devuelve `ok=true`; CI falla si (i) una `DeviationEntry` no tiene >=1 test en `coveredBy` presente, o (ii) un test con `origin != spec-ANSI` no tiene `DeviationEntry`. Dos meta-tests (uno por sentido) deben dar `ok=false`.
- **L6.F (log sembrado):** el log `.md` contiene **>=10 entradas** el día 1 (semilla elevada por corrección de origen): `{ }`, `#[ ]`, `Object subclass:`, pragmas, metaclases reificadas, procesos, modelo Unicode/String, `#[ ]`→Array de SmallIntegers, **`collect:`/species (ingeniería/dialecto)**, **extensión Boolean F1 `ifTrue:`/`&`/`|`/`xor:` (ingeniería)**. (Adicionalmente, las desviaciones que aparecen al construir cada capa — nomenclatura `SequenceableCollection`, `Float/0`→ZeroDivide, home muerta→`BlockCannotReturn`, `resume` de no-resumable, `signalerContext` opaco — se añaden al alcanzar su capa; la semilla del día 1 son >=10.) Cada una con feature+decisión+origin+coveredBy+triangulación; `parseDeviationLog(log).length >= 10`.
- **L6.G (regla de avance CI):** el comando de conformidad devuelve exit 0 solo si el gate `§6.1` de la capa máxima entregada está verde; los gates de capas no implementadas se reportan `pending` (`skipped-by-design`), no `fail`.
- **L6.H (parametrización por capa):** añadir corpus de L3 (>=23 selectores `<Object>` + Boolean mínimo de `§6.1`) NO requiere cambios en el runner, solo nuevos `.st` con `layer=L3`; `discoverCases` los recoge y `registerCorpus` los ejecuta sin código nuevo.

**Artefacto de tests.** Corpus `.st` con frontmatter embebido (estilo `AT_DIFF_TEST`), en `conformance/<layer>/<spec-section>/<id>.st`, ejecutado por el runner Vitest (definido en L0/L1) que emite JUnit XML. El runner se autotestea (meta-tests): `parseFrontmatter` rechaza ausente/malformado; `runCase` distingue pass/fail/skipped-by-design en los tres modos; `verifyTraceability` detecta los dos sentidos de ruptura. El log de desviaciones vive como `.md` en `doc/research/`. **Este plan NO escribe estos artefactos en disco; los describe como entregable de implementación.**

**Riesgos.**
- **Dependencia de APIs no existentes (L1/L3):** el runner asume `parse()`/`evaluate()` estables. *Mitigación:* `RuntimeAdapter` como interfaz + adapter stub en L0; el corpus real se activa con L1 verde.
- Fragilidad de la igualdad de AST. *Mitigación:* `normalizeAst()` que descarta spans/IDs y ordena canónicamente; preferir igualdad de salida salvo donde `§6.1` exige AST.
- Oráculo de salida ambiguo en zonas *unspecified*. *Mitigación:* `skipped-by-design` con razón; nunca aserción de igualdad sobre *unspecified*.
- Drift del log vs corpus. *Mitigación:* `verifyTraceability` como gate CI (L6.E).
- Acoplamiento a Vitest (formato del reporter). *Mitigación:* tratar el XML como contrato + validar esquema; `CaseResult` independiente del reporter.
- Importar suites externas prematuramente. *Mitigación:* solo como referencia de QUÉ probar; parser de formatos externos diferido.
- Falsa sensación de conformidad. *Mitigación:* documentar alcance del corpus + caveat de cobertura incompleta; mantener la distinción tests-de-política (origen=ingeniería) vs tests-de-conformidad (origen=spec-ANSI).
- Licencia/procedencia de casos derivados ([INSUFFICIENT_EVIDENCE]). *Mitigación:* preferir casos derivados de la EBNF del Anexo A; registrar procedencia; decisión legal es humana.

**Dependencias.** L0 (runner básico, layout, convención de assets `.st`), L1 (corpus AT_DIFF_TEST + `parse()`), L3 (`evaluate()`). La verificación bidireccional se difiere hasta corpus L1 verde.

**Esfuerzo.** L.

---

## 6. Metodología spec-driven (esqueleto)

La conformidad de pandi-sm se gobierna por una disciplina *spec-driven* derivada del `§7` del research (ACATS/Test262/WebAssembly/JSCert + Hayes & Jones), implementada por el runner host (L0/L1) y formalizada por L6.

**6.0 Trazabilidad test↔spec.** Cada caso `.st` lleva frontmatter con `id`, `spec` (`anexoA:<producción>` o `ansiSection`), `origin`, `kind`, `phase`, `layer`. El runner parsea y valida; un test sin frontmatter válido FALLA (no se salta) — evita cobertura fantasma. Un script de cobertura cuenta tests por producción del Anexo A y falla si una producción del gate queda sin caso.

**6.1 Log de desviaciones.** Append-only en `doc/research/`, una entrada por desviación: `{ feature, decisión, origen (spec-ANSI|dialecto:Pharo|dialecto:Squeak|extensión-propia|ingeniería), coveredBy[testId], triangulación }`. Sembrado el día 1 con **>=10 entradas** (`{ }`, `#[ ]`, `Object subclass:`, pragmas, metaclases reificadas, procesos, Unicode/String, `#[ ]`→Array de SmallIntegers, **`collect:`/species (ingeniería/dialecto)**, **extensión Boolean F1 (ingeniería)**). Toda extensión `origin != spec-ANSI` debe estar en el log; toda entrada del log debe tener >=1 test (verificación bidireccional, L6.E).

**6.2 Positivos + negativos por fase.** Estilo WebAssembly (`assert_malformed`/`assert_invalid`/`assert_trap`) y Test262 (`negative.phase`): cada negativo declara la fase esperada de fallo (lex/parse/eval) y la clase de error; pasa solo si el runtime falla en esa fase. ANSI define categorías *Erroneous* que DEBEN rechazarse de forma determinista. **Distinción de origen:** los negativos que verifican comportamiento ANSI-*undefined*/*erroneous* (home muerta, `resume` de no-resumable) son tests de POLÍTICA con `origin=ingeniería`, no aserciones de conformidad ANSI (§8.3).

**6.3 Triangulación.** Cada divergencia se triangula con prosa de spec + test + dialecto-oráculo vivo (consultado manualmente, fuera de CI). Los puntos *unspecified*/implementation-defined se documentan como decisiones (`skipped-by-design` con razón citable), NUNCA como aserciones de igualdad (Hayes & Jones; lección JSCert: la suite no es oráculo infalible). Casos concretos de esta política: home muerta → `BlockCannotReturn` (ANSI-*undefined*, L3, origen=ingeniería), `resume` de no-resumable → Error concreto (ANSI-*erroneous*, L5, origen=ingeniería), `signalerContext` opaco (L5, sin aserción de igualdad), retornos *unspecified* de Stream (L4, prosa), `Float/0`→ZeroDivide (decisión §8.2, registrada como divergencia de IEEE). **El dialecto-oráculo se materializa además como harness diferencial ACTIVO (golden-master, §7): `gst` genera fixtures offline (+ job CI no-bloqueante de drift), Pharo triangula *unspecified* manualmente; cada caso etiqueta `oracle:` para no conflar conformidad-ANSI con paridad-de-dialecto.**

---

## 7. Estrategia de test por capa

**Harness host (Node/Vitest).** El runner descubre un corpus `.st`, lo evalúa contra las APIs públicas del runtime (`parse` de L1, `evaluate` de L3) y compara en **dos modos** replicando `AT_DIFF_TEST` de gst: (a) igualdad estructural de AST (modo parse, `JSON.stringify` canónico / `deepEqual` sobre `normalizeAst`); (b) igualdad de salida `printString` (modo eval). NO reimplementa el runtime: lo invoca vía `RuntimeAdapter`. **El runner básico vive en L0/L1**; L6 añade trazabilidad bidireccional.

**JUnit XML.** Toda suite emite `reports/junit.xml` (reporter `junit` de Vitest, versión fijada en lockfile), agrupado por layer y sección de spec, para que CI tenga checks de test desde el primer commit (espeja smalltalkCI / Pharo `--junit-xml-output`).

**SUnit nativo diferido.** Necesita clases (L2/L4) + excepciones (L5); se bootstrappea **solo después de L5 verde**, nunca antes. Hasta entonces el harness host lo sustituye.

**Harness diferencial (oráculo golden-master): `gst` primario + Pharo secundario** (decisión 2026-06-28). Además del oráculo-spec, pandi-sm usa un Smalltalk vivo como oráculo de RESULTADOS: **GNU Smalltalk (`gst`) headless** genera *golden fixtures* **offline** (`gst -r frag.st` → `.expected`, modelo `AT_DIFF_TEST`), versionadas en el repo; el gate de conformidad compara pandi-sm contra esas fixtures, **NUNCA contra un proceso Smalltalk vivo** (no se acopla CI a una imagen). Un job CI **separado y no-bloqueante** re-deriva las fixtures con el `gst` **pineado** y avisa de *drift*. **Pharo headless** es el oráculo **secundario**, para triangular manualmente los puntos ANSI *unspecified*/implementation-defined y la paridad de-facto. **Regla dura (lección JSCert):** cada caso diferencial etiqueta su oráculo en el frontmatter — `oracle: spec | dialecto:gst | dialecto:pharo` — para NO conflar conformidad ANSI (oráculo = spec) con paridad de dialecto (oráculo = Smalltalk vivo); heredar una extensión no-ANSI de Pharo (`{}`/`species`) como si fuera estándar sería el modo de fallo. Normalización obligatoria de `printString` (formato de floats, orden de `Set`/`Dictionary`, etc.) antes de comparar. Toda divergencia intencional pandi-sm-vs-oráculo se registra en el log de desviaciones (L6).

**7.1 Tabla de gates (mapeo §6.1 ↔ capa interna ↔ criterio binario):**

| Capa | Gate §6.1 | Criterio binario (mínimos) |
|---|---|---|
| L0 | — (pre-capa) | `ci`/`typecheck`/`build`/`test:ci` exit 0; `reports/junit.xml` bien formado (>=1 testsuite/testcase); Vitest fijado en lockfile; Node 20 en matriz |
| L1 | capa 1 | >=40 positivos (>=1/producción Anexo A) + >=15 negativos (incl. 2 de A.4); igualdad `JSON.stringify` canónica; rechazo determinista `code`+`span`; 100% `{ }`/`#[ ]` con `origin`, 0 ANSI con flag |
| L2 | capa 2 (object model) | 23 selectores `<Object>` (conteo==23, presencia + semántica de los que no requieren envío); cierre metacircular `classOf(classOf(X))===Metaclass` (>=6 clases); paralelismo + trampa; `nil` singleton; `basicNew`/`instVarAt:` 1-based; `identityHash` estable; **`3==3`/`$a==$a` true por valor** |
| L3 | capa 2 (evaluador) | send/self/super (>=8) + dNU (>=3) + bloques (>=6) + non-local return (>=5) + **Boolean mínimo (>=8 pos + >=1 neg)**; mecanismo `withUnwind`; home muerta → `BlockCannotReturn` (test de política, origen=ingeniería); bucles special-form §5.3.1 (`1 to: 1000000 do:` sin stack overflow) + límite de recursión informativo |
| L5 | capa 4 | **12 selectores** (conteo==12); >=20 positivos + >=6 negativos (incl. `resume` no-resumable señala Error — test de política origen=ingeniería — y orden inverso de unwind); ZeroDivide Integer capturable |
| L4 | capa 3 | F1-ext (origen=ingeniería) + F2..F6 + identidad + no-inlining + provenance; **GATE-L4-AGGREGATE >=62 positivos / >=4 negativos**; ZeroDivide Integer Y Float = ZeroDivide determinista (§8.2) |
| L6 | metodología §7 | L6.A–H; frontmatter obligatorio; negativos por fase; trazabilidad bidireccional; log **>=10 entradas** |

---

## 8. Riesgos, decisiones abiertas y gaps

**8.1 Licencia / política de derivación (BLOQUEANTE para distribución, gate humano NO-CI).** El research `§5`/`§9` marca licencia/derivación como [INSUFFICIENT_EVIDENCE] y **único riesgo explícitamente bloqueante**. Existe un LICENSE MIT placeholder, pero la POLÍTICA de derivación (gramática/selectores reconstruidos = bajo riesgo; copiar texto de la spec pagada / código con copyright = alto riesgo) NO está resuelta. **Gate de release explícito, por naturaleza NO CI-binario:** requiere decisión humana/legal; *no publicar/distribuir* hasta resolverla. No bloquea el spike, y se excluye del camino crítico de CI (clasificado como gate no-CI, §1).

**8.2 Float dividido por cero (DECISIÓN FIJADA — corrección de gap).** `Float / 0` da `Infinity` en JS, no excepción. La revisión señaló que dejar la elección abierta hacía GATE-F2-ZERODIVIDE no-binario (el implementador no sabría qué aserción escribir). **Decisión fijada: `Float / 0` señala ZeroDivide**, igual que `Integer / 0`, por **uniformidad de semántica Smalltalk**. La primitiva `Float>>/` chequea divisor cero antes de delegar a JS. La divergencia respecto a IEEE 754 (`Infinity`/`NaN`) se **registra como desviación** en el log (L6). Con esto GATE-F2-ZERODIVIDE es binario y sin ambigüedad: resultado esperado = ZeroDivide en Integer Y Float. (Coste de conformidad: se prioriza uniformidad Smalltalk sobre fidelidad IEEE; decisión consciente y registrada.)

**8.3 Comportamiento ANSI-*undefined*/*erroneous* tratado como POLÍTICA, no como conformidad (disciplina aplicada consistentemente).** ANSI declara *undefined* ejecutar `^` con home muerta (L3) y *erroneous* hacer `resume`/`resume:` sobre una excepción no-resumable (L5). En ambos casos pandi-sm ELIGE una política (L3 señala `BlockCannotReturn`; L5 señala un Error concreto). **Corrección (consistencia interna):** AMBOS casos se enrutan al log de desviaciones (L6) como **decisiones-de-implementación** sobre comportamiento ANSI-no-determinado (Hayes & Jones), con `origin=ingeniería`/desviación — NO como aserciones de conformidad `spec-ANSI`. El test sigue siendo binario (verifica la política elegida), pero su origen NO es spec-ANSI. *(La versión previa aplicaba esta disciplina a `BlockCannotReturn` de L3 pero la omitía para el caso análogo de `resume` de no-resumable en L5; ahora son consistentes.)*

**8.4 Megamorfismo / performance ([UNVERIFIED], sin benchmark — criterio NO-CI).** El `send()` genérico sobre objetos boxed de muchas familias puede caer en megamórfico en V8 y perder las ICs. Es riesgo de PERF, no de corrección; es un criterio de evidencia, NO un gate CI pass/fail. La inline cache propia está diferida a L-optim. *Mitigación:* shapes monomórficos de `STObject` + `tinyBenchmarks` propios antes de decidir la IC.

**8.5 Sección ANSI de excepciones [UNVERIFIED — verificar contra draft v1.9].** El número de sección exacto del contrato de excepciones en el draft v1.9 NO está verificado contra fuente primaria (la cita previa "§5.5" era inventada y se eliminó). El protocolo está respaldado como **[NORMATIVO] §4 T1 del research**; **candidato §8.5, a confirmar contra el draft antes de citarlo en el frontmatter de trazabilidad de L5.**

**8.6 Inventario ANSI de clases/selectores [UNVERIFIED §9].** La lista exacta de clases/selectores ANSI no está confirmada contra fuente primaria ejecutable. El subset de `§6.1` es el contrato operativo, tratado como **mínimo (no tope)**; triangular cada familia contra prosa ANSI + dialecto vivo.

**8.7 Prospectivo, sin código aún ([UNVERIFIED]).** Ninguna firma TS de este plan está validada contra una implementación real (el repo no tiene `src/`). Las firmas pueden requerir ajuste al primer contacto con el evaluador. *Mitigación:* construir el grafo mínimo y correr los gates de cierre temprano (baseline ejecutable primero).

**8.8 Benchmarks (criterio NO-CI).** `tinyBenchmarks` no son conformidad; viven en una capa de performance separada que se activa cuando los benchmarks pidan inline cache. Son criterios de evidencia/PERF, NO gates CI pass/fail. [UNVERIFIED] hasta medir.

**8.9 Nomenclatura `SequenceableCollection` vs `SequencedCollection` (corrección de deriva declarada).** El research §4/§6.1 usa `SequencedCollection`; este plan adopta **`SequenceableCollection`**, el nombre real en Pharo/Squeak (y el habitual en la literatura Smalltalk). Es una **elección de dialecto deliberada**, técnicamente correcta, pero un cambio respecto a la fuente que el plan dice transcribir; se declara explícitamente aquí (como se declaran las demás correcciones) y se registra en el log de desviaciones con `origin=dialecto:Pharo`. **[UNVERIFIED — confirmar que el research efectivamente escribe "SequencedCollection" y no es errata de la fuente.]**

**8.10 "species" en F3 es decisión de ingeniería/dialecto, NO contrato ANSI (corrección de origen).** La revisión señaló que GATE-F3 exige que `collect:`/`select:`/`reject:` devuelvan "la species apropiada" y lo etiquetaba `spec-ANSI`, pero **la palabra "species" no aparece en el research** y §6.1 capa 3 NO lista "species" ni "`collect:` → Array" como criterio. **Corrección:** el criterio de species se reetiqueta `origin=ingeniería/dialecto` (es la convención Pharo/Squeak de que `collect:` preserva la clase de colección, con Interval→Array como caso especial), se marca [UNVERIFIED] respecto a ANSI primario, y tiene entrada en el log de desviaciones. Si más adelante se localiza la sección ANSI primaria que lo respalda (Collection protocol), se reetiqueta a `spec-ANSI` citándola; hasta entonces NO se afirma como contrato ANSI.

**8.11 Extensión Boolean F1 sin origen en el research (corrección de origen).** Los selectores `ifTrue:`, `ifFalse:`, `ifFalse:ifTrue:`, `&`, `|`, `xor:` que gatea GATE-F1-BOOLEAN-EXT NO figuran en el research (que solo cita el mínimo `ifTrue:ifFalse:`/`and:`/`or:`/`not` en capa 2). **Corrección:** se marcan explícitamente `origin=ingeniería/extensión` y [UNVERIFIED] respecto a ANSI (igual que `{ }`/`#[ ]`), con entrada en el log de desviaciones. El gate sigue siendo binario (conteos >=6 pos + >=1 neg), pero verifica una EXTENSIÓN de dialecto, NO conformidad ANSI.

---

## 9. Definition of Done por capa y regla de avance

**Regla de avance (binaria, CI-verificable):** el gate de la capa N debe estar **verde en CI** antes de empezar N+1. El harness host emite JUnit XML que materializa cada gate. Cada capa solo mergea con su gate `§6.1` verde; los gates de capas no entregadas se reportan `pending`/`skipped-by-design`, **nunca `fail`**.

- **L0 — DoD:** `npm ci`+`typecheck`+`build`+`test:ci` exit 0 en checkout fresca; `reports/junit.xml` bien formado (>=1 testsuite/testcase); Vitest fijado en lockfile; Node 20 en matriz; carpetas `src/lexer`/`src/ast`/`test/` compilan; CI verde en push/PR. SIN este gate no se escribe el lexer.
- **L1 — DoD:** >=40 positivos (>=1/producción Anexo A) + >=15 negativos (incl. los 2 de A.4) verdes; igualdad estructural por `JSON.stringify` canónico; rechazo determinista `code`+`span`; 100% nodos `{ }`/`#[ ]` con `origin` y 0 ANSI con flag; trazabilidad por producción.
- **L2 — DoD:** 23 selectores `<Object>` presentes (conteo==23) + cierre metacircular `classOf(classOf(X))===Metaclass` (>=6 clases, incl. `Metaclass class class`); paralelismo + trampa; `nil` singleton; `basicNew`/`instVarAt:` 1-based; `identityHash` estable; lookup por superclass chain; `3==3`/`$a==$a` true por valor.
- **L3 — DoD:** send/self/super (>=8) + dNU (>=3) + bloques (>=6) + non-local return (>=5) + **Boolean mínimo (>=8 pos + >=1 neg)** verdes; mecanismo `withUnwind` corre en orden inverso; home muerta → `BlockCannotReturn` (test de política, origen=ingeniería, en el log); **GATE-L3-LOOP-SPECIALFORM** (bucles `whileTrue:`/`to:do:`/`repeat` iterativos; la condición señala si no es Boolean) + **GATE-L3-RECURSION-LIMIT** (`RangeError` de V8 mapeado a `Error` señalable; test de estrés informativo, no pass/fail) — §5.3.1. *(`ensure:`/`ifCurtailed:` como mensajes NO se gatean aquí.)*
- **L3.5 / KERNELLOAD — DoD (§5.4.0, prerequisito de L5):** GATE-KERNELLOAD-FORWARDREF + METACLOSURE (incl. trampa Object) + SUBCLASS-PRIM + TWOPASS-METHOD + ERRORS (≥3 negativos) verdes; cargar un kernel de ≥5 clases con ≥2 forward refs produce superclass chains correctas y cierre metacircular; conteo de gates KERNELLOAD **separado** del agregado de L4.
- **L5 — DoD (entra ANTES de L4):** **12 selectores** de capa 4 con semántica ANSI (conteo==12); >=20 positivos + >=6 negativos (incl. OBLIGATORIO `resume` no-resumable señala Error — test de política origen=ingeniería, en el log — y orden inverso `ensure:[b]` antes que `ensure:[a]`); MessageNotUnderstood cierra el lazo con dNU de L3. El único criterio diferido (cierre ZeroDivide) se valida cuando F2-Number esté verde.
- **L4 — DoD:** GATE-L4-PRECOND (L5-core verde); F1-ext (origen=ingeniería) + F2..F6 secuenciales, cada uno con sus mínimos; F2 cierra el ZeroDivide de L5 (**Integer Y Float = ZeroDivide**, §8.2); GATE-L4-NO-INLINING + GATE-L4-PROVENANCE (0 fuentes `.st` sin tag) obligatorios; **GATE-L4-AGGREGATE >=62 positivos / >=4 negativos** simultáneamente verdes en una corrida CI con JUnit XML.
- **L6 — DoD:** L6.A–H verdes; frontmatter obligatorio (falla-no-skip); negativos por fase; `verifyTraceability` bidireccional verde (diferido hasta corpus L1 verde); log de desviaciones con **>=10 entradas**. **Es gate CI permanente.**
- **SUnit nativo:** solo se bootstrappea DESPUÉS de L5 verde (necesita clases de L2/L4 + excepciones de L5); nunca antes.
- **Release/distribución:** gate humano explícito NO-CI — no distribuir hasta resolver la política de derivación de licencia (§8.1).

---

## 10. Próximos pasos

1. **Cerrar L0 (camino crítico).** Inicializar `package.json`+`tsconfig`+Vitest con reporter JUnit fijado en lockfile, matriz CI con Node 20, carpetas `src/lexer`/`src/ast`/`test/` y el `RuntimeAdapter` stub. Documentar las dos decisiones de modelo (Unicode/String, interning de Symbol) en `doc/research/`. Gate: cadena TS→Vitest→JUnit verde end-to-end.
2. **Encender el walking skeleton.** Implementar el slice vertical mínimo L1→L2→L3 que haga verde `eval("3 + 4 * 2") ⇒ 14` y el efecto de `Transcript show: 'hi'`, conducido por el runner host. Demuestra que las capas conversan antes de invertir en amplitud.
3. **Ensanchar L1 hasta su gate** (>=40 positivos / >=15 negativos, Anexo A verbatim) y sembrar el log de desviaciones (**>=10 entradas**, incl. species y extensión Boolean F1) en `doc/research/`.
4. **Cerrar L2 y L3** (cierre metacircular + 23 selectores; send/super/dNU/bloques/non-local return + Boolean mínimo), respetando la regla de avance; registrar la política de home muerta (origen=ingeniería) en el log.
5. **Cerrar L5 antes que L4** (contrato de excepciones sobre el unwind de L3, **12 selectores**), dejando el caso ZeroDivide para cerrarse retroactivamente con F2; registrar la política de `resume` de no-resumable (origen=ingeniería) en el log.
6. **Construir L4 por familias F1..F6** con sus sub-gates; `Float/0`→ZeroDivide (§8.2) ya decidido; registrar species, F1-ext, nomenclatura `SequenceableCollection` y `Float/0` como desviaciones.
7. **Formalizar L6** (trazabilidad bidireccional + `verifyTraceability`) una vez el corpus L1 está verde; bootstrappear SUnit nativo solo tras L5.
8. **Resolver (humano) la política de derivación de licencia** antes de cualquier distribución (§8.1); **confirmar contra el draft v1.9** los números de sección [UNVERIFIED]: excepciones (candidato §8.5, §8.5 del plan) y Stream Protocols (candidato §5.9) antes de citarlos en el frontmatter; confirmar también que el research escribe "SequencedCollection" (§8.9).
9. **Correr `tinyBenchmarks` propios** tras L3/L4 para decidir, con evidencia, si la inline cache propia (L-optim) se justifica (§8.4) — criterio de evidencia, no gate CI.
