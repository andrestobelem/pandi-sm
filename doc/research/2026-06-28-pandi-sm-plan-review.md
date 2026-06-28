# Plan review — pandi-sm: plan de implementación por capas

Date: 2026-06-28

> Procedencia: revisión adversarial por workflow. Run `wf_a32edbd4-25f` (29 agentes, ~1.97M tokens, ~21 min). **COBERTURA COMPLETA (7/7):** la 7ª dimensión, *Riesgo/estimaciones/realismo de alcance*, que había muerto por `API Error: Overloaded`, se **re-ejecutó** (run `wf_441b9a2e-9e7`, 7 agentes) y se incorpora en §9. No cambió el veredicto general ni añadió blocker/high. Solo se listan como hallazgos los confirmados/partially-confirmed tras verificación; los refutados van en un apéndice de transparencia con el motivo. Esta revisión incorpora una segunda pasada de auto-crítica editorial: se corrigieron una etiqueta de severidad apoyada en una premisa inventada (CI-2), una contradicción interna entre un fix y el apéndice (ANSI-1), dos fixes no accionables (SEQ-8, COMPL-3), seis ángulos materiales antes no evaluados (§7), y se añadió el inventario explícito de descartes (§8).

## 1. Veredicto general

**Sólido con cambios menores requeridos antes de codear.** El plan es arquitectónicamente correcto en sus decisiones de mayor riesgo (metacircularidad por mutación, object model plain-JS sin object table, non-local return por excepción etiquetada, secuenciación L5-antes-de-L4 con cierre retroactivo de ZeroDivide). La verificación adversarial NO encontró ningún defecto que invalide el plan ni que bloquee el merge: tras el ajuste de severidad del verificador, **no quedan hallazgos blocker ni high de corrección documental**. Sin embargo, esta pasada añade seis riesgos de **viabilidad de implementación** (§7) que el plan menciona pero no resuelve y que el reporte previo no había cruzado entre sí: dos de ellos (recursión sin TCO vs prohibición de inlining; resume: vs try/catch nativo) tocan la ejecutabilidad real del runtime y merecen una decisión explícita antes de L5.

Los defectos confirmados de documento son de tres tipos: (a) un bug latente de corrección numérica de fix trivial (frontera 2^53), (b) dos footguns de PERF en el hot path (Error en control-flow), y (c) un conjunto de imprecisiones de cita, conteo, etiquetado y especificación que conviene cerrar para que la trazabilidad y los gates binarios se sostengan. Recomendación: resolver los dos riesgos de viabilidad altos de §7 y aplicar los fixes medium antes de empezar L4/L5; los low/nit de forma oportunista.

Conteo por severidad (ajustada por el verificador, solo confirmed/partially-confirmed):

| Severidad | Hallazgos de documento | Riesgos de viabilidad (§7) |
|---|---|---|
| blocker | 0 | 0 |
| high | 0 | 2 |
| medium | 4 | 3 |
| low | 6 | 1 |
| nit | 1 | 0 |
| **Total** | **11** | **6** |

Cambios de severidad respecto a la versión anterior del reporte:
- **CI-2: confirmed → partially-confirmed** (la "permutación" se apoyaba en una convención de dirección de aristas que el plan nunca declara; el defecto real es la ausencia de leyenda — ver §2 nota y §3 CI-2). Se **fusiona con SEQ-5** (ambos son defectos del mismo grafo sin leyenda) y se **sube a medium** porque el grafo gobierna el orden de implementación y la regla de avance de CI.
- **ANSI-1: medium → low** (cita sin impacto en selectores/gates/semántica; fix de búsqueda-y-reemplazo). Su fix se corrige para NO eliminar el flag `[UNVERIFIED]` (ver §3 ANSI-1).

(Refutados al apéndice §6: 4 — SEQ-2, SEQ-4, ANSI-4, SECNUM-3. Inventario explícito de los ~14 hallazgos de dimensión NO re-verificados/descartados puros: §8.)

## 2. Hallazgos por severidad

> Nota de rigor sobre el grafo §3: el documento (L78-88) lista las aristas de dependencia **sin ninguna leyenda que declare la dirección semántica** de la flecha (ni "A → B = A depende de B" ni el inverso). La única pista de dirección es la prosa entre paréntesis dentro de las propias aristas (L84: "NO depende de L4"). En ausencia de leyenda, las etiquetas L4↔L5 NO son objetivamente "permutadas": son **ambiguas**. Por eso el defecto se reclasifica a partially-confirmed y el fix prioriza AÑADIR la leyenda.

| id | severidad (ajustada) | dimensión | sección | título | fix en una línea | veredicto |
|---|---|---|---|---|---|---|
| V8-1 | medium | Arquitectura Node/V8 | §2 tabla, 5.3, 5.4 F2, GATE-F2-NUMBER | Frontera de promoción a BigInt fijada en 2^53; el límite seguro real es 2^53−1 (corrupción entera silenciosa) | Usar Number.MAX_SAFE_INTEGER (2^53−1); chequear el resultado y rodear el límite por ambos lados en el gate | confirmed |
| V8-2 | medium | Arquitectura Node/V8 | 5.3 (NonLocalReturn), 5.5 (SignalException, L488) | Objetos de control-flow extienden Error: captura de stack en el hot path de todo `^` no-local y toda señal | Usar objetos JS planos (no extends Error), como JsSOM; nota de PERF en Riesgos + tinyBenchmark | confirmed |
| GRAPH-1 (CI-2 + SEQ-5) | medium | Consistencia interna / Secuenciación | §3 L78-88, §5.5 L510, §5.4 L602 | El grafo de dependencias NO declara la dirección de sus aristas; sin leyenda, las explicaciones L4↔L5 son ambiguas y faltan L0→L4/L0→L5 | AÑADIR leyenda de dirección al grafo; RECIÉN ENTONCES alinear las etiquetas L4↔L5 con §5.4/§5.5/L510/L602; completar L0→L4/L5 | partially-confirmed |
| COMPL-3 | medium | Completitud/diferidos | Encuadre L57, §5.1 L216-217/228, §5.4 L535/571, §5.5 L451 | Formato/loader de carga del kernel `.st` sin especificar; quién ejecuta `subclass:` desde `.st` no tiene dueño | Fijar el formato (un método/clase por archivo `.st` vía AST de L1 + API TS de L2) + criterio binario de conteo + entrada al log | partially-confirmed |
| SEQ-1 | medium | Secuenciación | §5.5 L451, §5.2 L304, §5.3 L364-381, §3 | Cómo se evalúa `Object subclass:` antes de L4 no está cerrado (ruta TS de L2 vs syntax-eval) | Declarar en §5.5 que L5 usa la API TS de construcción de L2; eliminar la prosa "Object subclass:..." | partially-confirmed |
| SEQ-3 | low | Secuenciación | §5.3 L368/418, §5.5 L451/494 | Gate L3 exige "dNU → MessageNotUnderstood" pero esa clase es de L5 (posterior) | Mover la aserción "dNU→MNU capturable" al gate de L5; en L3 solo "reifica Message + reenvía al hook" | partially-confirmed |
| SEQ-6 | low | Secuenciación | §5.3 L379/421, §5.4 L527/554, §5.2 L325 | Boolean mínimo gateado en L3 pero clases True/False/Boolean son de L4-F1 (propiedad ambigua de las clases portadoras) | Declarar que True/False/Boolean mínimas se bootstrapean en L2/L3; F1 solo extiende | partially-confirmed |
| SEQ-8 | low | Secuenciación | §5.6 L661/662, §5.0 L140 | verifyTraceability (post-L1) exigiría cobertura de entradas-semilla de capas aún no implementadas | Filtrar por el campo `layer` del frontmatter (ya existe en L6.A) ≤ "máxima capa verde" (flag de L6.G, ya existe); ver fix detallado | partially-confirmed |
| COMPL-2 | low | Completitud/diferidos | §5.4 L541, §5.2 L289 | El invariante =/hash nunca se gatea, pese a que `hash` está en los 23 selectores | Añadir gate a=b ⇒ a hash = b hash en F2/F5; entrada de log para Dictionary/Set diferidos | partially-confirmed |
| COMPL-1 | low | Completitud/diferidos | §4 L102-114, §5.2 L289, §5.4 F6 L533 | printString es el oráculo del harness pero no se declara su estrategia MVP (primitiva TS vs Stream) | Declarar printString como primitiva TS del MVP + entrada de log "no usa la clase Stream conforme" | partially-confirmed |
| ANSI-1 | low | Conformidad ANSI | §5.5 L446, §8.5 L730, nota revisión L7, §10 paso 8 | Sección ANSI de excepciones es §5.5, no el "candidato §8.5"; §5.5 fue retractada como "inventada" erróneamente | Cambiar §8.5 → §5.5 **manteniendo `[UNVERIFIED]`** hasta confirmar contra el TOC del draft v1.9 (fuentes verificadas son secundarias) | confirmed |
| F3-COUNT-1 / CI-1 | low | Verificabilidad de gates / Consistencia | §5.4 GATE-F3-COLLECTION L580; alcance L530 | GATE-F3-COLLECTION dice "(12 selectores)" pero enumera 11 (mismo bug 13→12 que la nota de revisión dice haber erradicado) | Alinear etiqueta a "(11)" o re-incluir `notEmpty`; unificar L530 vs L580 | confirmed |
| CI-5 / SEQ-7 | nit | Consistencia interna | §5.5 L442, §5.4 L516 | §5.5 (L5) aparece antes de §5.4 (L4); numeración fuera de orden puede leerse como errata | Nota al inicio de §5: "subsecciones en orden de implementación; el id numérico = id de capa" | confirmed |

