# Diseño de pandi-sm: base de evidencia para un runtime de Smalltalk en Node.js

Date: 2026-06-28

> **Nota de procedencia:** documento generado por workflow de deep-research (research lead). Run: `wf_23c7b8ef-f96` (30 agentes, ~1.31M tokens subagente, 517 tool-uses, ~50 min). El crítico editorial marcó gaps (`reportCritique.ok=false`) y se aplicó 1 ronda de revisión; ver §9–§10.
> Marca `[UNVERIFIED]` datos self-reported o sin confirmar contra fuente primaria **en su punto de uso**
> (no solo agregada en §10), y `[CONTESTED]` cuando las fuentes discrepan. Los veredictos adversariales de
> verificación se reportan literalmente en la sección 8. Tres capas de autoridad se separan en cada
> hallazgo: **NORMATIVO** (ANSI INCITS 319-1998 / draft X3J20 v1.9), **histórico**
> (Smalltalk-80 Blue Book) y **de-facto** (dialectos vivos: Pharo, Squeak, Cuis, GNU
> Smalltalk, Amber, SqueakJS). Las citas a repos de GitHub usan **tags fijos** (p.ej. `Pharo13`) en vez de
> ramas móviles para que no se pudran. El **Anexo A** transcribe la gramática del subconjunto ANSI como
> artefacto de partida para la capa 1; §6.1 da los criterios de éxito cuantificados por capa.

## 1. Objetivo

Producir una base de evidencia coherente que informe el diseño e implementación de
**pandi-sm** — un runtime de Smalltalk escrito en Node.js compuesto por parser/lexer,
modelo de objetos (metamodelo) y evaluador. El documento debe permitir decisiones de
arquitectura **concretas y verificables**, priorizando un baseline mínimo y ejecutable
(mindset Karpathy/MSE: empezar simple, criterios de éxito verificables, complejidad
incremental) y un camino de crecimiento hacia reflexión, metacircularidad y mayor
conformidad. Decisión de encuadre previa a todo: **elegir explícitamente qué
dialecto/subconjunto apunta pandi-sm**, porque la sintaxis de método, el modelo
imagen-vs-fuentes y partes del metamodelo divergen entre dialectos. El repo está en
scaffolding puro (sin código en `src/`/`lib/`), así que la investigación es prospectiva
y se traduce en criterios de éxito por capas.

## 2. Resumen ejecutivo

