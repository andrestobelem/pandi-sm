# Log de desviaciones de pandi-sm

Date: 2026-06-28 (registro vivo — se actualiza por capa)

> **Status: REGISTRO VIVO.** Excepción a la convención de nombre con fecha de
> `doc/research/README.md`: este archivo es un registro acumulativo, no un
> documento de investigación cerrado. Lo establece L0 como **convención**; las
> entradas se confirman/añaden cuando cada capa implementa su decisión.

## Objetivo

Registrar toda divergencia **consciente** de pandi-sm respecto a su oráculo —ANSI
INCITS 319-1998 (draft v1.9), el dialecto Pharo/Squeak, o IEEE— para no confundir
un bug con una decisión, y para que el harness diferencial (§7 del plan) no marque
como fallo lo que es desviación deliberada.

## Convención de entrada

Una fila por desviación. Campos:

| Campo | Significado |
| --- | --- |
| `ID` | `DEV-NNN` estable, no se reusa. |
| `Desviación` | Qué hace pandi-sm distinto. |
| `Respecto de` | `ANSI` · `dialecto:pharo` · `dialecto:squeak` · `IEEE`. |
| `Origen` | `ingeniería` · `dialecto:<cuál>` · `spec-ANSI`. |
| `Dónde` | Sección del plan / capa que la decide. |
| `Estado` | `decidida` (en plan) · `implementada` (con test que la fija). |

**Regla:** toda fila `implementada` debe tener al menos un caso de test que la
fije; toda extensión no-ANSI en el AST/corpus lleva `origin='ext:pharo-squeak'`.

## Registro

