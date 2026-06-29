/**
 * L3.5 · KERNELLOAD S2 — métodos de usuario (CompiledMethod) + super.
 * Compila un patrón de método (`Name >> sel [ body ]` partido por el cargador,
 * cuerpo -> parse() L1) a una Primitive que activa un scope de método fresco
 * (self=receiver, params ligados, home propio para `^`), lo instala en el
 * methodDict de la clase (addSelector) y lo despacha por send/super.
 * GATE-KERNELLOAD-USERMETHOD + SUPER (plan §5.4.0):
 *  · definir un método en una clase de usuario y enviarlo (round-trip de valor);
 *  · auto-recursión ACOTADA (cuenta-regresiva, profundidad pequeña, VIA-1);
 *  · super POSITIVO: A<B<C, C>>m hace `super m` y alcanza la impl de B (el lookup
 *    arranca en definingClass.superclass, NO en classOf(receiver));
 *  · `^expr` en un método retorna desde el home de ESE método (NonLocalReturn L3).
 *
 * @section L3-5.user-methods
 * @kind    positive
 * @layer   L3.5
 */
import { describe, expect, it } from "vitest";
import { compileMethod, defineMethod } from "../../src/eval/method.js";
import { installPrimitives } from "../../src/eval/primitives.js";
import { send } from "../../src/eval/send.js";
import { basicNew, bootstrapKernel, type STClass, type STValue } from "../../src/runtime/index.js";

/** Universe fresco con primitivas instaladas (mismo bootstrap que evalWith). */
function freshUniverse() {
  const u = bootstrapKernel();
  installPrimitives(u);
  return u;
}

type Univ = ReturnType<typeof freshUniverse>;

/** Define una clase de usuario `superclass subclass: #name` y la devuelve. */
function subclassOf(u: Univ, superclass: STClass, name: string): STClass {
  return send(superclass, "subclass:", [u.symbols.intern(name)], u) as STClass;
}

/** Instancia de `cls` con slots nil (round-trip de envío sobre un objeto real). */
function instanceOf(u: Univ, cls: STClass): STValue {
  return basicNew(cls, u);
}

describe("L3.5 · GATE-KERNELLOAD-USERMETHOD (round-trip)", () => {
  it("define un método unario y lo envía (devuelve el valor del cuerpo)", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "Foo");
    const sel = defineMethod(Foo, "answer [ ^ 42 ]", u);
    expect(sel).toBe("answer");
    expect(send(instanceOf(u, Foo), "answer", [], u)).toBe(42);
  });

  it("método keyword con parámetros: liga los args al scope del método", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "Foo");
    defineMethod(Foo, "add: a to: b [ ^ a + b ]", u);
    expect(send(instanceOf(u, Foo), "add:to:", [3, 4], u)).toBe(7);
  });

  it("self dentro de un método es el receptor", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "Foo");
    defineMethod(Foo, "me [ ^ self ]", u);
    const target = instanceOf(u, Foo);
    expect(send(target, "me", [], u)).toBe(target);
  });

  it("método sin `^` devuelve el receptor (convención Smalltalk)", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "Foo");
    defineMethod(Foo, "noop [ 1 + 1 ]", u);
    const target = instanceOf(u, Foo);
    expect(send(target, "noop", [], u)).toBe(target);
  });
});

describe("L3.5 · auto-recursión ACOTADA (VIA-1)", () => {
  it("countdown decrece hasta 0 sin RangeError (profundidad pequeña)", () => {
    const u = freshUniverse();
    const Counter = subclassOf(u, u.Object, "Counter");
    // down: n -> si n <= 0 devuelve 0, si no `self down: n-1`. Recursión acotada.
    defineMethod(Counter, "down: n [ ^ (n <= 0) ifTrue: [ 0 ] ifFalse: [ self down: n - 1 ] ]", u);
    expect(send(instanceOf(u, Counter), "down:", [10], u)).toBe(0);
  });
});

describe("L3.5 · GATE-KERNELLOAD SUPER (positivo)", () => {
  it("C>>m hace `super m` y alcanza la impl de B (lookup desde definingClass.superclass)", () => {
    const u = freshUniverse();
    const A = subclassOf(u, u.Object, "A");
    const B = subclassOf(u, A, "B");
    const C = subclassOf(u, B, "C");
    // A>>m -> 1, B>>m -> 2, C>>m -> super m (debe alcanzar B = 2, NO A).
    defineMethod(A, "m [ ^ 1 ]", u);
    defineMethod(B, "m [ ^ 2 ]", u);
    defineMethod(C, "m [ ^ super m ]", u);
    expect(send(instanceOf(u, C), "m", [], u)).toBe(2);
  });

  it("super arranca en la superclase de la clase DEFINIDORA, no en classOf(receiver)", () => {
    const u = freshUniverse();
    const A = subclassOf(u, u.Object, "A2");
    const B = subclassOf(u, A, "B2");
    const C = subclassOf(u, B, "C2");
    // Sólo A y C definen tag; B no. C>>tag = super tag debe SALTAR B y llegar a A.
    defineMethod(A, "tag [ ^ 100 ]", u);
    defineMethod(C, "tag [ ^ super tag ]", u);
    expect(send(instanceOf(u, C), "tag", [], u)).toBe(100);
  });
});

describe("L3.5 · `^` retorna desde el home del método", () => {
  it("`^` dentro de un ifTrue:-block retorna del MÉTODO, no del bloque", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "FooR");
    // early return: `^ 7` dentro del bloque desenrolla al home del método.
    defineMethod(Foo, "early [ true ifTrue: [ ^ 7 ]. ^ 99 ]", u);
    expect(send(instanceOf(u, Foo), "early", [], u)).toBe(7);
  });
});

describe("L3.5 · compileMethod expone selector", () => {
  it("compila el patrón y reporta el selector parseado", () => {
    const u = freshUniverse();
    const Foo = subclassOf(u, u.Object, "FooC");
    const compiled = compileMethod("add: a to: b [ ^ a + b ]", Foo, u);
    expect(compiled.selector).toBe("add:to:");
  });
});