> Nota de fusión: F3-COUNT-1 (verificabilidad) y CI-1 (consistencia) son el MISMO defecto verificado dos veces; se reportan en una sola fila. Igual CI-5/SEQ-7. **CI-2 y SEQ-5 se fusionan en GRAPH-1** (ambos son defectos del único grafo sin leyenda). El inventario completo de los ~14 hallazgos de dimensión no re-verificados (ANSI-2, ANSI-3, ANSI-5, ANSI-6, ANSI-8, COMPL-4, COMPL-5, COMPL-6, COMPL-8, L1-NEG-2, F5-AGG-4, L2L3-SPLIT-5, CI-3, CI-4) con su disposición individual está en **§8**, para no romper la disciplina de inventario explícito que el propio plan exige.

## 3. Detalle de hallazgos confirmados

### V8-1 (medium) — Frontera de promoción a BigInt fijada en 2^53; el límite seguro real es 2^53−1

- **Issue.** El plan fija la frontera de auto-promoción SmallInteger→BigInt en "2^53" (≥6 lugares). El máximo entero exacto en un double es `Number.MAX_SAFE_INTEGER = 2^53 − 1`. Si se promueve solo al superar 2^53 (p.ej. `> 2**53`), los enteros justo por encima de la cota segura se computan en `number`, redondean y devuelven resultados incorrectos sin error.
- **Evidencia/cita.** Plan §2 tabla: "auto-promoción a BigInt en overflow (frontera 2^53)"; §5.4 F2: "overflow de 2^53"; GATE-F2-NUMBER: "cruzando 2^53". MDN: `Number.MAX_SAFE_INTEGER` = 2^53 − 1 = 9007199254740991; `MAX_SAFE_INTEGER + 1 === MAX_SAFE_INTEGER + 2` evalúa true.
- **Fix concreto.** Redefinir la frontera como `Number.MAX_SAFE_INTEGER`/`MIN_SAFE_INTEGER` en `NumericOps.promoteOnOverflow` y en TODOS los criterios. Promover ANTES de perder precisión: detectar comparando el RESULTADO (no solo los operandos) contra `[-(2^53−1), 2^53−1]`. Añadir a GATE-F2-NUMBER casos que rodeen el límite por ambos lados: `2^53−1` (number, exacto), `2^53+1` (debe ser BigInt exacto), `(2^53−1)+2`, `(2^53−1)*2`. Documentar que la detección fiable de overflow de multiplicación exige chequear el resultado.
- **Razonamiento de verificación.** CONFIRMADO con fuente independiente (MDN). Pervasiva (≥6 sitios), no corregida en ninguna sección; el research la arrastra también. **Severidad ajustada high→medium**: es un documento de plan (no código), la promoción está centralizada en una función (fix de una línea) y GATE-F2-NUMBER ya apunta a la región del límite (aunque con un solo caso, sin rodearlo). Matiz: 2^53 SÍ es exactamente representable (potencia de 2); el que se corrompe es 2^53+1 y otros no representables por encima de la cota.
- **Fuentes.** MDN MAX_SAFE_INTEGER / MIN_SAFE_INTEGER; v8.dev/features/bigint.

### V8-2 (medium) — NonLocalReturn y SignalException extienden Error: captura de stack en el hot path

