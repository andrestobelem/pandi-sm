// L4 · F4 — métodos derivados de la base de colecciones en Smalltalk REAL (.st),
// instalados vía defineMethod sobre las clases Collection/SequenceableCollection/Array
// que YA viven en el núcleo (kernel.ts: la cadena abstracta se cablea ahí porque u.Array
// debe existir antes de classOf y de los constructores { }/#( )/#[ ], y el cargador
// rechaza re-declarar clases del núcleo). Aquí sólo definimos los CUERPOS de método —
// mismo patrón que kernel-numerics.ts (Magnitude). Cada uno porta un tag de procedencia
// (GATE-L4-PROVENANCE).
//
// S1: first/last sobre SequenceableCollection, expresados PURAMENTE en términos de los
// envíos at:/size (que las primitivas de Array aportan) + bloques/self — nunca por nombre
// de ivar (el acceso por ivar en cuerpos .st no está cableado, igual que en excepciones).
// 1-based (origin=dialecto/ingeniería, NO ANSI estricto; se flaggea para el log L6): `first`
// es `at: 1` y `last` es `at: self size`.

import type { STClass, Universe } from "../runtime/index.js";
import { defineMethod } from "./method.js";

/** Tag de procedencia de los métodos derivados de la base de colecciones (GATE-L4-PROVENANCE). */
export const COLLECTIONS_PROVENANCE = "l4-collections-sequenceable (origin=ingenieria/dialecto)";

/**
 * Cuerpos derivados de SequenceableCollection, como method-defs `.st` (patrón + cuerpo),
 * en términos de at:/size (los aportan las primitivas concretas de Array):
 *   first — el primer elemento (at: 1; 1-based, origin=dialecto).
 *   last  — el último elemento (at: self size).
 * Un receptor vacío hace que at: señale un Error (1 fuera de 1..0), comportamiento deseado.
 */
const SEQUENCEABLE_METHODS: string[] = ["first [ ^self at: 1 ]", "last [ ^self at: self size ]"];

/**
 * loadCollectionMethods(u) — instala los métodos derivados de la base de colecciones (.st)
 * vía defineMethod, con el tag de procedencia. Corre DESPUÉS de installPrimitives (los
 * cuerpos envían at:/size, ya instaladas en Array) y sobre el Universe fresco de cada evalWith.
 */
export function loadCollectionMethods(u: Universe): void {
  const sequenceable = u.namespace.get("SequenceableCollection") as STClass;
  for (const def of SEQUENCEABLE_METHODS) {
    defineMethod(sequenceable, def, u, COLLECTIONS_PROVENANCE);
  }
}
