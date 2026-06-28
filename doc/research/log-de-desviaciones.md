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

## Próximos pasos

- Al implementar cada decisión, mover su fila a `implementada` y enlazar el caso
  de test que la fija.
- Añadir filas nuevas cuando una capa descubra una divergencia no anticipada
  (p.ej. retornos *unspecified* de `Stream` en L4).
