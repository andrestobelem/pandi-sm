// L2 · bootstrapKernel — cablea el núcleo MÍNIMO por mutación (estilo JsSOM),
// sólo lo necesario para que send() (L3) haga lookup por la superclass chain.
// Plan §5.2: núcleo Object -> Behavior -> ClassDescription -> Class + Metaclass
// (mínima), UndefinedObject + nil (instancia única), SmallInteger (instancias =
// number nativo), String, Transcript. Los methodDict nacen vacíos (Map); L3
// instala las primitivas. El cierre metacircular completo y los 23 selectores
// son L2-proper (diferidos): aquí NO se verifica `X class class === Metaclass`.

import { ObjectFormat, type STClass, type STObject, type Universe } from "./object.js";
import { SymbolTable } from "./symbol-table.js";

let nextHash = 1;

/** Crea una clase shell. `class` se parchea por mutación tras crear las metaclases. */
function makeClass(name: string, superclass: STClass | null, instSize: number): STClass {
  const cls: STClass = {
    name,
    superclass,
    methodDict: new Map(),
    instSize,
    // `class` se asigna provisionalmente a sí misma y se reescribe a Metaclass abajo.
    class: undefined as unknown as STClass,
    hash: nextHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
  };
  cls.class = cls;
  return cls;
}

/** bootstrapKernel — devuelve un Universe fresco con referencias nombradas. */
export function bootstrapKernel(): Universe {
  const symbols = new SymbolTable();
  // Internamos los selectores que el skeleton usa (identidad estable para send).
  symbols.intern("+");
  symbols.intern("*");
  symbols.intern("show:");

  // ── Núcleo de clases (superclass; `class` se parchea luego) ──────────────
  // Object es la raíz; su superclass será nil (que aún no existe). Lo dejamos
  // null y lo reescribimos a nil tras crear nil.
  const Object_ = makeClass("Object", null, 0);
  const Behavior = makeClass("Behavior", Object_, 0);
  const ClassDescription = makeClass("ClassDescription", Behavior, 0);
  const Class = makeClass("Class", ClassDescription, 0);
  const Metaclass = makeClass("Metaclass", ClassDescription, 0);
  const UndefinedObject = makeClass("UndefinedObject", Object_, 0);
  const SmallInteger = makeClass("SmallInteger", Object_, 0);
  const String_ = makeClass("String", Object_, 0);
  // Boolean < Object; True/False < Boolean. true/false son booleans nativos JS
  // (classOf los mapea a True/False); estas clases existen para que ifTrue:/and:/not
  // despachen a methodDicts reales (DEV-003: condicionales son sends, no inlining).
  const Boolean_ = makeClass("Boolean", Object_, 0);
  const True_ = makeClass("True", Boolean_, 0);
  const False_ = makeClass("False", Boolean_, 0);
  const BlockClosure = makeClass("BlockClosure", Object_, 0);
  const Transcript_class = makeClass("Transcript class", Object_, 0);

  // ── nil: instancia única de UndefinedObject; termina las cadenas ─────────
  const nil: STObject = {
    class: UndefinedObject,
    hash: nextHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
  };
  // La superclase de la raíz es el STObject nil (plan §5.2); termina la cadena.
  Object_.superclass = nil;

  // ── Metaclass golden-braid MÍNIMO ────────────────────────────────────────
  // Cableamos el slot `class` de cada clase a Metaclass (suficiente para que
  // classOf(unaClase) sea consistente). El cierre completo (X class class ===
  // Metaclass) es L2-proper y NO se aserta en el skeleton.
  for (const c of [
    Object_,
    Behavior,
    ClassDescription,
    Class,
    Metaclass,
    UndefinedObject,
    SmallInteger,
    String_,
    Boolean_,
    True_,
    False_,
    BlockClosure,
    Transcript_class,
  ]) {
    c.class = Metaclass;
  }

  // ── Transcript: instancia única de Transcript_class ──────────────────────
  const Transcript: STObject = {
    class: Transcript_class,
    hash: nextHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
  };

  return {
    Object: Object_,
    Behavior,
    ClassDescription,
    Class,
    Metaclass,
    UndefinedObject,
    SmallInteger,
    String: String_,
    Boolean: Boolean_,
    True: True_,
    False: False_,
    BlockClosure,
    Transcript_class,
    nil,
    Transcript,
    symbols,
  };
}
