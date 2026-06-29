// L3 · send — dispatch MÍNIMO por la superclass chain (plan §5.3). Internamos el
// selector (identidad ==), luego subimos desde classOf(receiver) buscando una
// primitiva en methodDict. El miss NO tiene éxito silencioso: enrutamos por
// Object>>doesNotUnderstand: con un Message reificado (selector + args), de modo
// que el fallo es observable y determinista (S3). El MessageNotUnderstood como
// Exception navegable es L5 (diferido); aquí el default lanza un Error de host.

import {
  classOf,
  type Message,
  type Primitive,
  type STClass,
  type STValue,
  type Universe,
} from "../runtime/index.js";

/** Sube la cadena de superclases buscando una primitiva para `sym`. */
function lookup(cls: STClass, sym: import("../runtime/index.js").SymbolId): Primitive | undefined {
  let current: STClass | null = cls;
  while (current !== null) {
    const prim = current.methodDict.get(sym);
    if (prim !== undefined) return prim;
    // La cadena termina cuando superclass deja de ser una clase con methodDict
    // (Object.superclass === nil, un STObject sin la forma de STClass).
    const next: STClass | import("../runtime/index.js").STObject | null = current.superclass;
    current = next !== null && "methodDict" in next ? next : null;
  }
  return undefined;
}

/** send(receiver, selector, args): internea, busca por la cadena y aplica. */
export function send(receiver: STValue, selector: string, args: STValue[], u: Universe): STValue {
  const sym = u.symbols.intern(selector);
  const cls = classOf(receiver, u);
  const prim = lookup(cls, sym);
  if (prim === undefined) {
    // Miss: reificamos el envío y lo enrutamos por doesNotUnderstand: (siempre
    // presente en Object, raíz de la cadena). El argumento del dNU es el Message.
    const dnuSym = u.symbols.intern("doesNotUnderstand:");
    const dnu = lookup(cls, dnuSym);
    if (dnu === undefined) {
      // Object>>doesNotUnderstand: no instalado: error de host (no debería ocurrir).
      throw new Error(`doesNotUnderstand: ${cls.name} no entiende #${selector}`);
    }
    const message: Message = { selector, args };
    return dnu(receiver, [message as unknown as STValue], u);
  }
  return prim(receiver, args, u);
}

/**
 * superSend(receiver, selector, args, definingClass) — despacho de `super` (§5.4.0,
 * NORMATIVO): el receptor-VALOR es el mismo (self), pero el lookup ARRANCA en la
 * superclase de la clase que DEFINIÓ el método en curso (NO en classOf(receiver)),
 * de modo que C>>m con `super m` alcanza la impl heredada y no re-despacha a sí mismo.
 * Un miss enruta por doesNotUnderstand: igual que send(). El defining-class lo provee
 * el EvalCtx de la activación del CompiledMethod (method.ts).
 */
export function superSend(
  receiver: STValue,
  selector: string,
  args: STValue[],
  definingClass: STClass,
  u: Universe,
): STValue {
  const sym = u.symbols.intern(selector);
  // El lookup empieza en la superclase de la clase definidora; si ésta no es una
  // clase con methodDict (definingClass === Object, superclass nil), no hay start.
  const sup = definingClass.superclass;
  const start: STClass | null = sup !== null && "methodDict" in sup ? sup : null;
  const prim = start !== null ? lookup(start, sym) : undefined;
  if (prim === undefined) {
    // Miss en la cadena super: enrutamos por doesNotUnderstand: desde classOf(receiver)
    // (la raíz Object siempre lo provee), preservando el fallo observable y determinista.
    const dnu = lookup(classOf(receiver, u), u.symbols.intern("doesNotUnderstand:"));
    if (dnu === undefined) {
      throw new Error(`doesNotUnderstand: ${classOf(receiver, u).name} no entiende #${selector}`);
    }
    const message: Message = { selector, args };
    return dnu(receiver, [message as unknown as STValue], u);
  }
  return prim(receiver, args, u);
}
