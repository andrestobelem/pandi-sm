# L1 — Decisiones resueltas (cierre de producciones abiertas del Anexo A + correcciones del pase adversarial)

Date: 2026-06-28

> **Status: DECISIÓN (binding contract de L1).** Sintetiza el workflow de diseño
> `wf_669346a9-1f2` (6 facets × diseño + verificación adversarial ANSI, 12 agentes).
> Todos los facets salieron `unsound` (6 blockers, 21 majors, 19 minors) — el pase
> adversarial cumplió su función: encontró producciones inventadas y dos
> **mis-lecturas del gate §5.1** que aquí se corrigen. Este documento RESUELVE las
> producciones que el Anexo A deja abiertas y fija las decisiones cross-facet
> coherentes. Fuente: `2026-06-28-smalltalk-implementation-node-deep-research.md`
> (Anexo A) + `2026-06-28-pandi-sm-plan-de-implementacion-por-capas.md` (§5.1).

## Objetivo

Dejar el contrato de implementación de L1 sin ambigüedad antes de escribir el
lexer/parser: alfabetos léxicos, autómatas numéricos, las 2 ambigüedades A.4, el
catálogo AST + `astToJSON` canónico, y el catálogo único de error-codes.

## Correcciones al gate del plan §5.1 (mis-lecturas detectadas por el pase adversarial)

El plan §5.1 lista `A.4 caso 1` y `A.4 caso 2 (3 --4)` entre los casos **negativos**
(que `parse` debe rechazar con `code+span`). **Es incorrecto frente a la gramática
ANSI** (5 de 6 verificadores convergieron):

- **CORR-1 — A.4 caso 2 (`3 --4`) NO es error.** `-` ∈ `binaryCharacter` y
  `binarySelector ::= binaryCharacter+`, así que por maximal-munch `--` es UN
  `binarySelector`. `3 --4` parsea **válido** como `MessageSend(3, '--', [4])` (el
  `doesNotUnderstand: #--` es semántica de L2, no error sintáctico de L1). El
  `E_NEG_NO_SPACE` que los specs inventaron rechaza entradas válidas. **Se elimina
  `E_NEG_NO_SPACE`.** El sentido real de A.4 caso 2 es un **diferencial**: el
  whitespace cambia el AST. Se reemplaza el negativo por un POSITIVO diferencial:
  `3 --4 ⇒ MessageSend(3,'--',[4])` vs `3 - -4 ⇒ MessageSend(3,'-',[Literal -4])`.
- **CORR-2 — A.4 caso 1 (`a:=b`) NO es error.** `a:=b` lexea `identifier(a)`
  `assignmentOperator(:=)` `identifier(b)` ⇒ `Assignment` (positivo). El lexer
  prefiere `:=` cuando ve `:` pegado a `=`. **Se elimina `E_ASSIGN_VS_KEYWORD`** (no
  tiene disparador real). El negativo honesto es `3 := 4` ⇒ `E_UNEXPECTED_TOKEN`
  (target literal no asignable; lo detecta el parser, no la ambigüedad léxica).

Ambas correcciones se registran como [[log-de-desviaciones]] (DEV-009, DEV-010) y
NO bajan el conteo del gate de negativos (quedan ≥18 negativos reales, ver §R12).

## Resoluciones cross-facet (R1–R13)

