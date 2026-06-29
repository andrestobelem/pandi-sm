// L4 · F2 — métodos DERIVADOS de Magnitude en Smalltalk REAL (.st), instalados vía
// defineMethod sobre la clase Magnitude ya existente (plan §5.4 "Magnitude implementa
// comparaciones en términos de < y =, spec-ANSI"). NO usamos loadKernelSources con un
// class-def: Magnitude/Number/Float/Character ya viven en el núcleo (kernel.ts) y el
// cargador rechaza duplicados; aquí sólo definimos los CUERPOS de método (defineMethod
// parsea cada `[ ... ]`). Cada método porta un tag de procedencia (GATE-L4-PROVENANCE).
//
// max:/min:/between:and: despachan < (y, transitivamente, >= vía not), reusando las
// primitivas de comparación que SmallInteger/Float/Character instalan. Son ENVÍOS
// reales (no inlining): `self < arg` resuelve por la cadena hasta la primitiva concreta.

import type { STClass, Universe } from "../runtime/index.js";
import { defineMethod } from "./method.js";

/** Tag de procedencia de los métodos derivados de Magnitude (GATE-L4-PROVENANCE). */
export const NUMERICS_PROVENANCE = "l4-numerics-magnitude (origin=spec-ANSI)";

/**
 * Cuerpos derivados de Magnitude, como method-defs `.st` (patrón + cuerpo). Se definen
 * en términos de `<` y `=` (las primitivas concretas las aportan las subclases):
 *   max: — el mayor de self y arg.    min: — el menor.
 *   between:and: — min <= self <= max, expresado con < negado (>=) por bloques.
 * NOTA: usamos `(self < min) not` en vez de `>=` por si una subclase sólo define `<`;
 * SmallInteger/Float/Character definen ambos, pero esto mantiene el contrato de Magnitude
 * apoyado SÓLO en `<` y `=` (spec-ANSI). `&` (eager) compone los dos Booleanos.
 */
const MAGNITUDE_METHODS: string[] = [
  "max: aMagnitude [ ^(self < aMagnitude) ifTrue: [aMagnitude] ifFalse: [self] ]",
  "min: aMagnitude [ ^(self < aMagnitude) ifTrue: [self] ifFalse: [aMagnitude] ]",
  "between: min and: max [ ^(self < min) not & (max < self) not ]",
];

/**
 * loadNumericMethods(u) — instala los métodos derivados de Magnitude (.st) vía
 * defineMethod, con el tag de procedencia. Corre DESPUÉS de installPrimitives (los
 * cuerpos envían < / = / ifTrue:ifFalse: / & / not, todas ya instaladas) y sobre el
 * Universe fresco de cada evalWith.
 */
export function loadNumericMethods(u: Universe): void {
  const magnitude = u.namespace.get("Magnitude") as STClass;
  for (const def of MAGNITUDE_METHODS) {
    defineMethod(magnitude, def, u, NUMERICS_PROVENANCE);
  }
}