| ID | Desviación | Respecto de | Origen | Dónde | Estado |
| --- | --- | --- | --- | --- | --- |
| DEV-001 | `copy` de `<Object>` es **shallow** (no contrato ANSI). | ANSI | ingeniería | §5.2 (L2) | decidida |
| DEV-002 | `Float / 0` señala `ZeroDivide` (no devuelve `inf`/`nan`). | IEEE | ingeniería | §8.2 (L4) | decidida |
| DEV-003 | Condicionales/lógicos (`ifTrue:`/`and:`/`or:`/`not`) NO se inlinean: son envíos reales (preserva `doesNotUnderstand:` de un no-Boolean). Squeak SÍ los inlinea. | dialecto:squeak | ingeniería | §5.3.1 (L3) | decidida |
| DEV-004 | `timesRepeat:` se implementa vía `to:do:` (Squeak no lo inlinea; el Blue Book usa `whileTrue:` interno). | dialecto:squeak | ingeniería | §5.3.1 (L3) | decidida |
| DEV-005 | Recursión profunda no-bucle limitada por el stack de V8 (sin TCO); `RangeError` se mapea a `Error` Smalltalk señalable. Sin gate sobre profundidad concreta. | — (límite de plataforma) | ingeniería | §5.3.1 (L3) | decidida |
| DEV-006 | `ByteString` vs `WideString` no se distingue en el MVP (`String` sobre UTF-16 de V8, iterado por code point). Pharo/Squeak sí distinguen. | dialecto:pharo | ingeniería | §5.0/§5.1, doc decisiones modelo | decidida |
| DEV-007 | Sin imagen: el kernel se carga desde assets `.st` (estilo Amber), no desde un snapshot. | dialecto:squeak | ingeniería | §2/§5.4.0 | decidida |
| DEV-008 | Raíz de la jerarquía = `Object` (superclase `nil`); `ProtoObject` diferido. | dialecto:pharo | spec-ANSI | §5.2 (L2) | decidida |
| DEV-009 | `3 --4` parsea VÁLIDO como `MessageSend(3,'--',[4])` (no error). Corrige mis-lectura del gate §5.1 que lo listaba como negativo; `--` es `binarySelector` por maximal-munch (el `doesNotUnderstand:#--` es de L2). Sin `E_NEG_NO_SPACE`. | ANSI (corrección de plan) | spec-ANSI | §5.1 / L1-decisiones CORR-1 | decidida |
| DEV-010 | `a:=b` parsea VÁLIDO como `Assignment` (no error). Corrige mis-lectura del gate §5.1; el lexer prefiere `:=` pegado. Sin `E_ASSIGN_VS_KEYWORD`; el negativo real es `3 := 4` (target literal) → `E_UNEXPECTED_TOKEN`. | ANSI (corrección de plan) | spec-ANSI | §5.1 / L1-decisiones CORR-2 | decidida |
| DEV-011 | scaledDecimal no tiene forma léxica "malformada" bajo maximal-munch (`s` siempre cierra con scale-default); el item "scaledDecimal malformado" del gate §5.1 es vacuo y se elimina. | ANSI (corrección de plan) | ingeniería | §5.1 / L1-decisiones R7 | decidida |
| DEV-012 | Las `temporaries` viven en `SequenceNode` (único hogar; bloque y programa), no en `BlockNode` como listaba §5.1. `BlockNode = {params, body, span}`. | dialecto (forma AST) | ingeniería | §5.1 / L1-decisiones R13 | decidida |
| DEV-013 | `span.offset` = índice de unidad UTF-16 (slice-reversible); `span.column` = code points (1 por surrogate pair). Pueden divergir en el plano astral. | — (modelo interno) | ingeniería | L1-decisiones R1 | decidida |
| DEV-014 | `_` admitido como `letter` en `identifier` (de-facto Pharo/Squeak; ANSI sólo lista A-Za-z). Identifiers con `_` se marcan origin ext donde aplique. | dialecto:pharo | ingeniería | L1-decisiones R3 / léxico | decidida |
| DEV-015 | Un `:` aislado (no seguido de `=`) lexea como token `colon`, **no** `E_UNEXPECTED_CHAR`. Es el marcador de argumento de bloque `[:x \| …]` (R13); un `:` fuera de contexto lo rechaza el PARSER (`E_UNEXPECTED_TOKEN`), no el lexer. Corrige la contradicción interna de R3/R10 (que lo listaban como `E_UNEXPECTED_CHAR`) con R13. | ANSI (corrección de contrato) | ingeniería | L1-decisiones R3/R10/R13 | implementada (`test/L1/lexer-slice1.test.ts`: `:` / `[:x`) |
| DEV-016 | `byteArrayOpen` (`#[`) NO abre posición de operando (R2): `#[-4]` ⇒ `#[` `-`(binarySelector) `4`, mientras `#(-4)` ⇒ `#(` `-4`. Los elementos de un byteArray son bytes sin signo `[0,255]` (un negativo lo rechaza el parser con `E_BYTE_RANGE`); asimetría deliberada con `arrayOpen`. | ANSI/ingeniería | ingeniería | L1-decisiones R2 | implementada (`test/L1/lexer-slice4.test.ts`: `#[-4]` vs `#(-4)`) |
| DEV-017 | Float no finito por overflow IEEE-754 (`1e400` ⇒ `Infinity`) se serializa en `astToJSON` como envoltura `{"$float":"Infinity"\|"-Infinity"\|"NaN"}`, espejo de `{"$bigint":…}`. `JSON.stringify(Infinity)` da `"null"`, lo que corrompería en silencio los golden del corpus (R12). El lexer conserva `value=Infinity` (R4: `value=parseFloat`). | IEEE/JSON | ingeniería | L1-decisiones R4/R12 | implementada (`test/L1/ast-to-json.test.ts`, `lexer-slice2.test.ts`: `1e400`) |
| DEV-018 | Los **radix-float** (`16r1.8`, `2r1.1`) quedan fuera de alcance en L1: R4 sólo define radix enteros. El lexer parte `16r1.8` ⇒ `16r1` `.`(period) `8`. ANSI permite radix floats; pandi-sm los difiere. | ANSI | ingeniería | L1-decisiones R4 | implementada (`test/L1/lexer-slice2.test.ts`: `16r1.8`) |
| DEV-019 | El parser (descenso recursivo sin TCO) no tiene límite de profundidad fijo: una anidación patológica desborda el stack de V8. Para honrar R10 ("`parse()` nunca lanza, devuelve `{ast,errors}`"), `parse()` envuelve el descenso en try/catch y mapea el `RangeError` a un `E_NESTING_LIMIT` estructurado (`ast:null`); cualquier otra excepción se re-lanza. El umbral exacto depende de la plataforma (no determinista entre plataformas), pero SIEMPRE produce error estructurado, nunca excepción. Análogo a DEV-005 para el evaluador (L3). | — (límite de plataforma) | ingeniería | L1-decisiones R10 | implementada (`test/L1/parser-recovery.test.ts`: anidación 50k ⇒ `E_NESTING_LIMIT`) |

## Próximos pasos

- Al implementar cada decisión, mover su fila a `implementada` y enlazar el caso
  de test que la fija.
- Añadir filas nuevas cuando una capa descubra una divergencia no anticipada
  (p.ej. retornos *unspecified* de `Stream` en L4).