### R1 — Modelo de posición (offset / line / column)
`offset` = índice de **unidad UTF-16** (0-based), `span.end` **exclusivo** ⇒
`source.slice(start.offset, end.offset)` recupera el lexema exacto (reversible,
nativo JS). `column` = cuenta de **code points** en la línea (1-based; un surrogate
pair = 1 columna), para honrar §5.1 ("por code point"). `line` 1-based; `\n`,
`\r\n` y `\r` cuentan como 1 salto. offset y column pueden divergir en chars del
plano astral — intencional y documentado (corrige el claim falso "offset en code
points hace `slice` reversible"). Origin: ingeniería.

### R2 — Número negativo léxico (sin `E_NEG_NO_SPACE`, ver CORR-1)
El `-` inicia un **literal numérico negativo** sólo cuando (a) está pegado a un
dígito (o `.`dígito) y (b) está en **posición de operando**, determinada por el
token previo: inicio de input, `(` `[` `{` `#(`, `binarySelector`, `keyword`,
`:=`, `^`, `.`, `;`, `|`, o escaneo de elemento dentro de `#( )`. Si el token
previo es un **valor** (number, identifier, `)`, `]`, `}`, string, char, symbol),
el `-` es `binarySelector` (maximal-munch ⇒ `--`, `-=`, …). Casos: `3 --4` ⇒
`3` `--` `4` (válido); `3 - -4` ⇒ `3` `-` `-4`; `3-4` ⇒ `3 - 4`; `x := -5` ⇒
`-5`; `#(1 -4)` ⇒ `1`, `-4` (el escáner de arrays trata cada elemento en posición
de operando). `#[` (byteArrayOpen) **no** abre posición de operando —sus elementos
son bytes sin signo `[0,255]`, un negativo no tiene sentido (DEV-016)—: `#[-4]` ⇒
`#[` `-` `4`, mientras `#(-4)` ⇒ `#(` `-4`. Origin: spec-ANSI (A.1/A.4) + ingeniería
(la regla de posición).

### R3 — `:=` vs keyword (sin `E_ASSIGN_VS_KEYWORD`, ver CORR-2)
Al escanear `:`: si va inmediatamente seguido de `=` ⇒ token `assignmentOperator`
(`:=`), cerrando el identifier anterior si lo hubiera. Si va seguido de otra cosa
y está pegado a un identifier previo ⇒ `keyword` (`foo:`). Un `:` aislado no
seguido de `=` ⇒ token `colon` (marcador de block-arg `:x`, R13/DEV-015), **no**
`E_UNEXPECTED_CHAR`; un `:` fuera de contexto lo rechaza el PARSER, no el lexer.
`a:=b`, `a := b`, `foo: 1` todos positivos.

### R4 — `value` numérico del Token/LiteralNode
- integer (decimal y radix): `value` = `number`, o `bigint` si `|n| > 2^53-1`.
  Radix se acumula SIEMPRE en BigInt (`acc = acc*base + digit`) y se degrada a
  `number` si cabe — corrige el bug de "radix grande corrompe value".
- float (E/D/Q): `value` = `number` vía `parseFloat(raw.replace(/[dq]/i,'e'))`
  (normalizar `d`/`q`→`e`, que `parseFloat` no entiende) — corrige FloatD/FloatQ.
  `lit:'float'` + campo `floatKind: 'e'|'d'|'q'`. **radix-float** (`16r1.8`) fuera
  de alcance L1 (R4 sólo radix enteros): `16r1.8` ⇒ `16r1` `.` `8` (DEV-018). Un
  float no finito por overflow (`1e400` ⇒ `Infinity`) conserva `value=Infinity`;
  su serialización canónica es `{"$float":…}` (R12/DEV-017).
- scaledDecimal: `value` = **string** de la mantissa (exacto, sin pérdida) +
  campo `scale: number` (= dígitos fraccionales declarados, o los de la mantissa
  si se omite). La semántica ScaledDecimal completa (unscaled+renormalización) es
  de L2; L1 conserva `raw` + mantissa-string + scale. `[UNVERIFIED]` el default de
  scale contra el draft exacto; best-effort en L1.

### R5 — Elementos de `#( )`: nil/true/false reservados
Dentro de un array literal, `nil`/`true`/`false` desnudos denotan los **objetos
reservados** (ANSI §3.4.6.2), NO símbolos: `LiteralNode{lit:'nil'|'true'|'false',
value:null|true|false, origin:'ansi'}`. Otras palabras desnudas (identifier,
`keyword+`, `binarySelector`) ⇒ `lit:'symbol'`. (A nivel de EXPRESIÓN, en cambio,
`nil`/`true`/`false` se emiten como `Variable`; su reificación es L2 — asimetría
ANSI-correcta.) Corrige la no-conformidad "nil dentro de #() como symbol".

### R6 — `quotedSymbol` keyword+ (`#at:put:`)
Tras `#`: `binarySelector` (run de binaryChars) | `(identifier ':')+` (keyword
compuesto, sólo mientras cada `identifier` vaya pegado a `:`) | `identifier`
(sin `:`). `#at:put:`⇒`at:put:`, `#foo`⇒`foo`, `#foo:`⇒`foo:`, `#+`⇒`+`. Corrige
el autómata que sobre-consumía.

### R7 — Maximal-munch con backtrack acotado (exponente/scaled)
La letra de exponente `e`/`d`/`q` se consume como exponente SÓLO si va seguida de
`[+-]?digit`. Si no, NO se consume: `1.5e` ⇒ `1.5`(float) + `e`(identifier);
`2eX` ⇒ `2`(int) + `eX`(identifier) — **positivos**, no errores. El negativo real
de exponente es `1.5e+` (letra+signo sin dígito) ⇒ `E_EXPONENT_MALFORMED`.
**No hay forma léxica malformada de scaledDecimal** bajo maximal-munch (`s`
siempre cierra con scale-default): el item "scaledDecimal malformado" del gate es
vacuo y se **elimina** (DEV-011). El `.` no se consume si no va seguido de dígito
(`1.e5` ⇒ `1` `.` `e5`; sin `E_FLOAT_NO_FRACTION`).

### R8 — `parseUnary` sin guard de lookahead
Se elimina el guard `peek(1)!='assignmentOperator'` de `parseUnary` (rechazaba
válido). La separación assignment/expression se decide SÓLO al tope de
`parseExpression` (`peek(0)==identifier && peek(1)==':='`). `a foo := 1` ⇒ se
parsea `a foo` y luego `:=` es `E_UNEXPECTED_TOKEN` (target no asignable). Correcto.

### R9 — Receptor de cascada
`CascadeNode.receiver` = el receptor del **mensaje inmediatamente anterior** al
primer `;` (puede ser un `MessageSend` completo: `OrderedCollection new add:1;
yourself` ⇒ receiver = `MessageSend(new, OrderedCollection)`). El primer mensaje
de la cascada es ese mensaje top-level SIN su receptor (`CascadeMsg`). `;` cuando
el head no es `MessageSend` ⇒ `E_CASCADE_NO_RECEIVER`.

### R10 — Catálogo ÚNICO de error-codes
**LexError:** `E_UNTERMINATED_STRING`, `E_UNTERMINATED_COMMENT`,
`E_UNTERMINATED_CHAR` (`$`+EOF), `E_EMPTY_SYMBOL` (`#` sin símbolo válido),
`E_RADIX_BASE` (base∉[2,36]), `E_RADIX_DIGIT` (dígito≥base), `E_RADIX_NO_DIGITS`
(`r` sin dígitos), `E_EXPONENT_MALFORMED` (`1.5e+`), `E_UNEXPECTED_CHAR` (code
point que no inicia token; el `:` suelto **no** es error —lexea como `colon`,
DEV-015). **ParseError:** `E_UNEXPECTED_TOKEN`,
`E_UNCLOSED_PAREN`, `E_UNCLOSED_BLOCK`, `E_UNCLOSED_ARRAY`, `E_UNCLOSED_BYTEARRAY`,
`E_UNCLOSED_DYNARRAY`, `E_KEYWORD_NO_ARG`, `E_CASCADE_NO_RECEIVER`, `E_BYTE_RANGE`
(byte∉[0,255] en `#[ ]`, origin:ingeniería). **Eliminados:** `E_NEG_NO_SPACE`
(CORR-1), `E_ASSIGN_VS_KEYWORD` (CORR-2), `E_FLOAT_NO_FRACTION`, `E_SCALED_*`
(R7), `E_LONE_COLON`/`E_INVALID_SYMBOL`/`E_BYTEARRAY_ELEMENT` (fundidos).

### R11 — `LiteralKind` canónico
`'integer' | 'float' | 'scaledDecimal' | 'character' | 'string' | 'symbol' |
'array' | 'byteArray' | 'nil' | 'true' | 'false'`. `float` lleva `floatKind`;
`scaledDecimal` lleva `scale`; `array`/`byteArray` llevan `elements: LiteralNode[]`
(sin `value`); `byteArray` `origin:'ext:pharo-squeak'`. `dynamicArray` **NO es
literal** → nodo propio `DynamicArrayNode { type:'DynamicArray', elements:
Expression[], origin:'ext:pharo-squeak', span }`.

### R12 — `astToJSON` canónico (orden de claves fijo)
`type` primero, `span` último, claves ausentes **omitidas** (no `null`, salvo
donde el campo es semánticamente nulable). Por nodo: `Program(type,body,span)`;
`Sequence(type,temporaries,statements,span)`; `Return(type,value,span)`;
`Assignment(type,target,value,span)`; `MessageSend(type,kind,receiver,selector,
args,span)`; `Cascade(type,receiver,messages,span)` con `CascadeMsg(kind,selector,
args,span)`; `Block(type,params,body,span)`; `Variable(type,name,span)`;
`Literal(type,lit,raw,value?,floatKind?,scale?,origin?,elements?,span)`;
`DynamicArray(type,elements,origin,span)`. `span` = `{start:{offset,line,column},
end:{...}}` en ese orden. **bigint** ⇒ `{"$bigint":"<decimal>"}`; **float no
finito** ⇒ `{"$float":"Infinity"|"-Infinity"|"NaN"}` (DEV-017, evita que
`JSON.stringify(Infinity)==="null"` corrompa los golden). **origin** se
emite SÓLO si `'ext:pharo-squeak'` (los nodos ANSI no llevan flag — gate "0 nodos
ANSI con flag"). Igualdad estructural en tests vía `deepEqual` sobre `astToJSON`.

### R13 — Forma de SequenceNode / BlockNode / temporaries
Las **temporaries viven en `SequenceNode`** (único hogar, sirve a bloques y
programa). `BlockNode { type, params, body:SequenceNode, span }` (params = block
args `:x`); `ProgramNode { type, body:SequenceNode, span }`. `ReturnNode` es un
statement normal dentro de `SequenceNode.statements`, con la regla de que `^expr`
es **terminal** (sólo `.` opcional y luego el cierre; cualquier statement
posterior ⇒ `E_UNEXPECTED_TOKEN`). Diverge levemente del listado §5.1
(`BlockNode.temporaries`): se pliega en `body` por coherencia (DEV-012).

## Impacto en el repo

- Nuevo contrato para implementar L1 (lexer → AST → parser → `astToJSON` →
  corpus). Los 6 specs de facet (en scratchpad del run) son la referencia detallada;
  este doc fija las resoluciones que prevalecen ante conflicto.
- [[log-de-desviaciones]]: DEV-009 (A.4-2 no-error), DEV-010 (A.4-1 no-error),
  DEV-011 (scaledDecimal sin malformado léxico), DEV-012 (temporaries en Sequence),
  DEV-013 (offset UTF-16 / column code-point), DEV-014 (`_` en identifier = ext).

## Validación

Se verifica con el corpus L1 (≥40 positivos / ≥18 negativos, igualdad estructural
canónica + determinismo de `code+span`) cuando se implemente la capa; gate L1
verde en CI antes de L2. La matriz de tests (meta-facet, P01–P52 / N01–N21) se
adopta con las correcciones CORR-1/CORR-2 aplicadas (N01/N02 reconvertidos).

## Próximos pasos

1. Tipos AST (discriminated unions + `SourceSpan`) en `src/ast`.
2. Lexer (`src/lexer`) con R1–R7, R10.
3. Parser recursive-descent (3 niveles) + bloques + cascada (R8/R9/R13).
4. `astToJSON` canónico (R12) + errores estructurados (R10).
5. Corpus `.st` + fixtures golden (generados del parser, verificados vs matriz).
6. Pase adversarial sobre la IMPLEMENTACIÓN (no sólo el spec).