- **El único contrato formal y dialect-neutral es ANSI INCITS 319-1998 (X3J20), reafirmado
  R2002.** El draft público v1.9 es técnicamente idéntico al estándar pagado salvo que el
  draft **además incluye el rationale**, lo que lo hace más útil para implementadores. Esto
  neutraliza el riesgo de costo/acceso de la spec: no hace falta comprar el INCITS 319 para
  trabajar spec-first (https://wiki.squeak.org/squeak/172,
  https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

- **ANSI define el lenguaje por PROTOCOLOS (selectores + contratos), no por clases concretas
  ni metaclases**; usa una gramática EBNF (léxica + método + programa abstracto + interchange);
  fija precedencia inequívoca (unario > binario > keyword, izquierda-a-derecha, sin precedencia
  aritmética); y especifica plenamente bloques-closures, retorno no-local y excepciones. ANSI
  **excluye** imagen, GUI, concurrencia/procesos, pragmas y declara las metaclases innecesarias
  en su modelo declarativo (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

- **Recomendación de encuadre (CONFIRMADA adversarialmente):** declarar **ANSI como baseline
  normativo** del núcleo del lenguaje y luego añadir, como **extensiones explícitamente
  documentadas**, las conveniencias de-facto de Pharo/Squeak (arrays dinámicos `{ }`, byte-arrays
  `#[ ]`, `Object subclass:...`). Son extensiones genuinamente no-ANSI (sección 8, veredicto T1).

- **Baseline de arquitectura recomendado (Karpathy/MSE): from-scratch tree-walking estilo
  JsSOM, SIN imagen.** El objeto se apoya en objetos JS nativos (campo `clazz` + array de campos
  indexados), SmallInteger usa `number` nativo (sin object table ni tagged pointers), los bloques
  son closures JS y el non-local return se hace con una excepción JS que transporta una referencia
  al home frame. El modelo image-based (snapshot, identidad por puntero, `become:`/forwarding) NO
  es obligatorio y es la mayor fuente de complejidad sobre V8
  (https://github.com/SOM-st/JsSOM, https://som-st.github.io/).

- **Object model concreto (lección SqueakJS): plain JS objects + referencias directas, sin object
  table.** `become:`/`allInstances` se resuelven con una lista enlazada de old-space + un GC híbrido
  que corre SOLO en esas operaciones raras (la cifra "15M asignaciones en benchmarks → CERO GC completos"
  es `[UNVERIFIED]`, self-reported del paper SqueakJS; el modelo plain-JS/sin-object-table sí está
  corroborado de forma independiente — ver §4 T5). No construir una object table solo para `become:`
  (https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf,
  https://gbracha.blogspot.com/2009/07/miracle-of-become.html).

- **Dispatch:** `send(receiver, selector, args)` explícito recorriendo la cadena de clases vía `Map`
  (selector→CompiledMethod). Un dispatcher genérico NO alcanza los inline caches de V8 (megamórfico),
  así que conviene una **inline cache por call-site propia** — técnica inventada precisamente para
  Smalltalk/Self (https://en.wikipedia.org/wiki/Inline_caching, https://mathiasbynens.be/notes/shapes-ics).

- **Conformidad por capas:** no hay suite ANSI ejecutable oficial. El modelo más portable es el de
  GNU Smalltalk (tests `.st` evaluados desde CLI con diff de salida esperada, `AT_DIFF_TEST`). Para
  pandi-sm: harness host (Node/Vitest) que evalúe fragmentos `.st` y compare resultados, posponiendo
  SUnit nativo hasta tener object model + excepciones (https://github.com/gnu-smalltalk/smalltalk/blob/master/tests/testsuite.at).

- **Spec-driven SÍ es viable, pero solo como esqueleto.** El comité ANSI dice que derivar medidas de
  conformidad "should be considered as a test of whether the standard is adequately unambiguous". Las
  features definidas y `Erroneous` (must reject) → tests deterministas positivos/negativos; `Unspecified`/
  `Implementation-Defined` → el dialecto vivo es oráculo de facto. Precedentes (Test262, WebAssembly,
  ACATS) confirman el patrón positivo+negativo y que la cobertura **nunca es completa**.

## 3. Fuentes revisadas

**Normativas / históricas (capas 1 y 2):**

- **ANSI INCITS 319-1998 (X3J20 / NCITS J20), draft público v1.9 indexado** — https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf — gramática EBNF, protocolos, semántica de conformidad, excepciones, bloques. Fuente primaria principal de T1/T6.
- **Squeak wiki — provenance del estándar** — https://wiki.squeak.org/squeak/172 — estado R2002, mirrors ESUG/Smalltalk Systems, debate de conformidad de dialectos.
- **ANSI webstore (artefacto pagado citable)** — https://webstore.ansi.org/standards/incits/ansiincits3191998 (HTTP 403 a fetch automático). Mirror de catálogo: https://store.accuristech.com/standards/incits-319-1998?product_id=56122
- **Blue Book — Chapter 28 (bytecode/VM), mirror RMoD** — https://rmod-files.lille.inria.fr/FreeBooks/BlueBookHughes/Blue%20Book%20Chapter%2028.html — set de 256 bytecodes, CompiledMethod/MethodContext/BlockContext, return bytecodes.
- **Mirror Blue Book / clásicos** — stephane.ducasse.free.fr/FreeBooks (referenciado, no abierto en esta sesión).
- **Pharo by Example 5.0 (LibreTexts)** — https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book%3A_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis) — metamodelo, regla de los 10 puntos, ProtoObject, SUnit.
- **Pharo cheat sheet** — https://files.pharo.org/media/pharoCheatSheet.pdf — `{ }`, `#[ ]`, `#( )`, `subclass:`.
- **GNU Smalltalk manual** — https://www.gnu.org/software/smalltalk/manual-base/html_node/Exception_002dexception-handling.html, https://www.gnu.org/software/smalltalk/manual/html_node/SUnit.html, https://www.gnu.org/software/smalltalk/manual/html_node/Test-suite.html — modelo de excepciones ANSI, gst-sunit, suite de regresión.
- **gtoolkit — Understanding Smalltalk classes and metaclasses** — https://book.gtoolkit.com/understanding-smalltalk-classes-and-metacl-9rpd5bxi9ai19d3ctknxhyvt6
- **Wikipedia — Metaclass / Smalltalk / SUnit / Inline caching / ACATS** — https://en.wikipedia.org/wiki/Metaclass, https://en.wikipedia.org/wiki/Smalltalk, https://en.wikipedia.org/wiki/SUnit, https://en.wikipedia.org/wiki/Inline_caching, https://en.wikipedia.org/wiki/Ada_Conformity_Assessment_Test_Suite
- **Tony Clark — golden braid / reflexión Smalltalk** — arXiv:1804.07272 — https://arxiv.org/abs/1804.07272

**Implementaciones de referencia (capa 3, de-facto):**

- **JsSOM (AST tree-walker en JS)** — https://github.com/SOM-st/JsSOM — kernel en JS, wiring de metaclase, ReturnException, SObject, primitivas por clase.
- **SOM / SOM family** — https://som-st.github.io/, https://github.com/smarr/SOM — surface mínimo del kernel, AST vs bytecode, 2.5k–8k LOC.
- **SqueakJS (bytecode VM en JS)** — paper DLS 2014: https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf (mirror ACM: https://dl.acm.org/doi/pdf/10.1145/2661088.2661100); repo: https://github.com/codefrau/SqueakJS — object model plain-JS, sin object table, GC híbrido para `become:`, carga de imágenes reales.
- **Amber (compile-to-JS)** — https://github.com/amber-smalltalk/amber, https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back, https://amber-lang.net/ — mapeo 1:1, selector mangling, bridge JS. Pipeline del compilador confirmado en fuente: https://raw.githubusercontent.com/amber-smalltalk/amber/master/src/Compiler-Core.st, `Compiler-Inlining.st`, `Compiler-IR.st`, `Kernel-Methods.st`.
- **Squeak "Back to the Future" (OOPSLA 1997)** — https://ftp.squeak.org/docs/OOPSLA.Squeak.html — Slang, 42 primitivas, InterpreterSimulator, `become:` sin object table.
- **Bootstrapping Pharo (Hazelnut/Espell, Polito & Ducasse)** — https://hal.science/hal-00903724v1, https://jigyasagrover.wordpress.com/wp-content/uploads/2015/07/poli12-bootstrappingsmalltalk-scp.pdf — proceso de 6 pasos, `adoptInstance:`, PharoCandle 80KB.
- **Little Smalltalk (Budd)** — https://littlesmalltalk.org/, https://rmod-files.lille.inria.fr/FreeBooks/LittleSmalltalk/ALittleSmalltalk.pdf
- **Spur object format (Clement Bera)** — https://clementbera.wordpress.com/2014/01/16/spurs-new-object-format/, https://clementbera.wordpress.com/2015/01/21/context-and-blockclosure-implementation/ — tagged pointers, header, tempVectors, sideways return prohibido.
- **Crafting Interpreters (Nystrom)** — https://craftinginterpreters.com/chunks-of-bytecode.html — tree-walking vs bytecode, jlox vs C.
- **Ohm.js** — https://ohmjs.org/ — PEG, separación gramática/acciones, left-recursion.
- **SmallJS (Smalltalk→JS, file-based)** — https://github.com/Small-JS/SmallJS, https://raw.githubusercontent.com/Small-JS/SmallJS/main/Compiler/src/CompiledClass.ts, `Runtime.ts` — mapeo de clase/metaclase a `StX`/`StX$class`.
- **Allen Wirfs-Brock — efficient Smalltalk block returns** — https://wirfs-brock.com/allen/things/smalltalk-things/efficient-implementation-smalltalk-block-returns
- **Transpiling-challenges (PharoJS authors)** — https://ceur-ws.org/Vol-4139/Paper02.pdf — `doesNotUnderstand:`, Proxy, arrow vs function, límites de fidelidad.
- **SmallInteger tagging (Max Bernstein)** — https://bernsteinbear.com/blog/small-objects/

**Suites / conformidad / spec-driven (T4/T6):**

- **SUnit (Kent Beck, "Simple Smalltalk Testing: With Patterns")** — https://en.wikipedia.org/wiki/SUnit; booklet Pharo Testing: https://books.pharo.org/booklet-Testing/pdf/2023-06-04-Testing.pdf
- **Pharo kernel/core tests (Pharo12)** — https://github.com/pharo-project/pharo/tree/Pharo12/src — conteos vía GitHub API.
- **Pharo CLI test runner** — `ClapTestRunner` vive en `src/Clap-Commands-Pharo/ClapTestRunner.class.st` (la ruta `src/SUnit-Basic-CLI/` da 404); las cadenas literales `junit-xml-output`/`fail-on-failure` están en `src/JenkinsTools-Core/TestCommandLineHandler.class.st`. Se cita el tag fijo Pharo13 para que la cita no se pudra: https://github.com/pharo-project/pharo/blob/Pharo13/src/Clap-Commands-Pharo/ClapTestRunner.class.st, https://github.com/pharo-project/pharo/blob/Pharo13/src/JenkinsTools-Core/TestCommandLineHandler.class.st; CI (ejemplo de uso): https://github.com/pharo-project/opensmalltalk-vm/blob/pharo-9/Jenkinsfile
- **Metacello scripting API** — https://github.com/pharo-project/pharo-metacello/blob/master/docs/MetacelloScriptingAPI.md
- **smalltalkCI** — https://github.com/hpi-swa/smalltalkCI
- **squeak-ci** — https://github.com/squeak-smalltalk/squeak-ci
- **GNU Smalltalk testsuite** — https://github.com/gnu-smalltalk/smalltalk/blob/master/tests/testsuite.at, https://raw.githubusercontent.com/gnu-smalltalk/smalltalk/master/tests/local.at, https://raw.githubusercontent.com/gnu-smalltalk/smalltalk/master/tests/AnsiRun.st
- **Squeak ANSI compatibility Tests (Alain Fischer)** — http://wiki.squeak.org/squeak/3172
- **Camp Smalltalk ansi-st-tests** — https://sourceforge.net/projects/ansi-st-tests/
- **Test262 (ECMAScript)** — https://github.com/tc39/test262, https://github.com/tc39/test262/blob/main/INTERPRETING.md
- **WebAssembly spec + reference interpreter** — https://github.com/WebAssembly/spec, https://github.com/WebAssembly/spec/blob/main/interpreter/README.md; SpecTec: https://conrad-watt.github.io/papers/youn2024.pdf
- **JSCert/JSRef** — https://github.com/jscert/jscert, https://www.doc.ic.ac.uk/~pg/publications/Gardner2015Trusted.pdf
- **Hayes & Jones — "Specifications Are Not (necessarily) Executable"** — https://www.researchgate.net/publication/2632227_Specifications_Are_Not_necessarily_Executable

## 4. Hallazgos por tópico

### T1 — Fuentes normativas e históricas del lenguaje

**[NORMATIVO] El artefacto vinculante es ANSI INCITS 319-1998 (X3J20/NCITS J20), aprobado
1998-05-19, reafirmado R2002.** El draft público v1.9 es técnicamente idéntico al estándar
pagado, salvo que el draft **además incluye el rationale** (por eso es "arguably more useful").
Mirrors gratuitos: Squeak wiki y ESUG (PDF/.doc/.rtf); el artefacto pagado vive en el ANSI
webstore (product ID 56122) (https://wiki.squeak.org/squeak/172,
https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Notación: ANSI usa una variante de EBNF (no BNF plano), con tres gramáticas
interrelacionadas** (léxica, de método, de programa abstracto) más una cuarta de Interchange.
Convención: `<<dobleAngulo>>` = categorías del programa, `<angulo>` = método, identificadores
desnudos = léxicas. La gramática de programa abstracto **NO implica orden sintáctico** (solo
constituencia); el orden concreto se deja a la implementación salvo el Interchange Format
obligatorio (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Precedencia y cascadas, inequívocas.** `<messages> ::= (<unary message>+ <binary
message>* [<keyword message>]) | (<binary message>+ [<keyword message>]) | <keyword message>`;
asignación `:=`, retorno `^`, asignación múltiple permitida (`a := b := expr`); cascadas `;`. No
hay precedencia aritmética: `1 + 2 * 3` da **9**, no 7 (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
https://en.wikipedia.org/wiki/Smalltalk).

**[NORMATIVO] Literales léxicos:** identifier, keyword (`identifier ':'`), binarySelector (set
`~ ! @ % & * + , / < = > ? \ | -`), `integer` (decimal o radix `16rFF`) con "unbounded range" (ISO/IEC
10967), `float` con sufijos e/d/q, `scaledDecimal ::= scaledMantissa 's' [fractionalDigits]` (p.ej.
`1.234s4`), `$c`, strings `'...'`, símbolos `#'...'`/`#sym`, selectores citados `#selector`, y arrays
literales SOLO como `#( ... )`. El **número negativo** es léxico (`<number literal> ::= ['-'] <number>`,
con espacio permitido entre `-` y el número), no un mensaje unario
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[CONTESTED por capa — divergencia crítica de literales]** La gramática ANSI **NO tiene** arrays
dinámicos `{ }` ni byte-arrays literales `#[ ]`. Un grep del texto completo da 0 ocurrencias de
sintaxis de llave/array dinámico y ningún `#[` literal en la gramática de método (solo `<ByteArray>`
como protocolo/factory). `{ }` y `#[ ]` son **extensiones Pharo/Squeak** (la fuente cita exactamente
esos dos dialectos): "the curly-brace notation is peculiar to the Pharo and Squeak dialects... In other
Smalltalks you must build up dynamic arrays explicitly". **Cuis NO se agrupa aquí:** si soporta `{ }`
no se confirmó contra docs propias de Cuis `[UNVERIFIED — un snippet aislado afirmaba que NO los
soporta; no asertado]`. Para encuadrar pandi-sm, lo único firme es: `{ }`/`#[ ]` están fuera de ANSI
y presentes en Pharo/Squeak (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
https://files.pharo.org/media/pharoCheatSheet.pdf).

**[NORMATIVO] ANSI no especifica sintaxis de pragma/primitivas.** El cuerpo de método es
`[<temporaries>] [<statements>]`; no hay `<primitive: n>` ni `<pragma:>`. Las directivas de primitiva
son mecanismo Blue Book (primitiveIndex) / dialecto (`<primitive: ...>`), no normativo
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
https://rmod-files.lille.inria.fr/FreeBooks/BlueBookHughes/Blue%20Book%20Chapter%2028.html).

**[NORMATIVO] Conformidad por 4 disposiciones de features (no por clases):**
*implementation-defined* (aceptar + documentar), *unspecified* (aceptar; puede variar; p.ej. valores
de retorno), *undefined* (puede aceptar pero debe documentar; un programa que depende de ello no es
conforme) y *erroneous* (debe **rechazar**) (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] ANSI especifica el comportamiento por PROTOCOLOS en un retículo de
conformance/refinement, NO por clases/metaclases.** Las clases "are not defined as being the
containers or implementers of their instances' behavior... metaclasses are not needed". El `<Object>`
protocol (conforma a `<ANY>`) manda exactamente: `= == ~= ~~ class copy doesNotUnderstand: error:
hash identityHash isKindOf: isMemberOf: isNil notNil perform:[with:...] perform:withArguments: printOn:
printString respondsTo: yourself`. Excluye deliberadamente `storeOn:`/`storeString` (no se mandata
compilación en runtime) y los protocolos de dependents
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Semántica de envío:** `self` = binding constante al receptor; `super` = mismo objeto
pero el lookup arranca en la **superclase de la clase que define el método actual**; `super` debe ir
seguido de un envío (usarlo como valor es erroneous). `nil/true/false/self/super` son reservados. El
fallo de lookup crea un `<failedMessage>` y envía `doesNotUnderstand:`; es erroneous si el receptor no
lo entiende (coincide con el mecanismo Blue Book)
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
https://rmod-files.lille.inria.fr/FreeBooks/BlueBookHughes/Blue%20Book%20Chapter%2028.html).

**[NORMATIVO] Bloques = closures de primera clase con captura léxica.** Aridad → protocolo
(0→`<niladic-block>`, 1→`<monadic-block>`, 2→`<dyadic-valuable>`, >2→`<valuable>`; `value`/`value:`/
`value:value:`/`valueWithArguments:`). Cada bloque captura los bindings de los argumentos/temporales
encerrantes referenciados; `self` dentro del bloque es el de la home activation. Es **unspecified** si
re-evaluar un block constructor da objetos distintos (permite optimizar clean blocks)
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Retorno no-local (`^` en bloque):** retorna desde la **home activation** del bloque
(termina el método encerrante, no solo el bloque). Es **undefined** ejecutarlo si la home ya retornó/
terminó. `ensure:`/`ifCurtailed:` corren durante el unwind
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Excepciones completas:** evaluación protegida `on:do:` / `ensure:` (corre siempre) /
`ifCurtailed:` (solo en terminación anormal); señalización `signal`/`signal:`; acciones del handler
`return`/`return:`/`retry`/`retryUsing:`/`resume`/`resume:`/`pass`/`outer`/`resignalAs:`/`isNested`;
ExceptionSets vía coma. **GNU Smalltalk es implementación viva conforme** del modelo de excepciones
(mismo conjunto de mensajes, semántica ANSI, más `context`)
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
https://www.gnu.org/software/smalltalk/manual-base/html_node/Exception_002dexception-handling.html).

**[NORMATIVO] Sintaxis concreta obligatoria = Smalltalk Interchange Format (cap. 4):** chunks
delimitados por `!` (doble `!!` escapa), definición de clase **declarativa** `Class named: 'Name'
superclass: 'Super' ...`, derivada del formato de Krasner. Es la respuesta ANSI a imagen-vs-fuentes:
programa declarativo, textual, independiente de imagen
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[CONTESTED por dialecto] Sintaxis de clase y raíz de jerarquía.** Los dialectos vivos (Pharo,
Squeak, Cuis) definen clases **enviando un mensaje** (`Object subclass: #Point instanceVariableNames:
'x y' ...`) — esto SÍ está confirmado para los tres por Pharo by Example —, no con la forma declarativa
ANSI; son image-centric y exportan con chunks `!`. Y enraizan la jerarquía en **ProtoObject** por encima
de Object (`SmallInteger → Integer → Number → Magnitude → Object → ProtoObject → nil`), mientras Blue
Book/ANSI tratan Object como raíz conceptual. ProtoObject y traits son adiciones post-Smalltalk-80.
(Aparte: el soporte de Cuis para arrays dinámicos `{ }` NO se confirmó y NO se afirma aquí —
ver el hallazgo de literales más arriba) (https://files.pharo.org/media/pharoCheatSheet.pdf,
https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book%3A_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/06%3A_The_Pharo_Object_Model/6.06%3A_Every_Class_Has_a_Superclass).

**[histórico] Blue Book Part Four = VM concreta con set de 256 bytecodes** en cuatro grupos (stack
0-137, jump 144-175, send 176-255 + extended 131-134, return 120-125). Selectores aritméticos
especiales (176-191): `+ - < > <= >= = ~= * / \\ @ bitShift: // bitAnd: bitOr:`. El non-local return se
codifica con dos familias de return bytecodes: `returnFromMessage` (120-124) vuelve al **sender de la
home context**, `returnFromBlock` (125) vuelve al **caller**; tras retornar, sender e IP se ponen a
nil para detectar retornos a una home ya salida (= el "undefined to return from a dead home" de ANSI)
(https://rmod-files.lille.inria.fr/FreeBooks/BlueBookHughes/Blue%20Book%20Chapter%2028.html).

**[síntesis] Relevancia del bytecode Blue Book a un tree-walker:** es técnica de implementación, NO
requisito normativo. ANSI excluye explícitamente "compiled methods, method dictionaries". Un
tree-walker satisface el contrato implementando el modelo computacional ANSI directamente (lookup por
superclass chain, self/super, `doesNotUnderstand:`, closures con captura léxica, non-local return a
home viva, excepciones/`ensure:`). El valor del Blue Book es conceptual y para fidelidad a fuentes
Xerox (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**Recomendación T1 (CONFIRMADA, ver §8):** declarar **conformance ANSI INCITS 319-1998** como
baseline del núcleo (gramática léxica, precedencia/cascadas, superficie del protocolo Object, envío +
self/super + `doesNotUnderstand:`, closures, non-local return, excepciones), y añadir como
**extensiones documentadas** las conveniencias de-facto (`{ }`, `#[ ]`, `subclass:`).

### T2 — Arquitecturas y bootstrapping; qué aplica a Node.js

**[de-facto] Tres rutas viables:** (1) image-based/metacircular (Squeak/Pharo: VM en Slang +
snapshot del object memory); (2) from-scratch/language-as-library (SOM/JsSOM, Little Smalltalk: kernel
en el host + biblioteca en `.som`/`.st`, sin imagen); (3) transpile-to-host (Amber: clases/métodos →
objetos/funciones JS 1:1) (https://ftp.squeak.org/docs/OOPSLA.Squeak.html, https://som-st.github.io/,
https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back).

**[de-facto] El baseline mínimo viable NO carga imagen:** JsSOM crea en JS las clases núcleo
(`metaclassClass`, `objectClass`, `classClass`, `nilClass`...) y luego compila los `.som` para poblar
métodos (https://github.com/SOM-st/JsSOM, https://github.com/smarr/SOM).

**[de-facto] El cierre metacircular (`Metaclass class class = Metaclass`) se resuelve con wiring
directo por mutación**, sin imagen ni inferencia: `result.setClass(new SClass()); result.getClass().setClass(result)`,
y para clases de sistema `systemClass.getClass().setClass(this.metaclassClass)`
(https://github.com/SOM-st/JsSOM).

**[de-facto] El object model del baseline se apoya en objetos JS nativos:** cada instancia es un
objeto con campo `clazz` y un array de campos indexados; lookup de variables delegado a la clase. Sin
layout de bytes ni headers (JsSOM `SObject`) (https://github.com/SOM-st/JsSOM).

**[de-facto] Non-local return simple en JS = excepción que lleva referencia al home frame.** JsSOM:
`ReturnNonLocalNode` lanza `new ReturnException(result, ctx)`; `CatchNonLocalReturnNode` envuelve el
cuerpo del método y comprueba identidad de frame (`current === this.targetFrame`); si el bloque escapó,
`outerReceiver.sendEscapedBlock()`. No hacen falta continuaciones (https://github.com/SOM-st/JsSOM).

**[síntesis/CONTESTED leve] SmallInteger nativo vs boxed.** Lo más simple es usar `number` nativo de
JS, no boxear ni usar tagged pointers (los tags existen para evitar heap-allocar enteros, problema que
desaparece con valores inmediatos del host). Trade-off: el entero pierde identidad de objeto. La
recomendación es cualitativa, no medida con benchmarks `[UNVERIFIED]` (https://bernsteinbear.com/blog/small-objects/,
https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back).

**[de-facto] Image-based NO es obligatorio para tener un Smalltalk ejecutable.** SOM, Little Smalltalk
y Amber funcionan sin imagen. La imagen es decisión de persistencia/evolución, no de semántica
(https://som-st.github.io/, https://littlesmalltalk.org/, https://github.com/amber-smalltalk/amber).

**[de-facto] Reimplementar el modelo image-based de Spur sobre V8 es de alta complejidad y choca con
el host:** exige header explícito, class table indexada por class index, SmallIntegers inmediatos por
tagging y forwarding pointers para `become:` (https://clementbera.wordpress.com/2014/01/16/spurs-new-object-format/).
`become:` sin object table requiere recorrer toda la memoria; sobre V8 no hay control del heap para
hacerlo eficientemente — refuerza diferir `become:` e image-based (https://ftp.squeak.org/docs/OOPSLA.Squeak.html).

**[de-facto] Ruta intermedia from-scratch pero image-capable (Hazelnut/Pharo):** proceso de 6 pasos
(load spec → resolver meta-circularidad básica → class shells → install methods → initialize →
serialize image), cerrando el loop con `adoptInstance:`. **No necesita soporte especial de VM**: solo
`basicNew`, `instVarAt:`, method dictionaries, `adoptInstance:` — esto delimita la reflexión mínima
para auto-construcción. Validado con micro-kernel PharoCandle (80KB)
(https://jigyasagrover.wordpress.com/wp-content/uploads/2015/07/poli12-bootstrappingsmalltalk-scp.pdf,
https://hal.science/hal-00903724v1).

**[de-facto] Amber valida transpile-to-host:** clases/métodos → objetos/funciones JS, bloques →
funciones, mangling de selectores, bridge para llamar JS desde Smalltalk. Coste: acoplamiento fuerte al
modelo de objetos JS y dependencia de Node para el bootstrap
(https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back).

**[de-facto] SOM define el surface mínimo del kernel** (objetos, clases, closures, non-local returns,
tipado dinámico; 2.5k–8k LOC; variantes AST y bytecode) — justifica un baseline tree-walking minimal
sobre Node (https://som-st.github.io/, https://github.com/smarr/SOM).

### T3 — Metamodelo de objetos (dueño canónico)

**[de-facto/histórico] Golden braid reflexiva:** todo objeto es instancia de una clase, toda clase es
instancia de una metaclase, toda metaclase es instancia de `Metaclass`; object-level y meta-level usan
el mismo lenguaje causalmente conectado (arXiv:1804.07272,
https://book.gtoolkit.com/understanding-smalltalk-classes-and-metacl-9rpd5bxi9ai19d3ctknxhyvt6).

**[de-facto] Jerarquía del kernel:** `Object → Behavior → ClassDescription → Class`, con `Metaclass`
hermana de Class (ambas heredan de ClassDescription). **Behavior** = estado mínimo (superclass link,
method dictionary, format) + interfaz al compilador + `new`/`basicNew`. **ClassDescription** = variables
de instancia nombradas, organización en protocolos/categorías, change sets. **Class** = nombre, class
variables, shared pools. **Metaclass** = repositorio compartido de comportamiento de todas las
metaclases (https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/15:_Classes_and_Metaclasses/15.05:_Every_Metaclass_Inherits_from_Class_and_Behavior,
https://en.wikipedia.org/wiki/Metaclass).

**[de-facto] 10 reglas canónicas (Pharo by Example):** (1) todo es objeto; (2) todo objeto es
instancia de una clase; (3) toda clase tiene superclase; (4) todo ocurre enviando mensajes; (5) lookup
sigue la cadena de herencia; (6) toda clase es instancia de una metaclase; (7) la jerarquía de
metaclases es paralela a la de clases; (8) toda metaclase hereda de Class y Behavior; (9) toda metaclase
es instancia de Metaclass; (10) la metaclase de Metaclass es instancia de Metaclass
(https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/15:_Classes_and_Metaclasses/15.01:_Rules_for_Classes_and_Metaclasses).

**[de-facto] Relación paralela exacta: `X class superclass = X superclass class`.** La superclase de
una metaclase está forzada a ser la metaclase de la superclase de su instancia única. Cierre del
sistema: `Metaclass class class >>> Metaclass`; las metaclases son **anónimas**, cada una con
exactamente una instancia (referida como `X class`)
(https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/15:_Classes_and_Metaclasses/15.04:_The_Metaclass_Hierarchy_Parallels_the_Class_Hierarchy).

**[de-facto] Trampa del bootstrap:** la cadena de SUPERCLASES de las metaclases **NO termina en
`Object class`** sino que se conecta al lado de las clases ordinarias: `Object class superclass == Class`,
y desde ahí `Class → ClassDescription → Behavior → Object`
(https://en.wikipedia.org/wiki/Metaclass).

**[de-facto] Method dictionary** mapea `Symbol` (selector) → `CompiledMethod`. El lookup arranca en la
clase del receptor y sube por la superclass chain. `self` redispara dinámicamente desde la clase del
receptor real; `super` arranca en la superclase de la clase que define el método (estático, evita
bucles) (https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/06:_The_Pharo_Object_Model/6.08:_Method_Lookup_Follows_the_Inheritance_Chain,
https://books.pharo.org/booklet-ReflectiveCore/html/).

**[de-facto] Fallo de lookup → reificación + `doesNotUnderstand:`:** cuando falla en todo el chain
(superclass nil), la VM reifica el mensaje como `Message` y envía `doesNotUnderstand: aMessage`; el
default en Object lanza `MessageNotUnderstood`. Sobreescribirlo habilita proxies (`aMessage sendTo:
subject`). Limitaciones: no intercepta mensajes interpretados por la VM ni self-sends internos
(https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/16:_Reflection/16.07:_Intercepting_Messages_Not_Understood).

**[de-facto] Separación por lado:** variables/métodos de instancia en la clase; métodos de clase y
class-instance variables en la metaclase (`X class`); class variables administradas por Class. El lookup
de un mensaje a una clase (p.ej. `new`) sube por la **jerarquía de metaclases** hasta Behavior, no por
las superclases de la clase-instancia (error clásico)
(https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/15:_Classes_and_Metaclasses/15.05:_Every_Metaclass_Inherits_from_Class_and_Behavior).

**[de-facto] Objetos inmediatos (tagged pointers) en Spur:** SmallInteger, Character (y Float inmediato
en 64-bit) no son objetos en heap. 32-bit usa 2 bits bajos; 64-bit da 3 bits de tag → SmallInteger de
63 bits, Character inmediato e immediate Float. Implicación de identidad para `become:`
(https://clementbera.wordpress.com/2014/01/16/spurs-new-object-format/).

**[de-facto] MOP expuesto:** introspección (`class`, `isMemberOf:`, `isKindOf:`, `respondsTo:`,
`allInstances`, `allSubclasses`, `instVarNames`), intercesión (`doesNotUnderstand:`, `perform:withArguments:`,
`become:`) y modificación estructural (subclasses, `addSelector:withMethod:`/`compile:`, recompilación).
`instVarAt:`/`instVarAt:put:` y `become:` son primitivas de VM
(https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/16:_Reflection/16.07:_Intercepting_Messages_Not_Understood,
https://books.pharo.org/booklet-ReflectiveCore/html/).

**[CONTESTED por dialecto — CONFIRMADO, ver §8]** El esquema de metaclases implícitas/anónimas
(cada clase con su metaclase de instancia única, paralela a la jerarquía) es común a Blue Book/ANSI/
Pharo/Squeak/Cuis. **ProtoObject** (raíz por encima de Object) es adición Squeak/Pharo (no del Blue
Book). **Traits** es adición Pharo/Squeak (ECOOP 2003), ajena al Blue Book/ANSI. Para una implementación
nueva, ProtoObject es opcional y traits son extensión; el núcleo
`Object/Behavior/ClassDescription/Class/Metaclass` es lo invariante
(https://book.gtoolkit.com/understanding-smalltalk-classes-and-metacl-9rpd5bxi9ai19d3ctknxhyvt6,
https://en.wikipedia.org/wiki/Metaclass).

**[CONFIRMADO, ver §8] `nil` es la única instancia de `UndefinedObject`** (subclase de Object);
representa el valor indefinido por defecto y termina las cadenas (la superclase de Object/ProtoObject es
nil) (https://www.bildungsgueter.de/Smalltalk/Pages/MVCTutorial/Pages/UndefObject.htm,
https://www.gnu.org/software/smalltalk/manual-base/html_node/UndefinedObject.html).

**[de-facto] SmallJS (mapeo concreto a JS):** compila Smalltalk a JS file-based; cada clase →
clase JS `StX`, su metaclase → `StX$class`; separa lado-instancia (vars/methods) de lado-clase
(classVars/classMethods); selectores keyword/binarios codificados (`at:put:` → `$at$put$`, `>=` →
`$gt$equals`) (https://github.com/Small-JS/SmallJS,
https://raw.githubusercontent.com/Small-JS/SmallJS/main/Compiler/src/CompiledClass.ts).

### T4 — Suites de tests y conformidad; inventario (dueño)

**[NORMATIVO] ANSI INCITS 319-1998 (R2002)** define el lenguaje por protocolos + gramática; **NO**
incluye suite de conformidad ejecutable oficial. La conformidad se comprueba con paquetes comunitarios
por dialecto (https://wiki.squeak.org/squeak/172).

**[partially-confirmed, ver §8] Alcance ANSI:** protocolos para Object, Boolean, Magnitude/Number,
Collection/SequencedCollection, Stream, Exception, etc.; NO especifica clases concretas, imagen, GUI,
reflexión más allá de un kernel mínimo, namespaces ni empaquetado. **Corrección verificada:** ANSI **SÍ**
especifica I/O abstracto (Sección 5.9 Stream Protocols y 5.10 File Stream Protocols), aunque muchos
valores de retorno queden "unspecified". Por tanto agrupar "IO" entre lo no-especificado es incorrecto;
"packaging" sí está fuera (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
http://www.esug.org/data/Articles/AnsiSmalltalkStandard/STANDARD_V1_9.PDF).

**[de-facto] Batería ANSI pública de facto = "ANSI compatibility Tests" de Squeak (Alain Fischer,
SqueakMap, SUnit-based).** Cifras reportadas `[UNVERIFIED — dependen del render de la wiki, que no se
pudo leer completo]`: Squeak 3.4 = 2830 ejecutados / 2803 pasados / 27 fallos / 0 errores; Squeak 3.2 =
2777 / 2753 / 24 / 0. Es antigua (change set 16-jul-2002) y dependiente de imagen
(http://wiki.squeak.org/squeak/3172). La lista exacta de clases ANSI añadidas (ArithmeticError,
DateAndTime, Duration, ScaledDecimal...) **tampoco pudo verificarse** en el render de la wiki
`[UNVERIFIED]`.

**[de-facto] SUnit (Kent Beck, 1989), semilla de xUnit.** Arquitectura: `TestCase` (abstracto,
setUp/tearDown por test), `TestSuite` (Composite), `TestResult` (pasados/fallos/errores, distingue
failure vs error), `TestResource` (setUp caro UNA vez por suite). Aserciones: `assert:`, `deny:`,
`assert:equals:`, `should:raise:`/`shouldnt:raise:`. Se corre programáticamente sin GUI
(https://en.wikipedia.org/wiki/SUnit, https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/09:_SUnit/9.06:_The_SUnit_Framework,
https://books.pharo.org/booklet-Testing/pdf/2023-06-04-Testing.pdf).

**[de-facto] Paquetes de test del kernel Pharo (verificados vía GitHub API, Pharo12):** Kernel-Tests
(~90 clases `.class.st`), Kernel-Tests-WithCompiler, SUnit-Tests (~34), Collections-Tests,
Collections-Abstract-Tests (~2), Collections-Sequenceable-Tests (~9), Collections-Unordered-Tests (~15).
Los tests de colecciones están repartidos. **Nota:** son conteos de CLASES, no de métodos/aserciones;
varían por versión `[parcialmente UNVERIFIED a nivel de método]` (https://github.com/pharo-project/pharo/tree/Pharo12/src).

**[de-facto — CONFIRMADO con atribución corregida, ver §8] Pharo corre tests headless:** `./pharo
--headless Pharo.image test --junit-xml-output --fail-on-failure 'PackageName'` (acepta regex tipo
`'SUnit.*'`); produce JUnit XML. El runner de la subcommand `test` es `ClapTestRunner`, que en Pharo13
vive en `src/Clap-Commands-Pharo/ClapTestRunner.class.st` (no en `src/SUnit-Basic-CLI/`, que da 404).
**Atribución de los flags:** las cadenas literales `junit-xml-output` y `fail-on-failure` NO están en
`ClapTestRunner` sino en `src/JenkinsTools-Core/TestCommandLineHandler.class.st`. El claim sustantivo
(Pharo corre tests headless y emite JUnit XML) está confirmado contra el árbol Pharo13; lo que cambió es
la atribución de archivo. Ejemplo CI real (macOS): `./vm/Contents/MacOS/Pharo --headless --logLevel=4
./image/VMMaker.image test --junit-xml-output 'VMMakerTests'`
(https://github.com/pharo-project/pharo/blob/Pharo13/src/Clap-Commands-Pharo/ClapTestRunner.class.st,
https://github.com/pharo-project/pharo/blob/Pharo13/src/JenkinsTools-Core/TestCommandLineHandler.class.st,
https://github.com/pharo-project/opensmalltalk-vm/blob/pharo-9/Jenkinsfile).

**[de-facto] Carga selectiva con Metacello:** `Metacello new baseline:/configuration: '...'; repository:
'...'; load: #('Core' 'Tests')` permite cargar paquetes de test como elementos separados
(https://github.com/pharo-project/pharo-metacello/blob/master/docs/MetacelloScriptingAPI.md).

**[de-facto] smalltalkCI** (cross-dialect: Pharo, Squeak, GemStone, Moose, GToolkit) se configura con
`.smalltalk.ston`, selecciona por `#classes/#categories/#packages/#projects`, fases pre/postLoading/
Testing, emite JUnit XML; lanza `pharo image eval "smalltalkCI test: 'config.ston'"`. Soporte gst en la
versión actual `[UNVERIFIED]` (https://github.com/hpi-swa/smalltalkCI).

**[de-facto] Squeak** corre su SUnit completo headless vía squeak-ci (`rake test`, ficheros
prepare-test-image.st/tests.st/run-test.sh), reportes JUnit; nomenclatura KernelTests/CollectionsTests
(vs Pharo Kernel-Tests/Collections-Tests) (https://github.com/squeak-smalltalk/squeak-ci).

**[de-facto] GNU Smalltalk = el modelo PORTABLE e image-less más cercano a pandi-sm:** `make check`;
tests en `tests/` como ficheros Autotest `.at` con macros `AT_DIFF_TEST([fichero.st])` (ejecuta un `.st`
y diffea su salida contra la esperada `.ok`), `AT_PACKAGE_TEST([SUnit]/[Parser])`,
`AT_ANSI_TEST([ArrayANSITest], [IntegerANSITest]...)`. Categorías: regresión de lenguaje, algoritmos,
paquetes básicos, conformidad ANSI por clase. **Matiz:** el path image-less de diff es la base; sus
suites SUnit/ANSI sí requieren imagen `gst.im` (https://www.gnu.org/software/smalltalk/manual/html_node/Test-suite.html,
https://github.com/gnu-smalltalk/smalltalk/blob/master/tests/testsuite.at,
https://raw.githubusercontent.com/gnu-smalltalk/smalltalk/master/tests/local.at).

**[de-facto] Amber** = análogo arquitectónico más cercano a un Smalltalk hospedado en Node: Smalltalk→JS
1:1, escrito en sí mismo, con su propio runner SUnit. **SqueakJS** = estrategia opuesta: NO porta tests
sino que CARGA imágenes Squeak reales (1996 → Cog-Spur 64-bit/Sista) y sus SUnit; faltan primitivas
(media MIDI/3D, Socket) (https://amber-lang.net/, https://github.com/codefrau/SqueakJS).

**[síntesis — CONFIRMADO, ver §8] Obstáculos para reutilizar tests `.st` sin SUnit completo ni imagen:**
(a) bootstrap del framework (TestCase/TestResult/TestResource dependen de jerarquía de clases,
excepciones, reflexión/metaclases); (b) las suites ANSI de Squeak/gst dependen de clases concretas no
exigidas por ANSI; (c) formato de carga (fileIn/chunk `.st` con `!`, o Tonel/Monticello) no trivial de
parsear. **Mitigación verificada:** el modelo image-less de gst (`AT_DIFF_TEST`: `gst -r file.st` + diff
de salida) y un runner host (estilo Amber/Vitest en Node) que evalúe fragmentos `.st` y compare
resultados, posponiendo SUnit nativo hasta tener object model + excepciones
(https://github.com/gnu-smalltalk/smalltalk/blob/master/tests/testsuite.at,
https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book:_Pharo_by_Example_5.0_(Ducasse_Zagidulin_Hess_and_Chloupis)/09:_SUnit/9.06:_The_SUnit_Framework).

### T5 — Arquitectura concreta en Node.js (dueño de la implementación)

**[de-facto/síntesis] Parsing.** La precedencia fija (unario > binario > keyword, izquierda-a-derecha,
sin precedencia aritmética) mapea a tres niveles de descenso recursivo → **recursive-descent a mano** da
control total sobre AST, errores, cascadas y pragmas. **Ohm.js** (PEG, separa gramática de acciones
semánticas, soporta left-recursion) es la alternativa principiada/fallback si la gramática cambia mucho
(https://en.wikipedia.org/wiki/Smalltalk, https://ohmjs.org/).

**[de-facto] Object model (lección SqueakJS): plain JS objects con slots explícitos** `{class, hash,
format, oop, pointers:Array (inst + indexable vars), opcional words:Uint32Array / bytes:Uint8Array}`,
**referencias directas, SIN object table**, delegando memoria al GC de JS. Variables de instancia en
array indexado (no propiedades nombradas) porque los bytecodes las referencian por índice; method
dictionaries como `Map`. SmallIntegers = `number` JS directo (sin tagging, distinguidos por `typeof`);
Floats = objetos con flag `isFloat` (https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf).

**[de-facto] `become:`/`allInstances` sin object table.** Object table → `become:` O(1) pero pointers
directos → barrido de heap proporcional al tamaño. SqueakJS evita la object table: enumera vía lista
enlazada de old-space (`nextObject`) + mark-and-sweep de dos fases que corre SOLO en
`become:`/`allInstances`/`allObjects`. El modelo plain-JS / sin object table / SmallInteger nativo está
corroborado independientemente (blog del autor, codefrau.net). En cambio, la cifra concreta "~15M
asignaciones → CERO GC completos" `[UNVERIFIED — self-reported del paper; los hosts primarios cayeron
(ACM 403, freudenbergs.de ECONNREFUSED), no re-derivada de fuente accesible]` es ilustrativa, no un
número auditado (https://gbracha.blogspot.com/2009/07/miracle-of-become.html,
https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf).

**[de-facto] Estrategia de ejecución.** Tree-walking = baseline más simple y portable pero lento por
pointer-chasing (jlox **~144x** más lento que C en fib recursivo `[UNVERIFIED — la cifra exacta no se
verificó contra Crafting Interpreters; úsese solo como orden de magnitud]`). Los dos hosts de producción
eligen opuesto: **SqueakJS = bytecode interpreter** (1-2 órdenes de magnitud más lento que el interp C,
aceptable, JIT-a-JS planeado); **Amber/PharoJS = compile-to-JS** (1:1, sin interpretación en runtime,
mismo orden de magnitud que SqueakJS). **Recomendado: tree-walk primero por corrección, luego compilar
métodos calientes a JS** (https://craftinginterpreters.com/chunks-of-bytecode.html,
https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf).

**[de-facto — pipeline Amber CONFIRMADO en fuente, ver §8]** `Compiler` (facade) →
`CodeGenerator`/`InliningCodeGenerator` (default) → IR → `IRInliner` (reescribe control-flow:
`ifTrue:`, `ifFalse:`, `ifNil:`...) → `IRJSTranslator` (emite JS). **Selector mangling:** unario →
`_selector()` (`yourself` → `_yourself()`); binario → `__mangled` (`3@4` → `(3).__at(4)`); keyword →
`_k1_k2_(...)` (`at:put:` → `_at_put_(3,4)`); instance vars → `self['@name']`
(https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back,
https://raw.githubusercontent.com/amber-smalltalk/amber/master/src/Compiler-Core.st).

**[de-facto] Dispatch.** `send(receiver, selector, args)` explícito recorriendo la cadena de clases vía
`Map`. **Inline caching (inventado para Smalltalk/Self)** guarda método + shape del receptor en el
call-site: monomórfico = una comparación de shape; PIC = conjunto acotado (4/6/8); excederlo → megamórfico
→ lookup lento. V8 usa el mismo mecanismo Shapes+IC, así que mantener objetos del lenguaje monomórficos
deja que rueden por el fast-path de V8; un dispatcher genérico NO alcanza las ICs de V8, por eso conviene
una IC por call-site propia. `super` arranca en la superclase de la clase que define el método;
`doesNotUnderstand:` reifica `Message` y reenvía. Pharo/OpenSmalltalk añade `cannotInterpret:`
(https://en.wikipedia.org/wiki/Inline_caching, https://mathiasbynens.be/notes/shapes-ics,
https://ceur-ws.org/Vol-4139/Paper02.pdf).

**[de-facto] Bloques → arrow functions JS** (capturan `self`/`this` léxicamente; una `function` anónima
referenciando `this.method()` lanza en runtime). Pero las arrows mapean solo PARCIALMENTE: un bloque
siempre retorna su última expresión (bloque vacío → nil) y soporta non-local return, que un `return` de
JS no puede expresar. **Non-local return** (`^` en bloque) retorna del método HOME (no del bloque):
técnica documentada = lanzar un `NonLocalReturn` etiquetado con el marcador de home-context, capturado en
el frame del método home (try/catch/throw); si no se halla la home → error `cannotReturn:` (sideways
return prohibido en Cog). **Captura:** copiar temporales inmutables; **boxear** temporales mutables
compartidos en un tempVector/indirection vector (https://ceur-ws.org/Vol-4139/Paper02.pdf,
https://wirfs-brock.com/allen/things/smalltalk-things/efficient-implementation-smalltalk-block-returns,
https://clementbera.wordpress.com/2015/01/21/context-and-blockclosure-implementation/).

**[de-facto] Frontera de reuso/fidelidad.** Delegar a JS: numbers, strings, arrays, GC. Reimplementar lo
que JS no tiene: identidad (`==`), unicidad de Symbol (tabla de interning de strings, NO `Symbol` de JS
que carece de operaciones de string), `become:`, `doesNotUnderstand:`, `thisContext`/`Context`.
**SmallInteger↔LargeInteger:** rango entero exacto de JS termina en 2^53; BigInt maneja mayores pero con
sintaxis `100n` separada y conversión manual → auto-promoción en overflow. `undefined`/`null` no son
objetos (guardar nil-receiver sends). **Fidelidad exacta es imposible vía transpilación**; solo el
enfoque interpretado (SqueakJS) la logra (https://ceur-ws.org/Vol-4139/Paper02.pdf).

**[de-facto] Bootstrapping/imagen.** SqueakJS carga `.image` binarias reales (old-space linked list,
lee y escribe formato Squeak); Amber/PharoJS NO tienen imagen (clases recargadas cada run por JS
transpilado; class-init/startup re-emitidos como inicialización de clase JS). **Para greenfield Node sin
necesidad de `.image`, el enfoque Amber (kernel bootstrappeado desde fuente/JS al arranque) es más simple
que implementar un lector/escritor de imágenes Squeak** (https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf,
https://ceur-ws.org/Vol-4139/Paper02.pdf).

**[de-facto] SqueakJS es deliberadamente pequeño** (~1000 LOC interp, ~800 object memory, ~1800
primitivas, ~1000 BitBlt; VM en un solo fichero JS). Objetos (incl. stack frames/Contexts) son plain JS
objects → las dev tools de JS inspeccionan estado vivo. **Argumento fuerte para pandi-sm: object model
plain-JS + tabla de primitivas explícita para inspectabilidad**
(https://freudenbergs.de/bert/publications/Freudenberg-2014-SqueakJS.pdf).

### T6 — Spec-driven: veredicto y proceso (dueño de la metodología)

**[NORMATIVO] Contrato spec-first declarado por el propio estándar:** "working only from the standard, a
conforming implementation can be produced" y "Smalltalk programs which conform... will have the same
execution semantics on any conforming implementation"
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] El comité legitima derivar tests:** "Although it was not the intent of the committee to
produce a conformance tool or conformance test suite, the ability to define such conformance measures
should be considered as a test of whether the standard is adequately unambiguous". Es decir: derivar
tests es válido y además audita ambigüedades de la spec
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Las 4 categorías de conformidad mapean a tipos de test:** features definidas y `Erroneous`
(must reject) → aserciones deterministas (positivos/negativos); `Unspecified`/`Implementation-Defined` →
NO admiten aserción de igualdad ("some reasonable behavior is required") → ahí el **dialecto vivo es
oráculo de facto** (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Zonas de alta cobertura testeable:** gramática léxica/sintáctica (precedencia inequívoca,
cascadas, literales numéricos); ambigüedades clásicas que ANSI **resuelve** (`:=` tras identificador sin
`#` se parsea como assignmentOperator, no keyword+`=`; número negativo tras selector binario requiere
espacio); `scaledDecimal` SÍ está en la gramática léxica. Las excepciones y bloques están **plenamente
especificados** (signal ~190 menciones, ensure: 17, retry 4, block constructor 28) — son zona de
conformidad directa, NO necesitan oráculo (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[NORMATIVO] Lo que ANSI deja FUERA (obliga a elegir dialecto/documentar extensión):** concurrencia/
procesos (`Process`/`thread`/`concurren` = 0 ocurrencias en el texto), pragmas (`pragma` = 0), reflexión
("not required, although permitted"), metaclases ("metaclasses are not needed"), arrays dinámicos `{...}`
y byte-arrays `#[...]` (no en la gramática léxica)
(https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**[de-facto] Ningún Smalltalk cumple plenamente ANSI; el grado es debate de comunidad** ("Definitely
not." / "common flame war"). Por tanto "implementar contra un dialecto" NO equivale a "implementar contra
ANSI": el dialecto-oráculo es sustituto imperfecto, válido solo en lo implementation-defined/unspecified
(https://wiki.squeak.org/squeak/172).

**[de-facto] Suite ANSI reutilizable como REFERENCIA, no como artefacto directo:** Camp Smalltalk
`ansi-st-tests` (SUnit-based, Public Domain), **dormida desde 2013-04-25** y acoplada a imágenes vivas.
Sirve para saber QUÉ probar por protocolo, no para correr tal cual en Node
(https://sourceforge.net/projects/ansi-st-tests/).

**[de-facto] GNU Smalltalk demuestra "runtime que envía tests ANSI como SUnit ejecutable" + runner CLI
`gst-sunit`** (`-I/-p/-f/-v`), protocolo `should:`/`shouldnt:` — modelo directo para que pandi-sm
bootstrappee su host-runner en Node (https://www.gnu.org/software/smalltalk/manual/html_node/SUnit.html).

**[de-facto — precedentes de conformance-suites]**
- **WebAssembly (precedente más fuerte):** 4 artefactos co-iguales (spec formal, prosa pseudocódigo,
  **intérprete de referencia en OCaml "written for clarity and simplicity, not speed"**, suite `.wast`).
  Formato `.wast` con aserciones POSITIVAS (`assert_return`) y NEGATIVAS (`assert_invalid`,
  `assert_malformed`, `assert_trap`, `assert_unlinkable`, `assert_exhaustion`) — el split exacto que
  necesita un parser/evaluador (https://github.com/WebAssembly/spec/blob/main/interpreter/README.md,
  https://conrad-watt.github.io/papers/youn2024.pdf).
- **Test262 (>50.000 ficheros):** frontmatter distingue tests negativos por FASE (parse/resolution/
  runtime), flags (onlyStrict/noStrict/module/raw), includes (harness). **Pero TC39 concede: "does not
  consider coverage to be complete"** (https://github.com/tc39/test262,
  https://github.com/tc39/test262/blob/main/INTERPRETING.md).
- **Test262 vs JSCert/JSRef:** los fallos pueden revelar discrepancias entre spec, formalización y los
  PROPIOS tests — la suite no es oráculo infalible. **Implicación: triangular cada divergencia (prosa de
  spec + test + dialecto)** `[confianza media]` (https://github.com/jscert/jscert,
  https://www.doc.ic.ac.uk/~pg/publications/Gardner2015Trusted.pdf).
- **ACATS (Ada, ISO/IEC 18009:1999):** suite madura derivada de spec con tests positivos+negativos,
  trazables por sección del RM, "1821 tests / 255,838 LOC", reconoce "it is not possible to exhaustively
  test for conformity" (https://en.wikipedia.org/wiki/Ada_Conformity_Assessment_Test_Suite).

**[fundamento teórico] Hayes & Jones ("Specifications Are Not (necessarily) Executable")** justifica por
qué partes de la spec no se prestan a tests ejecutables: forzar que todo constructo sea ejecutable
sacrifica completitud/abstracción. Aplicado: contratos abstractos, retornos `unspecified` y puntos
implementation-defined deben capturarse como prosa/decisiones documentadas, no como aserciones de igualdad
`[confianza media]` (https://www.researchgate.net/publication/2632227_Specifications_Are_Not_necessarily_Executable).

## 5. Temas transversales / ángulos adicionales

Estos ángulos no eran dueños de ningún tópico pero condicionan el diseño; se resuelven con la evidencia
existente o se marcan como pendientes de spike.

- **Licencias y procedencia legal `[UNVERIFIED / INSUFFICIENT_EVIDENCE]`.** La investigación NO cubrió la
  licencia de pandi-sm ni el riesgo de derivar de fuentes. Hechos conocidos del corpus: el draft ANSI v1.9
  es de libre descarga pero el estándar oficial es de pago/no redistribuible; el Blue Book tiene copyright
  Addison-Wesley aunque circule en PDF; los repos de referencia son permisivos (Amber MIT, SqueakJS MIT,
  Pharo MIT). **Heurística segura no verificada legalmente:** una gramática reconstruida desde la EBNF y los
  nombres de selectores/protocolos (interfaces) son bajo-riesgo; copiar texto literal de la spec pagada o
  código de método con copyright es alto-riesgo. **Decisión pendiente:** licencia de pandi-sm y política de
  derivación. Requiere revisión humana, no es asunto técnico.

- **Performance en V8 (megamorfismo) `[UNVERIFIED — sin benchmark medido]`.** La evidencia es cualitativa:
  un `send()` genérico se vuelve megamórfico y no alcanza las ICs de V8; mantener objetos del lenguaje
  monomórficos (mismo shape, inicializados igual) los deja rodar por el fast-path. SqueakJS (bytecode) y
  Amber (compile-to-JS) se reportan "same order of magnitude". **No se halló un head-to-head tree-walking
  vs bytecode vs compile-to-JS sobre Node/V8 para una carga Smalltalk** → pandi-sm debe correr sus propios
  `tinyBenchmarks` temprano (https://mathiasbynens.be/notes/shapes-ics).

- **FFI/interop bidireccional con JS.** El bridge de Amber mapea mensajes 1:1 a llamadas/propiedades JS
  (`console log: x` → `console.log(x)`, ivars como `self['@name']`). **Pendiente de diseño:** wrapping de
  Promises/async (Node es asíncrono, Smalltalk asume control síncrono), APIs de Node (fs/net/process) como
  primitivas, marshalling Number/BigInt/String/Array/Map en ambas direcciones
  (https://github.com/amber-smalltalk/amber/wiki/From-smalltalk-to-javascript-and-back).

- **GC e identidad sobre V8.** Reusar el GC de V8 es la recomendación; la consecuencia es que `become:`,
  `allInstances`, weak collections y finalization no son gratis. SqueakJS muestra la salida (lista de
  old-space + GC híbrido bajo demanda). **Pendiente:** `WeakMap`/`WeakRef`/`FinalizationRegistry` para
  weak refs y `allInstances`; preservar `==`/`identityHash` al delegar a objetos JS.

- **Concurrencia / procesos `[fuera de spec ANSI]`.** ANSI deja la concurrencia fuera (0 menciones a
  Process/thread). **Decisión de alcance recomendada: diferir Process/Semaphore en el MVP**; si se soportan,
  mapear a generadores/async sobre el event loop single-thread de Node. No bloquea el baseline.

- **Excepciones — implementación (acoplada a non-local return).** ANSI especifica el contrato completo
  (T1); la mecánica sobre V8 reusa la misma técnica del non-local return: `try/catch/throw` con objetos de
  excepción que llevan el handler context; `ensure:`/`ifCurtailed:` corren en el unwind en orden inverso.
  GNU Smalltalk valida el contrato como dialecto vivo conforme.

- **`become:` y object table — DECISIÓN ARQUITECTÓNICA DE FONDO (resuelta).** Object table → `become:`/
  `allInstances` baratos pero un nivel de indirección en todo acceso; referencias JS directas → simple/
  rápido pero `become:` caro. **Veredicto: referencias directas + enumeración bajo demanda (SqueakJS),
  diferir `become:` eficiente.** No construir object table para el MVP.

- **`doesNotUnderstand:` y reificación de Message.** El objeto `Message` reificado (selector+args) es el
  mecanismo de proxies/metaprogramación. En JS, emulación eficiente = fallback methods en Object por
  selector; integración con bridge JS vía `Proxy` (`handler.apply`)
  (https://ceur-ws.org/Vol-4139/Paper02.pdf).

- **Torre numérica y coerción.** Plan: SmallInteger sobre `number`, auto-promoción a `BigInt` en overflow
  (rango exacto JS termina en 2^53), Float sobre `number`; Fraction y ScaledDecimal (este último SÍ en la
  gramática ANSI) a implementar. **Pendiente:** protocolo de coerción/generality (`retry:coercing:`).

- **Persistencia / imagen.** Sin imagen (baseline Amber-style), el estado se persiste como **fuentes
  `.st`** (chunk/Interchange ANSI o Tonel). Snapshot del heap JS / serialización propia (estilo Fuel) se
  difiere.

- **Tooling / DX.** Smalltalk vive de su entorno reflexivo. Decisión que afecta al evaluador: preservar
  contextos inspeccionables (SqueakJS lo logra porque Contexts son plain JS objects). REPL/workspace,
  inspección de objetos y stack traces Smalltalk mapeados al stack JS son propuesta de valor a planificar.

- **Empaquetado/distribución Node — DEPENDENCIA DE LA CAPA 1 (promovida desde transversal).** ESM vs
  CommonJS y TS vs JS NO son decisiones diferibles: condicionan cómo se escribe el lexer/parser desde el
  primer commit. **Decisión recomendada (para desbloquear la capa 1):** TypeScript + ESM, target Node LTS
  (≥20), un único CLI de entrada que evalúe fuentes `.st`. El kernel `.st` se distribuye como assets junto
  al runtime. No hay evidencia externa que lo imponga; es decisión de ingeniería del proyecto, pero debe
  tomarse antes de escribir la capa 1, no después.

- **Unicode / String / Symbol — DEPENDENCIA BLOQUEANTE DE LAS CAPAS 1 Y 2 (promovida desde transversal).**
  Smalltalk-80 asume Character de 8 bits/ByteString; JS usa UTF-16. Esto NO es transversal sin dueño: es
  prerequisito del **lexer** (cómo se tokeniza `$c`, strings y símbolos) y de la **identidad de Symbol**
  (interning) que el evaluador necesita desde el día 1. **Decisión recomendada (para desbloquear capas
  1/2):** modelar `Character` por code point Unicode y `String` sobre `string` de JS (UTF-16), tratando la
  divergencia ByteString-vs-WideString como detalle de conformidad documentado; `Symbol` mediante una
  **tabla de interning de strings** (no el `Symbol` de JS), de modo que la identidad `==` de selectores
  esté disponible antes que cualquier dispatch. Afecta conformidad de tests de String e interop con fuentes
  `.st`.

## 6. Impacto en pandi-sm: recomendaciones de implementación (Node.js)

**Encuadre (decisión previa a todo):** apuntar a **conformance ANSI INCITS 319-1998** como contrato del
núcleo del lenguaje, usando el draft v1.9 como fuente operativa (incluye rationale). Añadir como
**extensiones explícitamente documentadas en `doc/research`** las conveniencias de-facto que esperan
usuarios de Pharo/Squeak: arrays dinámicos `{ }`, byte-arrays `#[ ]` y `Object subclass:...`. **No** usar
la sintaxis declarativa `Class named:...` como forma primaria (ningún dialecto vivo la usa); preferir
`subclass:` como extensión y, si se quiere conformidad de carga, soportar el Interchange Format ANSI como
formato de importación.

**Arquitectura por capas (baseline ejecutable primero, complejidad incremental):**

0. **Dependencias previas a la capa 1 (decidir ANTES de escribir el lexer).** TS+ESM, Node LTS ≥20 (§5);
   modelo Unicode/String/Symbol con tabla de interning para identidad de Symbol (§5). El artefacto de
   partida del parser es el **Anexo A** (gramática léxica/sintáctica del subconjunto ANSI transcrita).

1. **Parser/Lexer (capa 1).** Recursive-descent a mano en tres niveles (unario/binario/keyword), AST
   explícito, **implementando el Anexo A** (no partir de cero la gramática). Literales ANSI: number
   (decimal/radix), float (e/d/q), `scaledDecimal`, `$c`, string, `#sym`, `#selector`, `#( )`. Resolver
   desde el inicio las ambigüedades que ANSI fija (`:=` vs keyword; espacio antes de número negativo tras
   binario). Añadir `{ }` y `#[ ]` como extensiones marcadas. Mantener Ohm.js como fallback si la gramática
   se vuelve inestable. **Gate cuantificado (ver §6.1):** ≥40 casos positivos cubriendo cada producción del
   Anexo A + ≥15 casos negativos (erroneous/ambigüedades), todos verdes.

2. **Object model / metamodelo (capa 2).** Cada objeto Smalltalk = plain JS object con slots explícitos
   `{class, hash, format, pointers:Array}` (vars de instancia indexadas, NO propiedades nombradas);
   referencias JS directas, **sin object table**; method dictionary = `Map(selector→CompiledMethod)`. Modelar
   el núcleo invariante `Object → Behavior → ClassDescription → Class` + `Metaclass` (hermana de Class).
   Cerrar la metacircularidad con **wiring por mutación estilo JsSOM** (`setClass`), no por inferencia ni
   imagen. `nil` = única instancia de `UndefinedObject`, superclase de la raíz = nil. ProtoObject **opcional**
   (diferible); traits **fuera del MVP**. SmallInteger/Character como valores nativos JS (sin tagging).
   **Gate cuantificado (ver §6.1):** los 23 selectores del `<Object>` protocol respondidos + cierre
   metacircular verificado (`X class class == Metaclass`).

3. **Evaluador (capa 2-3).** Tree-walking sobre AST (correcto y depurable primero). Dispatch explícito
   `send(receiver, selector, args)` recorriendo la cadena de clases vía `Map`; `super` arranca en la
   superclase de la clase definidora; `doesNotUnderstand:` reifica `Message` y reenvía. Bloques → arrow
   functions JS (capturan `self`); copiar temporales inmutables, boxear mutables compartidos en tempVector.
   **Non-local return:** lanzar `NonLocalReturn` etiquetado con marcador de home-context, capturado en el
   frame home (try/catch/throw); `ensure:`/`ifCurtailed:` en el unwind. Excepciones sobre la misma máquina
   try/catch/throw, contrato ANSI completo (`on:do:`/`signal`/`retry`/`resume:`/`pass`/...).

4. **Reuso del runtime JS.** Delegar numbers/strings/arrays/GC a V8. Reimplementar: identidad `==`,
   unicidad de Symbol (tabla de interning, **no** `Symbol` de JS), auto-promoción SmallInteger→BigInt en
   overflow (frontera 2^53). Diferir: `become:` eficiente, `thisContext`/Context reificado, persistencia.

5. **Optimización (diferida, solo si los benchmarks lo piden).** Inline cache propia por call-site
   (monomórfica → PIC); mantener shapes de objetos del lenguaje estables para no luchar contra las ICs de V8;
   eventualmente compilar métodos calientes a JS (estilo Amber). JIT/bytecode/imagen persistente **no son
   MVP**.

**Metamodelo — qué implementar y qué diferir.** Implementar: jerarquía núcleo de 5 clases, method
dictionaries, lookup por superclass chain, self/super, `doesNotUnderstand:` con `Message`, reflexión mínima
de bootstrap (`basicNew`, `instVarAt:`, `perform:withArguments:`, `class`, `respondsTo:`). Diferir:
`become:`, `allInstances` baratos, modificación de clases en caliente avanzada, ProtoObject, traits,
metaclases reificadas más allá de lo necesario para el cierre.

**Suites de test a adoptar (capa por capa).**
- **Capa 1 (parser):** corpus de fragmentos `.st` estilo gst `AT_DIFF_TEST` (literales, unario/binario/
  keyword, cascadas, bloques, arrays), verificados por igualdad de AST/salida.
- **Capa 2 (evaluador):** subconjunto de protocolos ANSI de Object/Boolean/Number/Magnitude/Block/Exception
  evaluados como fragmentos host (Node/Vitest) comparando resultado esperado.
- **Capa 3 (biblioteca base):** protocolos ANSI de Collection/SequencedCollection/Stream/String/Symbol,
  tomando casos portables del `testsuite.at` de gst y de la batería ANSI de Squeak (como referencia de QUÉ
  probar, no como artefacto directo).
- **Harness:** runner **host en Node/Vitest** que evalúe fragmentos `.st` y compare resultados; emitir JUnit
  XML (como smalltalkCI) para CI. **Bootstrappear SUnit nativo solo cuando existan clases + excepciones.**

### 6.1 Criterios de éxito CUANTIFICADOS por capa (gates verificables)

Las "capas de conformidad" se vuelven gates concretos (mindset Karpathy/MSE: criterio de éxito
verificable). Cada gate es una condición binaria CI-verificable; los N son mínimos de arranque, no topes.

| Capa | Gate (condición de "verde") | Selectores/N mínimos | Artefacto de tests |
|------|------------------------------|----------------------|--------------------|
| **1 — Parser/Lexer** | Todas las producciones del **Anexo A** parsean a AST esperado; las ambigüedades resueltas y los casos erroneous se rechazan | ≥40 casos positivos (1+ por producción: literales number/radix/float/scaledDecimal/`$c`/string/`#sym`/`#( )`, unario/binario/keyword, cascada, asignación, `^`, bloque con args/temps) + ≥15 negativos | corpus `.st` estilo `AT_DIFF_TEST` (igualdad de AST) |
| **2 — Evaluador / object model** | Los **23 selectores del `<Object>` protocol** responden con semántica ANSI; envío + self/super + `doesNotUnderstand:` + non-local return correctos; cierre metacircular | `<Object>`: `= == ~= ~~ class copy doesNotUnderstand: error: hash identityHash isKindOf: isMemberOf: isNil notNil perform: perform:with: perform:with:with: perform:with:with:with: perform:withArguments: printOn: printString respondsTo: yourself` (23) + `Boolean` mínimo (`ifTrue:ifFalse:`, `and:`, `or:`, `not`) | fragmentos host (Node/Vitest), resultado esperado |
| **3 — Biblioteca base** | Subset portable de protocolos ANSI por familia, gateado por familia | `Number`/`Magnitude`: `+ - * / < <= > >= = max: min: abs negated`; `Collection`: `do: collect: select: reject: detect: detect:ifNone: inject:into: size isEmpty includes: add:`; `SequencedCollection`: `at: at:put: first last , copyFrom:to:`; `Stream`: `next nextPut: atEnd contents upToEnd`; `String`/`Symbol`: `, size asSymbol asString =` + identidad de Symbol interned | casos portables de `testsuite.at` (gst) + batería ANSI Squeak como referencia |
| **4 — Excepciones** | Contrato ANSI ejecutable | `on:do: ensure: ifCurtailed: signal signal: return return: retry retryUsing: resume resume: pass` | fragmentos host + casos negativos (resume de no-resumable = erroneous) |

Regla de avance: no se entra a la capa N+1 hasta que el gate de la capa N esté verde en CI. SUnit nativo
solo tras la capa 4 (necesita clases + excepciones).

**Spec-driven: sí, como esqueleto.** Ver §7.

## 7. Spec-driven development: veredicto y cómo aplicarlo aquí

**Veredicto: VIABLE y rentable, pero solo como ESQUELETO — spec-first para lo determinista, dialecto-oráculo
para lo indefinido.** No implementar toda la spec ANSI de golpe.

Fundamento: (a) el propio estándar afirma que se puede producir una implementación conforme trabajando solo
desde la spec, y que derivar medidas de conformidad audita la ambigüedad del estándar; (b) sus 4 categorías
de conformidad separan limpiamente lo testeable de forma determinista (features definidas + `Erroneous`) de
lo que requiere oráculo (`Unspecified`/`Implementation-Defined`); (c) la gramática léxica/sintáctica,
bloques y excepciones están plenamente especificados → alta cobertura sin oráculo; (d) imagen, concurrencia,
pragmas, reflexión y metaclases quedan fuera → ahí hay que elegir dialecto (Pharo o Squeak) como oráculo y
**documentar la elección**.

**Cómo aplicarlo en pandi-sm (integrado con Karpathy/TDD, Red→Green→Refactor):**

1. **Parser desde la BNF ANSI con tests positivos Y negativos.** Positivos: precedencia, cascadas, literales,
   `scaledDecimal`. Negativos (estilo `assert_malformed`/`assert_invalid` de WebAssembly): casos que ANSI
   declara erroneous o las ambigüedades resueltas (`:=` vs keyword, número negativo sin espacio). Máxima
   cobertura, mínima dependencia de imagen.
2. **Object model + evaluador mínimos** con criterios de éxito derivados del modelo computacional ANSI
   (sección 3.1): envío, lookup, self/super, `doesNotUnderstand:`, closures, non-local return.
3. **Protocolos básicos como capas de conformidad** (Boolean → Numeric → Collection → Stream → Exception),
   cada uno con su gate de tests.
4. **Harness host (Node/Vitest)** que evalúe fragmentos Smalltalk y compare resultados; posponer SUnit-in-
   image. Inspirarse en el intérprete de referencia de WebAssembly ("clarity, not speed") y en `gst-sunit`.
5. **Trazabilidad y desviaciones:** nombrar/organizar tests por sección de la spec (estilo ACATS/Test262
   frontmatter: cada test referencia su producción del Anexo A o su sección ANSI). Mantener un **log de
   desviaciones** en `doc/research/` (una entrada por desviación con: feature, decisión, origen `spec` /
   `dialecto:<cuál>` / `extensión-propia`, y test que la cubre). Desviaciones esperadas a registrar desde
   el día 1: `{ }`, `#[ ]`, pragmas, metaclases reificadas, procesos, modelo Unicode/String.
6. **Triangular cada divergencia** (prosa de spec + test + dialecto): la suite no es oráculo infalible
   (lección JSCert), y la cobertura nunca es completa (Test262/ACATS lo conceden explícitamente).
7. **Capturar lo no-ejecutable como prosa, no como aserción de igualdad** (Hayes & Jones): contratos
   abstractos, retornos `unspecified` y puntos implementation-defined van documentados, no testeados por
   igualdad.

## 8. Validación / qué se verificó (veredictos adversariales)

Cuatro claims clave fueron sometidos a verificación adversarial (intento de refutación contra fuentes
independientes/primarias). Veredictos literales:

- **T1 — Recomendación de conformance (ANSI baseline + extensiones de-facto documentadas): `confirmed`.**
  Todas las premisas fácticas se confirmaron contra el texto primario del draft v1.9: ANSI es el único
  contrato formal dialect-neutral (no existe ISO Smalltalk); define gramática + precedencia/cascadas +
  block closures + non-local return + `doesNotUnderstand:` + protocolo de excepciones + Object protocol;
  la producción `<literal>` enumera exactamente 6 formas y un grep del texto completo (304 pp) NO halló `#[`
  ni `{` en la gramática; Pharo/Squeak proveen `{ }`, `#[ ]` y `Object subclass:...` como extensiones. La
  recomendación es síntesis de ingeniería, no cita única (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf,
  https://files.pharo.org/media/pharoCheatSheet.pdf, https://en.wikipedia.org/wiki/Smalltalk).

- **T3 — Metaclases comunes a todos los dialectos; ProtoObject y traits como adiciones Squeak/Pharo:
  `confirmed`.** El esquema de metaclases implícitas paralelas es uniforme (Wikipedia, gtoolkit, Squeak by
  Example). ProtoObject introducido en Squeak 3.0 (corroboración por snippets secundarios; el doc primario
  3.2 estaba offline → DNS failure, no debilita el punto sustantivo). Traits = ECOOP 2003, posterior al
  Blue Book (1983) y ANSI (1998). Núcleo de 5 clases invariante
  (https://en.wikipedia.org/wiki/Metaclass, https://book.gtoolkit.com/understanding-smalltalk-classes-and-metacl-9rpd5bxi9ai19d3ctknxhyvt6).

- **T3 — `nil` única instancia de `UndefinedObject`, termina las cadenas: `confirmed`.** Tutorial Squeak
  ("the sole instance of an UndefinedObject is nil"), GNU Smalltalk (instanciar lanza "use nil" → singleton),
  Pharo by Example (`Object superclass >>> ProtoObject`, `ProtoObject superclass >>> nil`). Matiz no-
  refutatorio: en Pharo moderno la superclase inmediata de Object es ProtoObject; en Smalltalk-80 clásico es
  nil directo. La página GNU `UndefinedObject` dio HTTP 429 pero el contenido se confirmó por 3 fuentes
  independientes (https://www.bildungsgueter.de/Smalltalk/Pages/MVCTutorial/Pages/UndefObject.htm).

- **T4 — Comando CLI de tests de Pharo (`--junit-xml-output --fail-on-failure`, regex de paquete):
  `confirmed-con-atribución-corregida`.** El claim sustantivo (Pharo corre tests headless y emite JUnit
  XML, con regex de paquete) está confirmado contra el árbol Pharo13: el runner de la subcommand `test`
  es `ClapTestRunner` y un bats test cubre `--fail-on-failure`; dos tests del runner cubren regex
  `'SUnit.*'`; el ejemplo macOS coincide casi textualmente con el Jenkinsfile de opensmalltalk-vm
  (línea 156). **Corrección de atribución (re-redactada respecto a la versión anterior del reporte, que
  afirmaba "`ClapTestRunner.class.st` define el flag `junit-xml-output`" — la fuente NO lo respalda):**
  (a) la ruta `src/SUnit-Basic-CLI/ClapTestRunner.class.st` da 404; `ClapTestRunner` vive en
  `src/Clap-Commands-Pharo/ClapTestRunner.class.st`; (b) las cadenas literales `junit-xml-output` y
  `fail-on-failure` NO están en `ClapTestRunner` sino en
  `src/JenkinsTools-Core/TestCommandLineHandler.class.st`. Se cita el tag fijo Pharo13 en vez de una rama
  móvil para que la cita no se pudra. Salvedad: de las 2 fuentes originalmente citadas para el comando,
  solo el Jenkinsfile lo respalda; la otra (pharoweekly) NO documenta el comando de tests
  (https://github.com/pharo-project/pharo/blob/Pharo13/src/Clap-Commands-Pharo/ClapTestRunner.class.st,
  https://github.com/pharo-project/pharo/blob/Pharo13/src/JenkinsTools-Core/TestCommandLineHandler.class.st,
  https://github.com/pharo-project/opensmalltalk-vm/blob/pharo-9/Jenkinsfile).

- **T4 — Obstáculos para reutilizar tests `.st` + mitigación gst/host-runner: `confirmed`.** Verificado en
  fuente: `SUnit.st` usa handlers anidados de excepción y reflexión (`allSubclasses`, `perform:`); `AnsiRun.st`
  liga a clases concretas; gst mantiene parsers de chunk distintos. La mitigación `AT_DIFF_TEST` se confirmó
  con precisión en `tests/local.at` (`gst -r file.st` + diff vs `.ok`). Salvedad honesta: el path image-less
  de diff es la BASE; las suites SUnit/ANSI de gst sí requieren imagen `gst.im`
  (https://raw.githubusercontent.com/gnu-smalltalk/smalltalk/master/tests/local.at,
  https://github.com/bonzini/smalltalk/blob/master/packages/sunit/SUnit.st).

- **T5 — Pipeline del compilador Amber y selector mangling: `confirmed`.** Verificado en la fuente actual de
  Amber: `Compiler-Core.st` (facade + `codeGeneratorClass` default `InliningCodeGenerator`), `Compiler-
  Inlining.st` (`IRInliner`, selectores inlinados de control-flow), `Compiler-IR.st` (`IRJSTranslator`). El
  mangling (`_yourself()`, `(3).__at(4)`, `_at_put_(3,4)`, `self['@name']`) confirmado en wiki + fuente
  (`Kernel-Methods.st` con `self["@rawTimeout"]`). Salvedad: el blog originalmente citado dio HTTP 404; el
  claim no depende de él (https://raw.githubusercontent.com/amber-smalltalk/amber/master/src/Compiler-Core.st).

- **T4 — Alcance ANSI por protocolos: `partially-confirmed`.** Verificado contra el texto primario que ANSI
  define por protocolos + gramática y excluye GUI/DB/imagen/namespaces/reflexión-más-allá-de-kernel/conformance-
  suite. **Inexactitud corregida:** ANSI **SÍ** especifica I/O abstracto (Stream Protocols 5.9 / File Stream
  Protocols 5.10) — agrupar "IO" entre lo no-especificado es incorrecto; "packaging" sí está fuera. El claim
  de "conformidad por paquetes comunitarios" tiene soporte débil (https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf).

**Verificación documental adicional sin veredicto formal pero confirmada en fuente primaria (T1/T2/T3/T6):**
gramática EBNF, precedencia, literales, semántica de envío/super/`doesNotUnderstand:`, bloques, non-local
return y excepciones se citaron verbatim del draft v1.9; los bytecodes Blue Book del mirror RMoD Ch.28; el
wiring de metaclase, `ReturnException` y `SObject` del repo JsSOM; los conteos de palabras (Process/thread/
concurren/pragma = 0; signal=190; ensure:=17) sobre el texto completo extraído localmente.

## 9. Coverage gaps & qué verificar después

- **Licencia y procedencia legal de pandi-sm `[INSUFFICIENT_EVIDENCE]`** — no investigado; requiere decisión
  humana (licencia del proyecto + política de derivación de gramática/selectores vs texto/código con
  copyright). Bloqueante para distribución, no para el spike técnico.
- **Benchmarks reales sobre Node/V8 `[UNVERIFIED]`** — no existe head-to-head tree-walking vs bytecode vs
  compile-to-JS para carga Smalltalk; correr `tinyBenchmarks` propios temprano para datos reales de
  megamorfismo/deopts/coste de contextos.
- **Mecánica exacta del non-local return de Amber a JS** — wiki indica BlockClosure→function y uso de Error
  nativo; confirmar leyendo el runtime de Amber (boot.js/compiler) si se adopta su técnica.
- **Inventario exacto de clases ANSI** — la lista del paquete de Squeak (ArithmeticError, DateAndTime,
  Duration, ScaledDecimal...) y de los `*ANSITest` de gst no se confirmó contra el código; verificar contra el
  changeset SqueakMap y `tests/AnsiRun.st`.
- **Conteos de tests Pharo a nivel de método** — los ~90/~34/etc. son CLASES, no métodos/aserciones; recontar
  si se usa como criterio de éxito.
- **Validación de citas vs. realidad del repo (pasada parcial).** Al menos una URL de GitHub citada
  (ClapTestRunner en `src/SUnit-Basic-CLI/`) NO resolvía y la atribución de archivo era incorrecta — ya
  corregida (ruta real `src/Clap-Commands-Pharo/`; flags en `src/JenkinsTools-Core/TestCommandLineHandler.class.st`)
  y fijada al tag Pharo13 para que no se pudra. No se hizo una pasada exhaustiva de link-liveness sobre
  TODAS las rutas/anclas de GitHub citadas: pendiente verificar que cada una siga viva y contenga lo
  afirmado, idealmente fijando commits/tags en vez de ramas móviles.
- **Páginas primarias inaccesibles** — GNU Smalltalk syntax (HTTP 429), PDF SqueakJS host primario
  (ECONNREFUSED; ACM 403; leído vía mirror HPI), Pharo gforge (DNS), webstore ANSI (403). Las afirmaciones
  dependientes se respaldaron en mirrors/fuentes secundarias **sin re-derivar las citas exactas**; revalidar
  contra la fuente primaria si hay dudas (afecta sobre todo a las cifras `[UNVERIFIED]` arriba).
- **Gramática de partida para la capa 1 — CERRADO.** El **Anexo A** transcribe el subconjunto léxico/de
  método ANSI (tokens, precedencia, cascadas, bloques, ambigüedades) como artefacto copy-pasteable para el
  parser. Pendiente menor: si se quiere una PEG ejecutable directa (Ohm.js/PetitParser) en vez de
  recursive-descent a mano, traducir el Anexo A a la sintaxis de la herramienta (mecánico, no investigación).
- **Criterios de éxito por capa — CERRADO.** §6.1 define gates cuantificados (N de casos +/−, selectores
  mínimos de `<Object>`, subset de Collection/Stream/Number) verificables en CI.
- **Unicode/String/Symbol y empaquetado (TS/ESM) — PROMOVIDOS a dependencias de capa 1/2 (§5), ya no
  transversales sin dueño.** Bloquean lexer e identidad de Symbol desde el inicio; §5 fija decisión
  recomendada para desbloquearlas.
- **Async/FFI, concurrencia, torre numérica completa, `become:` eficiente, tooling/DX** — ángulos
  transversales (§5) sin dueño de tópico; requieren spikes de diseño propios cuando toque cada capa (no
  bloquean el baseline).
- **Hayes & Jones y artículo 2ality Test262** — citados vía resúmenes/README (2ality dio 404 real); citas
  textuales no verificadas palabra por palabra.

## 10. Confidence & caveats

- **Alta confianza (fuente primaria verificada):** todo lo etiquetado [NORMATIVO] proviene del draft ANSI
  v1.9 leído directamente (gramática, precedencia, protocolos, conformidad, bloques, non-local return,
  excepciones, exclusiones). Las decisiones de object model/dispatch/blocks/non-local-return en JS provienen
  del paper SqueakJS (DLS 2014) y del repo JsSOM, ambos inspeccionados. El pipeline de Amber, el comando CLI
  de Pharo y la mitigación de tests gst fueron CONFIRMADOS adversarialmente contra el código fuente.

- **Confianza media:** la divergencia exacta de Cuis respecto a `{ }` no se confirmó contra docs de Cuis (un
  snippet aislado afirmaba que NO los soporta — no asertado). El alcance ANSI fue `partially-confirmed` (I/O
  abstracto SÍ especificado, corrección aplicada). Las lecciones de JSCert (suite no infalible) y Hayes &
  Jones se basan en resúmenes, no en PDFs completos. La recomendación de SmallInteger nativo es cualitativa,
  sin benchmark.

- **Caveats de procedencia:** este documento es **prospectivo** — el repo no tiene código aún, así que ninguna
  recomendación está validada contra una implementación de pandi-sm. Los veredictos adversariales reducen el
  riesgo de afirmar falsedades pero no sustituyen la validación empírica (correr el parser/evaluador contra el
  corpus de tests por capas). Las cifras numéricas self-reported o no contrastadas contra código llevan marca
  `[UNVERIFIED]` **inline en su punto de uso** (no solo aquí en §10): 2830 ANSI Squeak (§4 T4), jlox ~144x
  (§4 T5), 15M asignaciones/0 GC (§2 y §4 T5). Los ~90/~34 conteos de Pharo son CLASES (no métodos),
  verificados vía GitHub API pero marcados aproximados a nivel de método.

- **Riesgo residual principal:** la decisión de licencia/legal (§5, §9) es el único gap que puede bloquear la
  distribución y no es resoluble por investigación técnica. Todo lo demás es ejecutable de inmediato como
  baseline: parser recursive-descent + object model plain-JS sin object table + evaluador tree-walking +
  kernel bootstrappeado desde fuente, con conformidad ANSI por capas vía harness host en Node.

## Anexo A — Gramática léxica/sintáctica del subconjunto ANSI (artefacto de partida para la capa 1)

Transcripción del subconjunto léxico y de método de ANSI INCITS 319-1998 (draft X3J20 v1.9), reordenado
como artefacto copy-pasteable para implementar el parser de la capa 1. Las producciones provienen de las
secciones 3.4 (gramática de método) y 3.5 (gramática léxica) del draft, citadas verbatim en los hallazgos
de T1. Notación EBNF de ANSI: `[..]` opcional, `(..)` agrupación, `*` cero-o-más, `+` uno-o-más, `|`
alternativa, `'x'` literal. Convención de ángulos del estándar: `<categoría>` = categorías de la gramática
de método; identificadores desnudos = categorías léxicas (tokens). **Esta transcripción es el binding
contract del lexer/parser; no se inventó ninguna producción — donde el draft no fija orden concreto se
anota.**

### A.1 Tokens léxicos (sección 3.5)

```ebnf
identifier      ::= letter (letter | digit)*
keyword         ::= identifier ':'
binarySelector  ::= binaryCharacter+
binaryCharacter ::= '~' | '!' | '@' | '%' | '&' | '*' | '+' | ',' | '/' |
                    '<' | '=' | '>' | '?' | '\' | '|' | '-'        (* y otros del conjunto binario *)
assignmentOperator ::= ':='
returnOperator     ::= '^'

(* Números *)
<number literal> ::= ['-'] <number>          (* el signo negativo es léxico, NO un mensaje unario;
                                                se permite whitespace entre '-' y <number> *)
<number>        ::= integer | float | scaledDecimal
integer         ::= decimalInteger | radixInteger
radixInteger    ::= radixSpecifier 'r' radixDigits     (* p.ej. 16rFF *)
float           ::= mantissa [exponentLetter exponent] (* e -> FloatE, d -> FloatD, q -> FloatQ *)
scaledDecimal   ::= scaledMantissa 's' [fractionalDigits]   (* p.ej. 1.234s4 *)
(* integers: rango ilimitado (ISO/IEC 10967) *)

(* Literales no numéricos *)
quotedCharacter ::= '$' character                       (* $c *)
quotedString    ::= "'" (stringChar | "''")* "'"         (* '' escapa la comilla *)
hashedString    ::= '#' quotedString                     (* #'sym' *)
quotedSymbol    ::= '#' (identifier | keyword+ | binarySelector)   (* #sym, #at:put:, #+ *)
quotedSelector  ::= '#' (unarySelector | binarySelector | keywordSelector)
<array literal> ::= '#(' <array element>* ')'            (* ÚNICO literal de colección en ANSI *)
```

**Fuera de ANSI (extensiones de dialecto, marcar como tales en el parser):** array dinámico `{ expr.
expr. ... }` (Pharo/Squeak) y byte-array literal `#[ 1 2 3 ]` (Pharo/Squeak). NO están en la gramática
léxica del estándar; si pandi-sm los soporta, va como extensión documentada (§6, encuadre).

### A.2 Mensajes y precedencia (sección 3.4.5.3)

```ebnf
<expression>      ::= <assignment> | <basic expression>
<assignment>      ::= <assignment target> assignmentOperator <expression>   (* admite a := b := expr *)
<basic expression>::= <primary> [<messages>] [<cascaded messages>]
<primary>         ::= identifier | <literal> | <block constructor> | '(' <expression> ')'

(* precedencia fija: unario > binario > keyword, estricta izquierda-a-derecha, SIN precedencia aritmética *)
<messages>        ::= (<unary message>+  <binary message>* [<keyword message>])
                    | (<binary message>+ [<keyword message>])
                    | <keyword message>
<unary message>   ::= unarySelector
<binary message>  ::= binarySelector <binary argument>
<binary argument> ::= <primary> <unary message>*
<keyword message> ::= (keyword <keyword argument>)+
<keyword argument>::= <primary> <unary message>* <binary message>*
<cascaded messages> ::= (';' <messages>)*
```

Nota: `1 + 2 * 3` evalúa a **9** (izquierda-a-derecha), no 7.

### A.3 Bloques (sección 3.4.4)

```ebnf
<block constructor> ::= '[' <block body> ']'
<block body>        ::= [<block argument>* '|'] [<temporaries>] [<statements>]
<block argument>    ::= ':' identifier
<temporaries>       ::= '|' identifier* '|'
<statements>        ::= (<return statement> ['.'])
                      | (<expression> ['.' <statements>])
                      | empty
<return statement>  ::= returnOperator <expression>     (* '^' : retorno (no-local si está en bloque) *)
```

Aridad → protocolo de evaluación: 0 args → `value`; 1 → `value:`; 2 → `value:value:`; >2 →
`valueWithArguments:`. `self` dentro del bloque = el de la home activation. `^` como última sentencia de
un bloque retorna desde la **home activation** (termina el método encerrante); es **undefined** si la home
ya terminó.

### A.4 Ambigüedades que el parser DEBE resolver (sección 3.5.4/3.5.5 — casos de test negativos)

1. **`:=` vs keyword.** Si un `:` seguido de `=` sigue inmediatamente a un identifier sin `#` previo y sin
   whitespace intermedio, el token es `identifier` + `assignmentOperator`, NO `keyword` + `=`.
2. **Número negativo tras selector binario.** Si un `<number literal>` negativo sigue a un binarySelector,
   DEBE haber whitespace intermedio (p.ej. `3 - -4` válido; `3 --4` no es `3 - (-4)`).

### A.5 Cobertura del Anexo A para la capa 1

El Anexo A cubre las producciones que el gate de la capa 1 exige (§6.1): cada token de A.1, cada nivel de
precedencia de A.2, cascadas, bloques de A.3, y los dos casos negativos de A.4. NO incluye la gramática de
programa abstracto (3.3) ni el Interchange Format (cap. 4): la sintaxis de definición de clase
(`subclass:` de-facto, o `Class named:...` declarativa ANSI) se trata en la capa 2 como entrada al object
model, no en el lexer de expresiones. Fuente verbatim de todas las producciones:
https://wiki.squeak.org/squeak/uploads/172/standard_v1_9-indexed.pdf (secciones 3.4 y 3.5).
