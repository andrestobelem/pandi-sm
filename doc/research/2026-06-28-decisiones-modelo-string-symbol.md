# Decisiones de modelo bloqueantes para L0: String/Character y tabla de Symbol

Date: 2026-06-28

> **Status: DECISIÓN.** Las dos decisiones de modelo que `§5.0` (L0) del plan por
> capas declara *bloqueantes y documentadas en `doc/research/`*. L0 fija sólo la
> **decisión**; las firmas TS y la tabla real se escriben cuando L1/L2/L4 las
> consuman. Fuente operativa: `doc/research/2026-06-28-pandi-sm-plan-de-implementacion-por-capas.md`
> (§5.0, §5.1, §5.2) y el deep-research `2026-06-28-smalltalk-implementation-node-deep-research.md`.

## Objetivo

Dejar cerradas, antes de escribir el lexer, las dos decisiones de modelo que
condicionan cómo se escribe el código desde el primer commit: (a) el modelo
Unicode de `String`/`Character` y (b) cómo se internan los `Symbol`. Sin esto,
L1 tomaría decisiones implícitas difíciles de revertir.

## Fuentes revisadas

- **Plan por capas, §5.0/§5.1/§5.2** — `doc/research/2026-06-28-pandi-sm-plan-de-implementacion-por-capas.md`. Declara ambas decisiones como bloqueantes de L0 y difiere su implementación.
- **Deep research Smalltalk-on-Node** — `doc/research/2026-06-28-smalltalk-implementation-node-deep-research.md`. Object model sin object table (lección SqueakJS/Amber), interning de Symbol para `==`.
- **ANSI INCITS 319-1998 (draft v1.9)** — protocolos `<Character>`, `<String>`, `<Symbol>`; `Symbol` es subclase de `String` y sus instancias son únicas (interned).

## Decisión (a) — Modelo Unicode de String/Character

- **`Character` = un code point Unicode** (no una unidad UTF-16, no un byte). El
  protocolo `Character>>asInteger`/`value:` opera sobre el code point.
- **`String` = secuencia lógica de `Character`** respaldada por `string` JS
  (UTF-16 interno de V8). La iteración y el conteo de posiciones del lexer (L1)
  se hacen **por code point** (iterar con `for...of` / `codePointAt`), de modo que
  los caracteres fuera del BMP (surrogate pairs) cuenten como **un** `Character` y
  no rompan columnas/offsets.
- **`ByteString` vs `WideString` queda DIFERIDA** (L4): el MVP no distingue
  representación de ancho fijo; es una optimización de memoria, no de semántica.
  Se registra como divergencia consciente respecto a Pharo/Squeak (que sí
  distinguen) en el log de desviaciones.
- **Origen:** *ingeniería*. Divergencia (ByteString/WideString diferida) frente
  al dialecto, documentada.

**Por qué.** Apoyarse en el `string` UTF-16 de V8 evita reimplementar memoria de
caracteres, pero contar por unidad UTF-16 corrompería posiciones con emoji/CJK
suplementario; iterar por code point da la semántica `Character` correcta con
costo casi nulo. La distinción de ancho es puramente de espacio y no aporta al
walking skeleton.

## Decisión (b) — Tabla de interning de Symbol propia

- **Interning propio, NO el `Symbol` de JavaScript.** pandi-sm mantiene su propia
  tabla `texto → SymbolId` (p.ej. `Map<string, SymbolId>`), de modo que dos
  `#foo` produzcan el **mismo** objeto Smalltalk y `#foo == #foo` sea verdadero
  por identidad. El `Symbol` de JS no sirve: no es subclase de `String` ni expone
  el protocolo `<Symbol>`/`<String>` que ANSI exige.
- **L1 emite el TEXTO del símbolo, no lo interna.** El lexer produce el lexema
  (`#foo`, `#at:put:`, `#+`); el interning para `==` es responsabilidad de L2/L4.
- **Los selectores del method dictionary se indexan por `SymbolId`** (la `Map`
  de despacho de L2 usa el id interno, no el `string`), unificando "selector" y
  "symbol literal" en una sola tabla.
- **Origen:** *ingeniería* (la tabla) + *dialecto:Pharo* (L1 emite lexema, no
  interna).

**Por qué.** La unicidad de `Symbol` es semántica observable (`==`, claves de
method dict, `perform:`). Una tabla propia la garantiza y mantiene el símbolo como
un objeto Smalltalk de pleno derecho; reciclar `Symbol` de JS rompería la
jerarquía `Symbol < String` y el protocolo.

## Impacto en el repo

- **L0 (hoy):** sólo este documento. NO se escribe `SymbolTable` ni el modelo
  `String/Character` (diferidos a L2/L4 según `§5.0 — Alcance diferido`).
- **L1:** el lexer itera por code point y emite lexema de Symbol sin internar.
- **L2/L4:** materializan `SymbolTable` (interning + `SymbolId`) y el modelo
  `String/Character`; la resolución ByteString-vs-WideString se decide en L4.

## Validación

Estas decisiones se verifican indirectamente por los gates de sus capas: en L1,
los casos de Unicode fuera del BMP y de `#sym`/`#at:put:`/`#+` del corpus; en
L2, `#foo == #foo` por identidad y el lookup por `SymbolId`. En L0 no hay código
que validar — el gate de L0 es la cadena toolchain verde.

## Próximos pasos

- Escribir las firmas TS de `SymbolTable` y `StString`/`StCharacter` **cuando**
  L1/L2 las consuman (no antes — evita topología especulativa).
- Decidir ByteString-vs-WideString en L4 con datos de memoria reales.
- Registrar en el log de desviaciones la diferencia con Pharo/Squeak sobre ancho
  de String (ver `doc/research/log-de-desviaciones.md`).
