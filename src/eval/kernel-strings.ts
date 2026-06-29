// L4 · F5 (S2) — métodos DERIVADOS de String en Smalltalk REAL (.st), instalados vía
// defineMethod sobre la clase String ya existente (kernel.ts: String < Object). NO usamos
// loadKernelSources con un class-def: String/Symbol ya viven en el núcleo y el cargador
// rechaza duplicados; aquí sólo definimos los CUERPOS de método (mismo patrón que
// kernel-numerics.ts / kernel-collections.ts). Cada método porta un tag de procedencia
// (GATE-L4-PROVENANCE).
//
// Sólo va aquí lo expresable por ENVÍOS PUROS: asString es `^self` (un String YA es su propia
// representación String, ANSI Object>>asString = self para String). Las operaciones a nivel de
// chars (, / size / asSymbol / =) son primitivas (acceden al campo `chars`), instaladas en
// installPrimitives. Symbol (< String) HEREDA asString... NO: Symbol>>asString se sobreescribe
// con una primitiva (boxea su .text), así que este `^self` aplica sólo cuando el receptor ya
// es un String boxed.

import type { STClass, Universe } from "../runtime/index.js";
import { defineMethod } from "./method.js";

/** Tag de procedencia de los métodos derivados de String (GATE-L4-PROVENANCE). */
export const STRINGS_PROVENANCE = "l4-strings (origin=spec-ANSI)";

/**
 * Cuerpos derivados de String, como method-defs `.st` (patrón + cuerpo):
 *   asString — `^self` (un String ya ES su representación String; ANSI). Symbol sobreescribe
 *              este selector con una primitiva que boxea su .text, así que la herencia no lo
 *              alcanza para un Symbol.
 */
const STRING_METHODS: string[] = ["asString [ ^self ]"];

/**
 * loadStringMethods(u) — instala los métodos derivados de String (.st) vía defineMethod, con el
 * tag de procedencia. Corre DESPUÉS de installPrimitives (Symbol>>asString primitiva ya está) y
 * sobre el Universe fresco de cada evalWith.
 */
export function loadStringMethods(u: Universe): void {
  const string = u.namespace.get("String") as STClass;
  for (const def of STRING_METHODS) {
    defineMethod(string, def, u, STRINGS_PROVENANCE);
  }
}