- **Issue.** El plan declara `class NonLocalReturn extends Error` (5.3, L411) y `class SignalException extends Error` (5.5, L488). En V8, construir un Error colecta el stack trace al crearse. El non-local return es el mecanismo NORMAL de retorno desde bloques (todo `^` dentro de do:/detect:/ifTrue:), y señalar es control-flow normal (cada dNU, cada ZeroDivide). Pagar la colección de stack en cada uno es un footgun de PERF acumulativo.
- **Evidencia/cita.** JsSOM (referencia citada por el plan) usa objeto plano: `export class ReturnException { ... }` sin `extends Error`. V8 docs: los errores capturan el stack al construirse. Regresión documentada (nodejs/node#11343): `Error.captureStackTrace` ~10x más lento entre versiones.
- **Fix concreto.** Para el control-flow interno usar objetos JS planos lanzados con `throw` (clase propia que NO extiende Error), como JsSOM. Para `instanceof` robusto, usar campo de marca (`isNonLocalReturn = true`) o Symbol de marca. Reservar Error/stack-capture solo para errores de programación del runtime. Añadir nota de PERF a 5.3/5.5 Riesgos y validar con los tinyBenchmarks.
- **Razonamiento de verificación.** CONFIRMADO al pie de la letra (citas del plan exactas; código de JsSOM verificado vía gh api; V8 y la regresión por fuente primaria). No mitigado en ninguna sección. **Severidad: se mantiene medium.** Matiz: V8 colecta el stack al construir pero lo FORMATEA perezosamente solo al leer `.stack` (que este camino nunca lee), así que el ~10x sobreestima el coste real; aun así la colección de N frames es coste innecesario que el fix elimina por completo. (Relacionado con §7-VIA-2: el `extends Error` de `SignalException` no es solo PERF — el modelo de handler "sobre el stack del signal vivo" es incompatible con el try/catch nativo de Error.)
- **Fuentes.** github.com/SOM-st/JsSOM (ReturnNonLocalNode.js); v8.dev/docs/stack-trace-api; github.com/nodejs/node/issues/11343.

### GRAPH-1 (medium, partially-confirmed) — El grafo de dependencias §3 no declara dirección de aristas; las etiquetas L4↔L5 son ambiguas y faltan L0→L4/L0→L5

- **Issue.** El grafo (L78-88) lista las aristas de dependencia pero NO incluye ninguna leyenda que declare la semántica de dirección de la flecha. Sin esa leyenda, las dos explicaciones entre paréntesis de las aristas que rompen la circularidad L4↔L5 (L83-86) NO pueden calificarse objetivamente como "permutadas": el lector no tiene un patrón canónico contra el cual medirlas. Además, el grafo dibuja L0→{L1,L2,L3,L6} pero omite L0→L4 y L0→L5, aunque ambas dependen del toolchain de L0.
- **Evidencia/cita.** L78-88: bloque de aristas sin leyenda (verificado: NO existe "A → B = ..." en el documento; búsqueda de "convención/leyenda/dirección/depende de" solo arroja la prosa interna de L84 y descripciones por capa en L510/L602). La prosa de las aristas L4↔L5 (L83-86) entra en tensión aparente con las listas de dependencias por capa: L510 "L4 solo para el caso de cierre ZeroDivide; la máquina de excepciones NO depende de L4" y L602 "Dependencias. L1, L2, L3, **L5** (GATE-L4-PRECOND)".
- **Fix concreto.** (1) **AÑADIR una leyenda de dirección de aristas** al grafo §3 (elegir y declarar una sola: p.ej. "X → Y significa: Y depende de X" o el inverso). (2) **Recién entonces** alinear las etiquetas de las aristas L5→L4 y L4→L5 con las fuentes load-bearing §5.4/§5.5/L510/L602 (la arista que porta GATE-L4-PRECOND debe ser la que dice "L4 no arranca hasta que el núcleo de L5 esté verde"; la otra, "solo el cierre ZeroDivide; el núcleo de L5 NO depende de L4"). (3) Completar L0→L4 y L0→L5, o anotar "las aristas son directas; L0 es prerequisito universal" (consistente con L0→L6).
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. La ausencia de leyenda es un hecho verificado contra L78-88. La afirmación previa del reporte de que las etiquetas estaban "permutadas bajo la convención A→B = B depende de A" se RETRACTA: esa convención fue una premisa inventada por el revisor, no del documento; el defecto objetivo es la ambigüedad por falta de leyenda. Las listas de dependencias por capa (L510/L602) y el camino crítico (L90) sí son internamente consistentes entre sí, así que el orden topológico no se ve afectado. **Severidad medium**: el grafo es el artefacto que gobierna el orden de implementación y la regla de avance de CI; una arista sin dirección declarada en ese artefacto es un defecto de claridad estructural de algo load-bearing, por encima de una cita sin impacto funcional (ANSI-1).

### COMPL-3 (medium, partially-confirmed) — Formato/loader de carga del kernel `.st` sin especificar

- **Issue.** El plan distribuye el kernel como "assets `.st` bootstrappeados desde fuente" (L57) pero nunca especifica QUÉ componente, en QUÉ capa, transforma un `.st` (con class-defs Y cuerpos de método) en clases/métodos instalados en el metamodelo de L2. `loadKernelSources(vm, sources)` (L571) es una firma sin contrato de entrada; `StSource = { selectorOrClassDef }` (L574) es un placeholder vago.
- **Evidencia/cita.** L216 (L1: semántica de `subclass:` "es L2") vs L304 (L2: "eso es L1/L3; L2 expone API TS") vs L280 ("L2 NO ejecuta sintaxis Smalltalk") — bucle de delegación. Interchange/chunk/fileIn diferidos (L217, L628). Ningún gate de carga del kernel.
- **Fix concreto (ahora con formato decidido).** DECIDIR el formato del mini-loader del MVP en lugar de ofrecer dos alternativas abiertas: **un método/clase por archivo `.st`, evaluado vía el AST de L1 + la API TS de construcción de L2** (`basicNew`/`addSelector:withMethod:`/`setClass`), explícitamente SIN chunk/Interchange Format. Asignarle dueño de capa (loader en L2/L3 que consume el AST de L1). Criterio de éxito **binario y por conteo**: "cargar el kernel produce exactamente N clases con M métodos instalados, verificado contando entradas del methodDict tras el load" (los N/M se fijan al enumerar el kernel mínimo). Entrada al log: "formato de carga del MVP ≠ Interchange Format ANSI".
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. El gap (contradicción L1↔L2, `StSource`/`loadKernelSources` sin contrato, sin gate de carga) es real y verificable. **Severidad ajustada high→medium**: el mecanismo base SÍ existe (API TS de L2: `STClass`, `addSelector:withMethod:`, `bootstrapKernel`); falta el "pegamento" y el formato decidido, no toda la infraestructura. El gap solo afecta L5 y L4 (L1/L2/L3 y el walking skeleton no dependen del kernel `.st`). El fix previo "definir un mini-loader (un método por archivo o DSL TS)" era tan abierto como el gap que denunciaba; aquí se fija el formato y un criterio binario de conteo para que sea accionable como gate.

### SEQ-1 (medium, partially-confirmed) — Cómo se evalúa `Object subclass:` antes de L4 no está cerrado

- **Issue.** L5 (L451) dice construir su jerarquía de excepciones "vía `Object subclass:...` en `.st`/kernel", pero la semántica de `subclass:` rebota entre capas sin aterrizar: L1 (L216) la pasa a "L2"; L2 (L304) la pasa a "L1/L3" y solo expone la API TS; L3 (L364-381) nunca la recoge.
- **Evidencia/cita.** L451: "Jerarquía núcleo en `.st`/kernel ... montada sobre L2 (`Object subclass:...`)". L304: "Definición de clases vía sintaxis ... eso es L1/L3; L2 expone la API TS de construcción". L3 alcance-in no menciona creación de clases.
- **Fix concreto.** Adoptar la opción (a): declarar en §5.5 que **L5 construye la jerarquía con la API TS de construcción de L2** (`basicNew`/`addSelector:withMethod:`/`setClass`) y eliminar la prosa "Object subclass:..." que sugiere evaluación de sintaxis. NO añadir primitiva `subclass:` ni arista L3→L5 (over-engineering para el MVP). (Converge con el formato decidido en COMPL-3.)
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. La inconsistencia de prosa es real, pero la CAPACIDAD de construir la jerarquía antes de L4 SÍ existe (API TS de L2; research L1076 la ubica en capa 2). El gate de L5 es alcanzable sin arista nueva. **Severidad ajustada high→medium**: defecto de consistencia/etiquetado documental, no bloqueo de gate ni dependencia faltante.

### SEQ-3 (low, partially-confirmed) — Gate L3 exige "dNU → MessageNotUnderstood" pero esa clase es de L5

- **Issue.** El gate CI-binario de L3 (L418) nombra "selector inexistente dispara dNU → MessageNotUnderstood" como resultado esperado, pero MessageNotUnderstood se construye en L5 (posterior a L3). No es chequeable en el merge de L3.
- **Evidencia/cita.** L418 (gate L3); L451 (MNU en MVP de L5); L494 (positivo #20 de L5: "MessageNotUnderstood capturable con on: MessageNotUnderstood do:").
- **Fix concreto.** Aplicar la disciplina ya usada para ensure:/ifCurtailed: (mecanismo en L3, contrato observable en L5): en L3 verificar solo que dNU reifica Message y reenvía al hook/placeholder; MOVER la aserción "dNU→MNU capturable" al gate de L5 (donde ya existe como positivo #20).
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. La fuga de verificabilidad en L3 L418 es real. **Severidad medium→low**: el plan ya resuelve el lazo en concepto (L330/L458/L484) y estableció la disciplina exacta del fix para ensure:/ifCurtailed:; lo único sin dueño limpio es la frase de L418, fix de una línea.

### SEQ-6 (low, partially-confirmed) — Propiedad ambigua de las clases portadoras True/False/Boolean

- **Issue.** El Boolean mínimo (ifTrue:ifFalse:, and:, or:, not) se gatea en L3 (L379/421), pero las clases True/False/Boolean tienen su dueño nominal en L4-F1 (L527/554/567). Para evaluar `true ifTrue:[...]` por `send value` en L3, `true`/`false` deben ser instancias de True/False con methodDict poblado — antes de F1.
- **Evidencia/cita.** L379 (Boolean mínimo en L3); L527/554 (F1 Boolean/nil); L325 (Universe lista `true_`/`false_` como referencias, no las clases).
- **Fix concreto.** Declarar que las clases True/False/Boolean mínimas (con singletons y los 4 selectores) se bootstrapean en L2/L3 como parte del Boolean mínimo, y que L4-F1 solo AÑADE la extensión (`ifTrue:`, `&`, `|`, `xor:`) sobre clases ya existentes.
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. Gap de etiquetado de propiedad real. **Severidad medium→low**: `true`/`false` SÍ se crean en L2 (L294) y el patrón "cáscara-en-L2 / métodos-en-L3" ya está documentado (skeleton L112); fix localizado.

### SEQ-8 (low, partially-confirmed) — verifyTraceability exigiría cobertura de capas aún no implementadas

- **Issue.** El log se siembra "el día 1" (L0/L1) con ≥10 entradas que incluyen desviaciones de capas aún no implementadas (species de F3/L4, Boolean F1/L4), pero `verifyTraceability` se difiere a "corpus L1 verde" (L661/L678) y exige cobertura bidireccional — fallaría sobre entradas de L4 sin tests todavía.
- **Evidencia/cita.** L662 (≥10 entradas sembradas el día 1, varias de capas L4); L661 (L6.E: CI falla si una `DeviationEntry` no tiene ≥1 test en `coveredBy`); L678 (verificación bidireccional diferida a corpus L1 verde).
- **Fix concreto (ahora con fuente de la "capa verde" especificada).** Hacer `verifyTraceability` capa-consciente filtrando por el campo `layer` del frontmatter (que **ya existe** en L6.A) contra una cota "máxima capa verde", obtenida del **flag/exit-code del comando de conformidad ya presente como L6.G** (no inventar una fuente nueva): solo se exige cobertura bidireccional para entradas con `layer ≤ máxima capa verde`; las semillas forward se marcan `pending`/exentas hasta que su capa entre. Para tests cross-capa (p.ej. un test de L5 que ejercita primitivas de L2): clasificarlos por el `layer` declarado en su frontmatter (el campo que ya gobierna el filtro), no por la capa más baja que tocan, de modo que un test cuente para su capa propietaria y no falsee la cobertura de capas inferiores.
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. La fuga es real (semillas de L4 sin tests bajo una verificación bidireccional). **Severidad low**: el log y el gate ya existen; es un ajuste de filtro. El fix previo ("hacer verifyTraceability capa-consciente") no decía de dónde sale la "capa máxima verde" ni qué pasa con tests cross-capa; aquí se anclan ambos a campos/flags que el plan ya define (L6.A `layer`, L6.G exit-code), para que sea implementable sin estructura nueva.

### COMPL-2 (low, partially-confirmed) — El invariante =/hash nunca se gatea

- **Issue.** `hash` está en los 23 selectores `<Object>` (L289) pero ningún gate aserta que `a=b ⇒ a hash = b hash`. L2 gatea identityHash estable y `==`; F5 gatea `=` de String por contenido; nadie gatea el invariante. Cuando lleguen Dictionary/Set (diferidos), serían incorrectos por construcción.
- **Evidencia/cita.** L541: Dictionary/Set/Bag/Association diferidos. `hash` en los 23 (L289). Ningún criterio (L329-339, L576-588) cubre el invariante. El log (L662) no tiene entrada para colecciones unordered diferidas.
- **Fix concreto.** (1) Añadir gate del invariante `=/hash` en F2/F5 (para los tipos donde `=` se redefine, `a=b ⇒ a hash = b hash`), aunque Dictionary/Set sigan diferidos. (2) Registrar el diferido de Dictionary/Set/Bag como entrada del log de desviaciones.
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. **Severidad medium→low**: el gate normativo de capa 3 del research (L796) NO incluye Dictionary/Set/Bag, así que el plan ESTÁ alineado al diferirlas; deuda preventiva, sin riesgo de corrección presente. (Relacionado con §7-VIA-4: el `hash` de inmediatos vs boxed tiene además un problema mecánico con WeakMap que este gate destaparía.)

### COMPL-1 (low, partially-confirmed) — Estrategia de printString del MVP no declarada

- **Issue.** printString es el oráculo del harness desde el walking skeleton (L102, L114, L161, L700) y uno de los 23 selectores de L2 (L289). En Smalltalk canónico printString delega en `printOn: aStream`, y Stream es F6 (la última familia de L4, posterior a L5). El plan no declara cómo printString produce '14' sin Stream.
- **Evidencia/cita.** L102: "El harness compara printString del SmallInteger resultante === 14". L533: F6 Stream es la última familia de L4 (camino crítico L90 la pone tras L5).
- **Fix concreto.** Declarar printString como **primitiva TS del MVP** (devuelve String directamente, sin la clase Stream reificada), con `printOn: aStream` "real" diferido a F6, y añadir entrada al log de desviaciones ("printString del MVP no usa la clase Stream conforme").
- **Razonamiento de verificación.** PARCIALMENTE CONFIRMADO. Los hechos son exactos, pero la inferencia de "circularidad de bootstrap" es errónea: ANSI especifica printString por comportamiento observable (devolver String), no por estrategia interna (research L185-187). Una primitiva TS es plenamente conforme. **Severidad high→low**: los medios ya existen (kernel mixto, primitivas TS por selector); el residuo es declarar la estrategia + sembrar el log.

### ANSI-1 (low) — La sección ANSI de excepciones es §5.5, no el "candidato §8.5"; pero la verificación es contra fuentes secundarias

- **Issue.** El plan marca la sección ANSI de excepciones como `[UNVERIFIED — candidato §8.5]` (L446, L730, L771) y la nota de revisión (L7) afirma que una cita previa "§5.5" era "inventada" y la reemplazó por el candidato §8.5. El número §8.5 es casi con certeza incorrecto y la retracción de "§5.5" fue probablemente errónea.
- **Evidencia/cita.** Plan L730: "candidato §8.5, a confirmar contra el draft". Mirror HTML independiente (math.rsu.ru/.../chapter5-4.html.en) y un PDF indexado (standard_v1_9-indexed.pdf) convergen en "5.5 Exception Protocols" (con `<exceptionDescription>`/`<exceptionSignaler>`/`<signaledException>`: resume/return/retry/pass) y "5.4 Valuable Protocols" (on:do:/ensure:/ifCurtailed:) como secciones distintas.
- **Fix concreto (corregido para preservar spec-first).** Reemplazar el candidato §8.5 por **§5.5**, pero **MANTENER el flag** como `[UNVERIFIED — §5.5, PENDIENTE-TOC-v1.9]`, citando como evidencia el mirror math.rsu.ru y el PDF indexado, **hasta confirmar contra el índice (TOC) del draft v1.9 que el plan declara como fuente primaria**. NO borrar el `[UNVERIFIED]` (el fix anterior ordenaba quitarlo, lo que reintroduciría como autoritativo un número verificado solo contra fuentes secundarias — contradice la propia disciplina spec-first del plan y entra en conflicto con la refutación de ANSI-4 en el apéndice). Borrar la afirmación de la nota de revisión (L7) de que "§5.5 era inventada" (probablemente era correcta). Mapear on:do:/ensure:/ifCurtailed: → §5.4 con el mismo flag pendiente.
- **Razonamiento de verificación.** CONFIRMADO que §8.5 es incorrecto y que §5.5 es el candidato correcto, **pero la verificación se apoya en un mirror HTML secundario y un PDF indexado, NO en el TOC del draft v1.9 que el plan cita como fuente primaria**. Por eso el flag debe mantenerse. **Severidad ajustada medium→low** (rebajada respecto a la versión previa): es un defecto puramente de número-de-sección, sin impacto en selectores, gates ni semántica (el comportamiento del protocolo en el plan ES correcto). Un fix de búsqueda-y-reemplazo, por debajo de defectos de claridad estructural del grafo load-bearing (GRAPH-1).
- **Fuentes.** math.rsu.ru/smalltalk/standard/chapter5-4.html.en; standard_v1_9-indexed.pdf. (Pendiente: TOC del draft v1.9 primario.)

### F3-COUNT-1 / CI-1 (low) — GATE-F3-COLLECTION dice "(12 selectores)" pero enumera 11

- **Issue.** La lista del gate (L580) tiene 11 selectores pero la etiqueta dice "(12 selectores)". Mismo patrón conteo-vs-enumeración que la nota de revisión (L7) afirma haber erradicado para excepciones (13→12).
- **Evidencia/cita.** L580: `do: collect: select: reject: detect: detect:ifNone: inject:into: size isEmpty includes: add:` (= 11) etiquetado "(12 selectores)". L530 incluye además `notEmpty` (= 12). Research §6.1 L796 lista 11 (sin `notEmpty`).
- **Fix concreto.** Unificar L530 ↔ L580: o (a) etiqueta "(11 selectores)" sin `notEmpty` (alineado con research §6.1), o (b) re-incluir `notEmpty` en L580 para llegar a 12, marcándolo como extensión si no está en el research. Aclarar que `detect:ifNone:` con bloque de ausencia es un caso de test, no un selector extra (separar conteo-de-selectores de conteo-de-positivos).
- **Razonamiento de verificación.** CONFIRMADO por conteo programático; no reconciliado. **Severidad medium→low**: el pass/fail operativo es ">=12 POSITIVOS" (casos de test, no selectores) y el "12 (F3)" del AGGREGATE se refiere a esos positivos, así que 62/4 NO se rompe.

### CI-5 / SEQ-7 (nit) — Numeración de subsecciones fuera de orden

- **Issue.** El orden físico de §5 es 5.0, 5.1, 5.2, 5.3, luego 5.5 (L5) y DESPUÉS 5.4 (L4), para reflejar el camino crítico L3→L5→L4. Un lector que escanee por número ve 5.3 → 5.5 → 5.4 y puede leerlo como errata.
- **Fix concreto.** Nota de una línea al inicio de §5: "las subsecciones se presentan en ORDEN DE IMPLEMENTACIÓN (L0,L1,L2,L3,L5,L4,L6); la numeración 5.4/5.5 conserva el id de capa deliberadamente".
- **Razonamiento de verificación.** CONFIRMADO; mitigado por los encabezados existentes ("Entra ANTES/DESPUÉS"). Nit de presentación.

## 4. Fortalezas del plan (qué NO tocar)

- **Metacircularidad por mutación (setClass).** Cierra `Metaclass class class == Metaclass` y el paralelismo `X class superclass == X superclass class`; corroborada en JsSOM (Universe.js).
- **Object model plain-JS sin object table + reuso del GC de V8.** Correcta y corroborada; diferir become:/allInstances es coherente.
- **Non-local return por excepción etiquetada con identidad de home + detección de home muerta en finally.** Coincide con JsSOM (ReturnException + hasReachedTarget + dropFromStack); withUnwind() compartido L3↔L5. (Ajustes: V8-2 no heredar de Error; ver §7-VIA-2 para el matiz de resume: sobre el stack vivo.)
- **Dispatch send() genérico por cadena de clases (Map selector→método) primero, IC propia diferida.** Secuenciación correcta; megamorfismo tratado como riesgo de PERF, no de corrección.
- **Interning de Symbol con tabla propia (≠ Symbol de JS), identidad `==` disponible antes del dispatch.** Correcto; SymbolTable funcional entregada a L2 (skeleton paso 3) — el grafo NO tiene dependencia hacia atrás L2→L4 (ver apéndice SEQ-2).
- **Igualdad/identidad sobre inmediatos (3==3, $a==$a true por valor) como criterio binario en L2/L4.** Cierra un gap real del contrato de identidad de SmallInteger/Character. (Caveat: la igualdad es sólida, pero la ESTRATEGIA de `identityHash` propuesta vía WeakMap es mecánicamente incompatible con inmediatos — ver §7-VIA-4; esto NO invalida el criterio de igualdad, solo el medio de hash.)
- **Maniobra L5-antes-de-L4 con cierre retroactivo acotado de ZeroDivide.** Sólida; la circularidad L4↔L5 se reduce a una arista real más un cierre diferido binario. (Caveat de entrega, no de corrección: alarga el camino crítico — ver §7-VIA-5.)
- **Walking skeleton recortado a L0→L1→L2→L3 con `eval("3 + 4 * 2") ⇒ 14`.** Primer test verde válido y fuerte: discrimina la trampa de precedencia (3+(4*2)=11 sería el error); precedencia plana izquierda-a-derecha (ANSI A.2 §3.4.5.3).
- **Conteos centrales exactos.** 23 selectores `<Object>` y 12 de excepciones coinciden verbatim con research §6.1; corrección 13→12 real. GATE-L4-AGGREGATE autoverificable (6+15+12+8+10+6+5 = 62 positivos, 1+2+1 = 4 negativos). (Caveat: el ORÁCULO de esos conteos —el parser del JUnit XML— es frágil; ver §7-VIA-6.)
- **Distinción CI-binario vs no-CI y tests-de-política vs tests-de-conformidad.** Disciplina Hayes & Jones aplicada consistentemente.
- **Regla de avance operativa y binaria** ("gate N verde antes de N+1", JUnit XML, exit-code en L6.G); degradación del runner host a L0/L1 que rompe el ciclo runner↔L1.
- **Inventario de diferidos explícito y honesto por capa, con etiqueta de origen**, casi 1:1 con el research.
- **Etiquetado de origen disciplinado y mayormente correcto** (species, extensión Boolean F1, SequenceableCollection, Float/0→ZeroDivide, copy shallow, home muerta — reclasificados como NO-ANSI).

## 5. Cambios recomendados al documento del plan (lista priorizada y accionable)

**Prioridad 0 — viabilidad de implementación (decidir ANTES de codear L5; ver §7):**

0a. **§7-VIA-1 (recursión sin TCO vs GATE-L4-NO-INLINING).** Cruzar explícitamente la decisión "sin inlining" con el límite de stack de V8: documentar el límite real de profundidad y, si se desea evitar RangeError en bucles largos triviales (`whileTrue:`, `to:do:`), decidir si se permite un trampoline/bucle interno para los selectores de control de flujo SIN romper la prohibición de inlining (que es sobre conformidad, no sobre la estrategia de ejecución del bucle). Como mínimo, elevar el riesgo de L432 a "evaluado" y declarar la cota.
0b. **§7-VIA-2 (resume: vs try/catch nativo).** Declarar en §5.5 que la búsqueda de handler NO usa try/catch nativo ingenuo, sino una **pila de handlers propia recorrida en el throw-site**, porque `resume:` requiere ejecutar el handler sobre el stack del signal vivo (L488) — antes de desenrollar. (Refuerza V8-2: `SignalException` no solo no debe extender Error por PERF, sino que el modelo de captura no puede apoyarse solo en `catch`.)

**Prioridad 1 — corrección (aplicar antes de codear F2/L4-L5):**

1. **V8-1.** "frontera 2^53" → `Number.MAX_SAFE_INTEGER (2^53−1)` en §2, §5.3, §5.4 F2, GATE-F2-NUMBER. Comparar el RESULTADO contra `[-(2^53−1), 2^53−1]`. Añadir casos que rodeen el límite por ambos lados.
2. **V8-2.** Redefinir `NonLocalReturn` y la señal interna como objetos JS planos (no `extends Error`), con campo de marca o Symbol. Nota de PERF a Riesgos §5.3/§5.5 + tinyBenchmark.
3. **§7-VIA-3 (BigInt en JSON.stringify del harness de L1).** Cambiar el gate de igualdad estructural de L1 (L252) para que NO use `JSON.stringify` desnudo sobre ASTs cuyo `Token.value` puede ser `bigint` (L236): usar un `deepEqual` BigInt-aware o un replacer que serialice BigInt como string canónica. Añadir un fixture L1 con un entero > 2^53 (`value` bigint poblado) para que el propio gate ejercite el caso.
4. **§7-VIA-4 (identityHash de inmediatos vs WeakMap).** Reconciliar la estrategia de hash de L291: **WeakMap NO admite claves primitivas**, así que un SmallInteger/Character/Symbol nativo no puede ser clave. Declarar dos rutas: `identityHash` **por valor** para inmediatos (consistente con `3==3 true` de L336) y `identityHash` **vía contador/WeakMap** solo para objetos boxed. Cubrirlo en GATE-L4-IDENTITY (L584).

**Prioridad 2 — especificación/secuenciación (cierra ambigüedades de L4/L5):**

5. **COMPL-3.** Fijar el formato del mini-loader del kernel `.st`: un método/clase por archivo vía AST de L1 + API TS de L2, sin chunk/Interchange; capa dueña (L2/L3); criterio binario de conteo (N clases, M métodos instalados); entrada de log "formato MVP ≠ Interchange Format ANSI".
6. **SEQ-1.** En §5.5, declarar que L5 construye su jerarquía con la API TS de L2; eliminar la prosa "Object subclass:..." (converge con COMPL-3).
7. **COMPL-1.** Declarar printString como primitiva TS del MVP (devuelve String, sin Stream reificado); diferir `printOn: aStream` real a F6; sembrar log.
8. **COMPL-2.** Añadir gate `a=b ⇒ a hash = b hash` en F2/F5; entrada de log para Dictionary/Set/Bag diferidos (coordinar con VIA-4: el invariante debe valer tanto para inmediatos como para boxed).
9. **SEQ-6.** Declarar que True/False/Boolean mínimas se bootstrapean en L2/L3; F1 solo extiende.
10. **SEQ-3.** Mover "dNU → MessageNotUnderstood capturable" del gate de L3 al de L5; en L3 dejar solo "reifica Message + reenvía al hook".

**Prioridad 3 — trazabilidad/consistencia (saneamiento de documento):**

11. **GRAPH-1 (CI-2 + SEQ-5).** AÑADIR leyenda de dirección de aristas al grafo §3; recién entonces alinear las etiquetas L5→L4 / L4→L5 con §5.4/§5.5/L510/L602; completar L0→L4 y L0→L5 (o nota "aristas directas; L0 prerequisito universal").
12. **ANSI-1.** Cambiar "candidato §8.5" → §5.5 (Exception Protocols) y §5.4 (Valuable Protocols), **manteniendo el flag** `[UNVERIFIED — PENDIENTE-TOC-v1.9]` hasta confirmar contra el índice del draft v1.9; borrar la afirmación (L7) de que "§5.5 era inventada".
13. **F3-COUNT-1 / CI-1.** Alinear GATE-F3-COLLECTION: etiqueta "(11 selectores)" o re-incluir `notEmpty`; unificar L530 ↔ L580; separar conteo-de-selectores de conteo-de-positivos.
14. **SEQ-8.** Hacer `verifyTraceability` capa-consciente filtrando por el `layer` del frontmatter (L6.A) ≤ máxima capa verde (flag de L6.G); regla cross-capa: clasificar el test por su `layer` declarado.
15. **§7-VIA-6 (oráculo JUnit XML frágil).** Añadir, además del pin de versión (L170/L183), una aserción que valide la FORMA del XML (presencia de los campos que los conteos leen) y/o un caso-canario con conteos conocidos, para que un cambio de schema del reporter entre majors falle ruidosamente en vez de devolver verde/rojo-falso.
16. **CI-5 / SEQ-7.** Nota al inicio de §5: subsecciones en orden de implementación, id numérico = id de capa.

**Cierres de `[UNVERIFIED]` ya resolubles (saneamiento de bajo riesgo, recogidos de hallazgos de dimensión — disposición individual en §8):**

17. **ANSI-2 / CI-3.** Cerrar el `[UNVERIFIED]` de §8.9: ANSI v1.9 escribe `<sequencedCollection>` (§5.7.12); `SequenceableCollection` es el nombre Pharo/Squeak; el research escribe "SequencedCollection". Mantener la decisión de dialecto.
18. **ANSI-3.** Cerrar el `[UNVERIFIED]` de §5.9: Stream Protocols = ANSI §5.9 (File Stream = §5.10, diferido).
19. **CI-4.** Desambiguar el token "§8.5": "§8.5 del plan" vs "§x.y del draft ANSI" (que es §5.5; ver ANSI-1).
20. **ANSI-5 / ANSI-7.** En el frontmatter de L5, mapear on:do:/ensure:/ifCurtailed: → §5.4 y signal../resume/return/retry/pass → §5.5 (con flag pendiente-TOC); precisar que el rótulo del log "jerarquía Error/Warning de-facto" debe decir "anidamiento concreto (p.ej. ArithmeticError→ZeroDivide) de-facto".
21. **L1-NEG-2.** Añadir un 15º negativo concreto a L1 (p.ej. `#[` sin cerrar) o bajar el mínimo a ">=14" alineando la enumeración.

## 6. Apéndice — hallazgos refutados

- **SEQ-2 (refutado, era high).** "Dependencia hacia atrás L2→L4 por el interning de Symbol". REFUTADO: el plan SÍ entrega una SymbolTable funcional a L2 antes de L4 — skeleton paso 3, `bootstrapKernel(symbols: SymbolTable)` (L324/346), interface `SymbolTable { intern }` desde L0 (L110). Las aristas §3 NO contienen L2→L4 hacia atrás. F0/F5 de L4 solo REIFICAN como clase kernel algo que ya existe como infra TS. Residuo (nit): nota que cristalice "infra-TS vs clase-kernel".
- **SEQ-4 (refutado, era medium).** "El plan no afirma que ArithmeticError esté en el MVP de L5". FÁCTICAMENTE INCORRECTO: L451 escribe "ArithmeticError→ZeroDivide" en el MVP mínimo de L5; repetido en L83 y L459. La captura por subtipo se valida en L5 (positivo #2) y `on: ArithmeticError do:` aparece en L496 y GATE-F2-ZERODIVIDE L587. Residuo (nit): el positivo #2 dice "subtipo (isKindOf:)" genérico en vez de nombrar ArithmeticError.
- **ANSI-4 (refutado, era medium).** "L5 borra el número de sección ANSI verificable e invierte la jerarquía de evidencia". REFUTADO en su acusación de "borrado": el plan trató la cita previa "§5.5" como inventada y la sustituyó por `[NORMATIVO] research §4 T1` + `[UNVERIFIED candidato §8.5]` — disciplina spec-first, no borrado. Matiz importante: §5.5 SÍ era correcta (lo cubre ANSI-1) **pero la corrección debe MANTENER el flag, no eliminarlo** — el fix corregido de ANSI-1 (§5, punto 12) es ahora consistente con esta refutación (la versión previa del reporte se contradecía aquí). Sobre `signalOn:`: el plan YA lo agrupa bajo SystemExceptions = extensión Pharo/Squeak (L451/467). Residuo (nit): anotar `outer`/`resignalAs:`/`isNested` como "ANSI-normativo, diferido".
- **SECNUM-3 (refutado, era medium).** "Gates de L5/F6 cuelgan de números de sección ANSI [UNVERIFIED], debilitando la trazabilidad binaria". REFUTADO: (a) premisa falsa — el research SÍ da el número de Stream (§5.9/§5.10); solo §8.5 (excepciones) es no respaldado; (b) la trazabilidad del gate L5 ancla al SELECTOR y a "research §6.1 línea 797", NO al número de sección; (c) `ansiSection` es opcional (L646) y el plan prohíbe citar un número [UNVERIFIED] en frontmatter antes de confirmarlo (L533/L730/L771). Residuo (nit): sub-criterio binario en L6 ("ningún `.st` cita una sección ANSI UNVERIFIED sin flag").

## 7. Riesgos de viabilidad de implementación (ángulos no evaluados en la pasada anterior)

> Estos seis puntos NO son defectos de cita/conteo: son tensiones entre decisiones del plan y la mecánica real de V8/JS que el plan menciona pero no resuelve. Verificados contra líneas concretas del documento.

### VIA-1 (high) — Recursión JS sin TCO vs la prohibición de inlining (GATE-L4-NO-INLINING)

En Smalltalk el control de flujo (`whileTrue:`, `to:do:`, recursión) se implementa por envío de mensajes. El plan PROHÍBE explícitamente el inlining de estos selectores (GATE-L4-NO-INLINING, decisión correcta para conformidad), pero el evaluador es tree-walking: sin inlining, cada iteración añade frames JS. Un programa Smalltalk trivial con un bucle suficientemente largo desbordará el stack de V8 (`RangeError: Maximum call stack size exceeded`) ANTES de cualquier consideración de PERF. El plan menciona la recursión sin TCO solo en Riesgos (L432) con la mitigación "documentar límite, no resolver en MVP", y NUNCA la cruza con GATE-L4-NO-INLINING. La decisión "sin inlining" (conformidad) choca con la viabilidad del runtime, y ese cruce está sin evaluar. **Fix:** §5, punto 0a — decidir si los selectores de control de flujo se ejecutan con un bucle/trampoline interno (que NO es inlining ANSI-observable) o si se acepta y documenta una cota de profundidad como límite conocido del MVP.

### VIA-2 (high) — `resume:` requiere ejecutar el handler sobre el stack del signal vivo; el try/catch nativo no basta

El plan toma una decisión clave de L5 (L477): "ejecutar el handlerBlock ANTES de desenrollar", marcada como "la pieza más delicada de L5", y describe `signal(...)` ejecutando el handler "sobre el stack del signal vivo" (L488). Pero en JS, cuando un `catch` corre, la pila YA se desenrolló. Implementar `resume:` exige que la búsqueda de handler NO use try/catch nativo ingenuamente, sino una **pila de handlers propia recorrida en el throw-site** (antes de lanzar). El reporte previo elogiaba try/catch como base sólida (§4) sin señalar que `resume:` es precisamente el caso donde el try/catch nativo NO alcanza — el riesgo de implementación más profundo de L5, que el propio plan marca como el más sutil. **Fix:** §5, punto 0b — declarar la pila de handlers propia explícitamente. Refuerza V8-2.

### VIA-3 (medium) — `JSON.stringify` del gate de L1 lanza TypeError sobre `Token.value` BigInt

El gate de igualdad estructural de L1 es `JSON.stringify(astToJSON(parse(src))) === JSON.stringify(fixture)` (L252). El lexer emite `Token.value: number|bigint` (L236), y `JSON.stringify` LANZA `TypeError` sobre un BigInt. En cuanto un fixture incluya un entero > 2^53 con `value` bigint poblado, el gate de L1 se rompe — no por un AST incorrecto, sino por el serializador del harness. El reporte previo auditó el límite 2^53 para aritmética (V8-1) pero no para la serialización de fixtures del propio harness. **Fix:** §5, punto 3 — `deepEqual` BigInt-aware o replacer que serialice BigInt como string canónica; fixture L1 con entero grande.

### VIA-4 (medium) — `identityHash` vía WeakMap es incompatible con inmediatos

El plan exige `3==3 true por valor` e `identityHash` estable (L336, L584) y propone `identityHash` "vía contador/WeakMap" (L291). Pero **WeakMap no admite claves primitivas** (number/string): un SmallInteger/Character/Symbol nativo no puede ser clave de WeakMap. El plan necesita una ruta de hash por VALOR para inmediatos y otra vía WeakMap para objetos boxed, y nunca las concilia. El reporte previo elogiaba "igualdad sobre inmediatos" como fortaleza sin notar la incompatibilidad mecánica con la estrategia de hash propuesta. **Fix:** §5, punto 4 — dos rutas de `identityHash` (valor para inmediatos, WeakMap para boxed), cubiertas en GATE-L4-IDENTITY.

### VIA-5 (medium) — El camino crítico serial concentra todo el riesgo y retrasa el primer programa "real"

El camino crítico es `L0→L1→L2→L3→L5→L4` (L90), L4 está estimado XL y depende de L5, y el walking skeleton solo cubre L0-L3 (L96-98). La maniobra L5-antes-de-L4 (correcta para corrección) ALARGA el camino crítico antes de tener cualquier biblioteca base utilizable: concentra el riesgo de implementación en una sola cadena serial sin paralelización posible, retrasando el primer programa Smalltalk "real" (con colecciones/aritmética de L4) ejecutable. Es un riesgo de SECUENCIACIÓN DE ENTREGA, no de corrección — el plan lo elogia por correcto sin comentar el coste de calendario. **Fix:** considerar un sub-skeleton intermedio que ejercite un slice mínimo de L4-F2 (aritmética) en paralelo conceptual con el núcleo de L5, o declarar explícitamente que no habrá programa "real" ejecutable hasta cerrar L4, como expectativa de calendario.

### VIA-6 (medium) — El parser del JUnit XML de Vitest es un single point of failure de toda la regla de avance

TODOS los gates binarios anclan a la forma del JUnit XML de Vitest (conteos de `testcase`, agrupación por layer/sección), y los gates que cuentan positivos/negativos (≥62, ≥20, etc.) LEEN ese XML. La mitigación del plan es solo "versión fijada en lockfile" (L170/L183). Pero si Vitest cambia el schema del reporter entre majors, los gates se vuelven verde-falso o rojo-falso SILENCIOSAMENTE: el oráculo de los conteos (el parser del XML) es frágil. El reporte previo verificó la aritmética de los conteos (62/4) pero no el riesgo de que el ORÁCULO de esos conteos falle. **Fix:** §5, punto 15 — aserción de FORMA del XML + caso-canario con conteos conocidos, para que un cambio de schema falle ruidosamente.

## 8. Apéndice-inventario — hallazgos de dimensión NO re-verificados (disposición explícita)

> Para no romper la disciplina de inventario explícito que el plan defiende (y que la versión previa del reporte violaba al decir "recogidos cuando aportan acción" sin listar los descartes): cada hallazgo de dimensión de la primera pasada, con una línea de disposición. Los 4 refutados van en §6.

| id | dimensión | disposición | motivo |
|---|---|---|---|
| ANSI-2 / CI-3 | Conformidad ANSI | recogido en §5 punto 17 | cierre de [UNVERIFIED] §8.9; `<sequencedCollection>` confirmado, decisión de dialecto válida |
| ANSI-3 | Conformidad ANSI | recogido en §5 punto 18 | cierre de [UNVERIFIED] §5.9 Stream; confirmado, sin defecto |
| ANSI-5 / ANSI-7 | Conformidad ANSI | recogido en §5 punto 20 | mapeo §5.4/§5.5 en frontmatter + precisión de rótulo de log; acción menor |
| ANSI-6 | Conformidad ANSI | descartado (informativo) | el plan ya maneja la dimensión como disciplina madura; sin acción incremental |
| ANSI-8 | Conformidad ANSI | descartado (informativo) | matiz de etiquetado ya cubierto por el log de desviaciones del plan |
| CI-4 | Consistencia interna | recogido en §5 punto 19 | desambiguar "§8.5 del plan" vs "§x.y del draft"; acción de redacción |
| COMPL-4 | Completitud/diferidos | descartado (informativo) | diferido ya inventariado explícitamente por el plan |
| COMPL-5 | Completitud/diferidos | descartado (informativo) | diferido ya inventariado; sin riesgo de corrección presente |
| COMPL-6 | Completitud/diferidos | descartado (informativo) | diferido ya inventariado; alineado con el research |
| COMPL-8 | Completitud/diferidos | descartado (informativo) | diferido ya inventariado; sin acción incremental |
| L1-NEG-2 | Verificabilidad de gates | recogido en §5 punto 21 | añadir 15º negativo o bajar mínimo a ≥14; acción menor de conteo |
| F5-AGG-4 | Verificabilidad de gates | descartado (informativo) | el AGGREGATE 62/4 ya verificado consistente (§4 fortalezas) |
| L2L3-SPLIT-5 | Secuenciación | descartado (informativo) | el split L2/L3 ya está documentado (patrón cáscara-L2/métodos-L3, skeleton L112) |

> Los descartados "informativos" no se elevan a hallazgo porque el plan ya los maneja correctamente o su severidad es nit informativa; se listan aquí para que el editor pueda auditar exactamente qué se perdió, en paralelo a los 4 refutados de §6.

---

## 9. Dimensión de riesgo / realismo de alcance (re-ejecutada tras fallo de API)

### Mini-veredicto

La re-ejecución (tras el fallo previo por *API Overloaded*) **no cambia el veredicto general del reporte** y **no introduce ningún blocker ni high nuevo**. Tras el ajuste de severidad del verificador, la dimensión queda sin hallazgos `high`/`blocker`: el techo es un único `medium` confirmado (SCOPE-03), acompañado de dos `low` confirmados (RISK-01, RISK-04). Los dos hallazgos originalmente `medium` sobre estimación/esfuerzo (RISK-02, RISK-05) fueron **refutados** porque el plan ya implementa por diseño la mitigación que proponían. El aparato de planificación del plan descansa en gates de CI binarios cuantificados y en la secuenciación *walking-skeleton-first*, no en las etiquetas S/M/L/XL; por eso los riesgos de "cronograma" se desinflan a mejoras de verificabilidad/explicitud, salvo el eslabón técnico real de SCOPE-03 (cargador de kernel).

### Tabla de hallazgos

| ID | Severidad (ajustada) | Sección | Título | Fix (una línea) | Veredicto |
|----|----------------------|---------|--------|-----------------|-----------|
| SCOPE-03 | medium | §5.4 (Kernel mixto, `loadKernelSources`), §2 | Carga del kernel `.st` sub-especificada: orden y resolución de referencias forward | Definir un "cargador de kernel" explícito al final de L3/inicio de L4: primitiva `subclass:`, esquema de dos pasadas (declarar stubs → instalar métodos) y formato concreto de los `.st` | partially-confirmed |
| RISK-01 | low | §3 (camino crítico), §9 (regla de avance) | Camino crítico serial L0→L1→L2→L3→L5→L4 sin spike simétrico para L3 | Añadir un spike temprano de L3-non-local-return, simétrico al spike de `resume:` que el plan ya pide en §5.5 | partially-confirmed |
| RISK-04 | low | §5.x (líneas "Esfuerzo") | Escala S/M/L/XL sin calibración (sin horas/jornadas) | Añadir leyenda de calibración al inicio de §5 y marcar las estimaciones como *first-pass* a recalibrar tras el walking skeleton | partially-confirmed |

### Detalle de hallazgos confirmados

#### SCOPE-03 — Carga del kernel `.st` sub-especificada (medium, partially-confirmed)

**Qué se confirma.** El plan adopta "kernel como assets `.st` bootstrappeados desde fuente" y define `loadKernelSources(vm, sources)` (§5.4), pero la mecánica de carga queda bajo-especificada en dos puntos concretos:

- **Resolución de referencias forward (gap genuino, no mitigado):** el plan especifica el orden de carga solo a granularidad de **familia** (§5.4 L527, F0..F6 con gate por familia; L549 "orden por dependencia"), pero **no aparece en ninguna sección** el manejo de una clase `.st` que referencia otra aún no cargada, ni el esquema de dos pasadas (declarar stubs → instalar métodos). Este es justamente el eslabón crítico para montar la jerarquía de excepciones en L5 vía `Object subclass:` y todo L4.
- **Primitiva `subclass:` sin dueño de capa:** L2 difiere la definición-vía-sintaxis (`Object subclass:...` se parsea como keyword message ordinario; su semántica es L2, §5.1 L216/L228), pero la **primitiva que enlaza el keyword-send con la API TS de construcción** (`addSelector:withMethod:`, `STClass/basicNew/CompiledMethod`) no es entregable nombrado de ninguna capa: L2 la difiere y L4/L5 la presuponen funcionando.

**Por qué se mantiene en medium (ni sube ni baja).** Existe andamiaje real que reduce el riesgo de "decisión sin mecanismo" a "mecanismo bajo-especificado": `StSource={selectorOrClassDef; provenanceTag}` (L574), `CompiledMethod{selector; invoke; sourceNode?}` (L322), `addSelector:withMethod:` (L288), orden F0..F6 e idempotencia de `bootstrapKernel`. Pero no baja a `low` porque los dos huecos (primitiva `subclass:` sin dueño + ausencia total de resolución forward) muerden exactamente en L4/L5, como advierte el hallazgo.

**Evidencia.** §2 tabla: "kernel como assets `.st` bootstrappeados desde fuente"; §5.4 "Kernel mixto: primitivas en TS ancladas por selector + métodos `.st` cargados al bootstrap (sin imagen)"; §5.1 difiere `Object subclass:...`; §5.5 monta la jerarquía de excepciones "vía `Object subclass:...`". Research L222-236/L470-483/L1071-1078 concuerda con la asignación a L2 y el diferimiento de chunk/fileIn/Tonel.

**Fix.** Especificar como entregable explícito (final de L3 o inicio de L4) el cargador de kernel: qué subconjunto de `Object subclass:`/method-definition se interpreta, en qué orden, cómo se resuelven referencias forward (dos pasadas: clases vacías → instalar métodos) y qué formato concreto tienen los `.st` (no-chunk, un archivo por clase, etc.).

#### RISK-01 — Camino crítico serial sin spike simétrico para L3 (low, partially-confirmed)

**Qué se confirma.** Las citas factuales son correctas: §3 (L90) declara "Camino crítico: L0 → L1 → L2 → L3 → L5 → L4"; §9 (L748) "el gate de la capa N debe estar verde en CI antes de empezar N+1"; L4=XL es la última de la cadena y la más cara. El único nugget genuino y **no** mitigado es la **asimetría de spikes**: §5.5 (L503) pide un spike explícito de `resume:` ("spike que valide `resume:` antes de construir el resto"), pero §5.3 solo ofrece como mitigación de la "home muerta" un test (L429: "marcar `dead` en `finally` + test de `BlockCannotReturn`"), **no** un spike temprano simétrico de L3-non-local-return.

**Por qué baja a low.** El núcleo estructural del riesgo ya está mitigado por diseño: (1) la distinción "la regla de avance aplica a GATES, no a todo el código" ya está formulada (§9 L748: "Cada capa solo mergea con su gate §6.1 verde"); (2) los artefactos de L6 que el fix quería paralelizar (frontmatter, parser, runner, log de desviaciones) ya están **degradados a L0/L1** por diseño (§5.6 L612; log sembrado el día 1, L6.F L662); (3) el walking skeleton (§4 L96-117) front-loadea verticalmente la mecánica más sutil de L3 (non-local return vía HomeMarker, L113) y L4-XL se descompone en F0..F6 con gates independientes, reduciendo el bloqueo terminal. Además el plan es un spec MVP prospectivo sin compromiso de calendario (§8.7), así que no hay "cronograma" que resbalar. Lo accionable que queda es solo el spike simétrico de L3.

**Fix.** Identificar L3-non-local-return como spike de alta incertidumbre y recomendar un spike temprano simétrico al de `resume:` (§5.5).

#### RISK-04 — Escala S/M/L/XL sin calibración (low, partially-confirmed)

**Qué se confirma.** Ambas afirmaciones factuales son correctas: (1) el deep-research **no estima esfuerzo** (grep de `esfuerzo|semanas|weeks|estimaci|cronograma|jornada|effort` = 0 resultados), así que las etiquetas S/M/L/XL son enteramente del autor del plan, sin anclaje externo; (2) el plan **no define la escala** — los 7 marcadores de "Esfuerzo" dan M,M,L,L,L,XL,L (L188/L272/L354/L438/L512/L604/L680), con cuatro de siete en "L", comprimiendo la señal (L2 acotado y L5 sutil comparten etiqueta). No existe leyenda de calibración (días/jornadas-persona, relativa vs absoluta) en §5 ni en el documento.

**Por qué baja a low.** El hallazgo se sobre-dimensiona al llamarse "el gap más estructural". El mecanismo real de progreso/cronograma del plan **no** son las etiquetas S/M/L/XL, sino (a) los criterios de éxito binarios cuantificados como gates de CI (L165-175, L249, L329, L416), (b) la regla "gate verde antes de mergear la siguiente capa" y (c) el *walking-skeleton-first* que dará el primer dato real de velocidad (L96, L765). La defensibilidad del alcance descansa en gates verificables, no en estas anotaciones gruesas. El riesgo es real pero su impacto es menor del afirmado: es un gap de verificabilidad en una anotación secundaria, no un defecto estructural del aparato de planificación.

**Fix.** Añadir una leyenda de calibración al inicio de §5 (p. ej. S≈1-2 días, M≈3-5, L≈1-2 semanas, XL≈3+ semanas) y marcar las estimaciones como *first-pass* a recalibrar tras el walking skeleton, reconociendo que la escala es del plan y no heredada del research.

### Fortalezas

- **Disciplina de diferimiento ejemplar y sostenida:** inline cache (§2, §8.4), `become:`/object table y traits (§5.2), bytecode/compile-to-JS (§5.3), imagen/snapshot (§2) y torre numérica completa (`Fraction`, `ScaledDecimal`, `Large*Integer` reificados, §5.4) están **todos** fuera del MVP; la tentación de adelantarlos se nombra como riesgo explícito (§5.2) y se mitiga con "el gate no los exige". No se cuela complejidad prematura.
- **Anti-over-engineering verificable en L0 (§5.0):** en vez de crear toda la topología de carpetas el día 0, solo crea `src/lexer`, `src/ast` y `test/`; las demás se crean "cuando arranca su capa". Materializa el mindset Karpathy de no construir andamiaje especulativo.
- **Captura de temporales en L3 simplificada deliberadamente (§5.3):** referencia directa estilo JsSOM sin `tempVector`/indirection-vector, con este último explícitamente diferido a optimización. Reduce L3 a su esencia correcta-por-construcción y es honesto sobre el trade-off.
- **Reducción de mecanismos de control-flow excepcional en L5 (§5.5):** las acciones del handler se resuelven como valores de retorno (`HandlerAction`) en vez de un tercer throw (`HandlerActionSignal`). Es exactamente "hacer que la complejidad se gane su sitio".
- **Walking skeleton (§4) genuinamente mínimo y ejecutable-primero:** `eval('3 + 4 * 2') ⇒ 14` atraviesa L0→L1→L2→L3 verticalmente con lo imprescindible ("sin bloques, sin super, sin non-local return, sin dNU completo todavía"), produciendo un baseline inspeccionable antes de invertir en amplitud.
- **Romper la circularidad L4↔L5 montando L5 antes de L4 (§3, §5.5):** la máquina de excepciones se monta sobre el unwind de L3 y no requiere la torre numérica (solo el cierre `ZeroDivide` se difiere a F2). Secuenciación técnicamente correcta que evita un deadlock de dependencias.
- **Clasificación rigurosa CI-binario vs gates no-CI (§1):** gates humanos de release (licencia §8.1), criterios PERF [UNVERIFIED] (megamorfismo, tinyBenchmarks §8.4/§8.8) y triangulación manual (§6.3) se segregan **explícitamente** del camino crítico de CI, evitando bloquear merges por criterios no-binarios.
- **Gate agregado de L4 auditable (§5.4 GATE-L4-AGGREGATE):** recalcula la suma de mínimos por sub-gate de forma explícita (62 positivos / 4 negativos), corrigiendo un previo `>=57/>=9` internamente inconsistente. La aritmética es ahora auditable contra los sub-gates.

### Apéndice — hallazgos refutados

- **RISK-02** (L4 XL sub-estimada / 6 familias serie sin sub-presupuesto): **refutado** (severidad ajustada a `nit`). El plan ya comunica la serialidad (L527/L549/L755/L769), ya define 9 sub-gates CI independientes y ya desglosa los conteos por familia (L588: `6+15+12+8+10+6+5=62`); lo único faltante es un token de talla por familia, presentacional y sin base dada una escala sin unidades.
- **RISK-05** (números de sección ANSI [UNVERIFIED] en frontmatter → re-trabajo en >=26 casos de L5/F6): **refutado** (severidad ajustada a `nit`). El plan **no** instruye poner `§8.5` en el campo `spec` del frontmatter; usa la referencia respaldada `[NORMATIVO] §4 T1 / selector` (L500/L497/L475) y excluye el número sin verificar, por lo que no existe la ventana de re-etiquetado masivo; solo queda nombrar la confirmación humana como precondición formal (residuo de explicitud documental).
