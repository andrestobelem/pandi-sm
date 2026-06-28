// L2 · bootstrapKernel — cablea el núcleo por mutación (estilo JsSOM/Squeak
// setClass), sólo lo necesario para que send() (L3) haga lookup por la superclass
// chain. Plan §5.2: núcleo Object -> Behavior -> ClassDescription -> Class +
// Metaclass, UndefinedObject + nil (instancia única), SmallInteger (instancias =
// number nativo), String, Transcript. Los methodDict nacen vacíos (Map); L3
// instala las primitivas.
//
// Golden braid REAL (L2-proper): cada clase X tiene su PROPIA metaclase "X class"
// (no compartimos un único Metaclass). Así `classOf(classOf(X)) === Metaclass`
// vale POR CONSTRUCCIÓN, hay paralelismo `classOf(X).superclass ===
// classOf(X.superclass)`, y la trampa `classOf(Object).superclass === Class`.
// La metaclase de X hereda de classOf(X.superclass), salvo "Object class" cuya
// superclase es Class (raíz del braid) y "Metaclass class" cuya clase es el
// propio Metaclass (único self-loop).

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

  // ── Golden braid REAL: una metaclase propia por clase ────────────────────
  // Cada clase X recibe su metaclase M_X (nombre "X class"). En dos pasadas:
  // (1) creamos M_X y cableamos X.class = M_X para que classOf(X) ya resuelva;
  // (2) cableamos M_X.superclass = classOf(X.superclass) usando classOf, que
  //     ahora devuelve la metaclase correcta. Casos raíz/self-loop aparte.
  const coreClasses: STClass[] = [
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
  ];

  // Pasada 1: M_X con superclass provisional null; X.class = M_X. La metaclase es
  // instancia de Metaclass (M_X.class = Metaclass) — ahí cierra el doble classOf.
  for (const X of coreClasses) {
    const meta: STClass = {
      name: `${X.name} class`,
      superclass: null,
      methodDict: new Map(),
      instSize: 0,
      class: Metaclass,
      hash: nextHash++,
      format: ObjectFormat.Pointers,
      pointers: [],
    };
    X.class = meta;
  }

  // Pasada 2: M_X.superclass = classOf(X.superclass) (paralelismo). Excepciones:
  //  · Object class: su superclase es Class (raíz del braid; Object.superclass es
  //    nil, no una clase, así que no hay metaclase de la que heredar).
  //  · Metaclass class: instancia de Metaclass (ya cableado en pasada 1); su
  //    superclase sigue la regla general (classOf(ClassDescription)).
  for (const X of coreClasses) {
    const meta = X.class;
    const sup = X.superclass;
    if (sup === null || sup === nil) {
      // Object es la única clase con superclass nil: "Object class" hereda de Class.
      meta.superclass = Class;
    } else {
      meta.superclass = (sup as STClass).class;
    }
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
