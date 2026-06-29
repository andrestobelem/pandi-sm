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
 * L4 F3 · Cuerpos derivados de Collection (.st), TODOS expresados por envíos puros sobre
 * do:/size + bloques + self (el acceso por nombre de ivar en cuerpos .st no está cableado).
 * do: es la primitiva que los cimienta (itera `elements` con evalBlock). Species: collect:/
 * select:/reject: acumulan en una OrderedCollection growable y devuelven `asArray` (un Array
 * fresco) — species = Array para TODO receptor secuenciable (origin=ingenieria/dialecto, §8.10,
 * NO ANSI). detect: sin match señala un Error (vía error:, capturable por on: Error do:).
 */
const COLLECTION_METHODS: string[] = [
  // size lo aporta la primitiva concreta (Array/OrderedCollection); isEmpty/notEmpty derivan.
  "isEmpty [ ^self size = 0 ]",
  "notEmpty [ ^self isEmpty not ]",
  // includes: — recorre con do: y retorna por `^` no-local en cuanto encuentra el elemento.
  "includes: anObject [ self do: [:e | e = anObject ifTrue: [^true]]. ^false ]",
  // inject:into: — pliegue izquierdo; el bloque recibe (acumulador, elemento).
  "inject: thisValue into: aBlock [ | acc | acc := thisValue. self do: [:e | acc := aBlock value: acc value: e]. ^acc ]",
  // detect:ifNone: — primer match por `^`; si ninguno, el valor del bloque exceptionBlock.
  "detect: aBlock ifNone: exceptionBlock [ self do: [:e | (aBlock value: e) ifTrue: [^e]]. ^exceptionBlock value ]",
  // detect: — detect:ifNone: con un bloque que SEÑALA un Error vía la máquina L5 (Error
  // signal:, capturable por on: Error do:), NO `self error:` (lanza un Error de host no
  // capturable en el MVP). Mismo enrutado que at: fuera de rango (DRIFT-3: Error genérico).
  "detect: aBlock [ ^self detect: aBlock ifNone: [Error signal: 'elemento no encontrado'] ]",
  // collect:/select:/reject: — acumulan en una OrderedCollection y devuelven asArray (species).
  "collect: aBlock [ | r | r := OrderedCollection new. self do: [:e | r add: (aBlock value: e)]. ^r asArray ]",
  "select: aBlock [ | r | r := OrderedCollection new. self do: [:e | (aBlock value: e) ifTrue: [r add: e]]. ^r asArray ]",
  "reject: aBlock [ | r | r := OrderedCollection new. self do: [:e | (aBlock value: e) ifFalse: [r add: e]]. ^r asArray ]",
];

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
  const collection = u.namespace.get("Collection") as STClass;
  for (const def of COLLECTION_METHODS) {
    defineMethod(collection, def, u, COLLECTIONS_PROVENANCE);
  }
  const sequenceable = u.namespace.get("SequenceableCollection") as STClass;
  for (const def of SEQUENCEABLE_METHODS) {
    defineMethod(sequenceable, def, u, COLLECTIONS_PROVENANCE);
  }
}
