/**
 * L2-proper · closure — el cierre metacircular del golden braid (plan §5.2,
 * "Object model / metamodelo"). El skeleton cableaba TODAS las clases al MISMO
 * Metaclass (shared); aquí asertamos el braid REAL: cada clase tiene su PROPIA
 * metaclase "X class", el doble classOf cierra en Metaclass, hay paralelismo de
 * superclases, y la trampa classOf(Object).superclass === Class.
 *
 * @section L2.closure
 * @kind    positive
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { bootstrapKernel, classOf } from "../../src/runtime/index.js";

/** Las clases núcleo cuyo braid asertamos (las 13 de bootstrap). */
function coreClasses(u: ReturnType<typeof bootstrapKernel>) {
  return [
    u.Object,
    u.Behavior,
    u.ClassDescription,
    u.Class,
    u.Metaclass,
    u.UndefinedObject,
    u.SmallInteger,
    u.String,
    u.Boolean,
    u.True,
    u.False,
    u.BlockClosure,
    u.Transcript_class,
  ];
}

describe("L2 · closure · doble classOf cierra en Metaclass (§5.2 'X class class === Metaclass')", () => {
  it("classOf(classOf(X)) === Metaclass para cada clase núcleo", () => {
    const u = bootstrapKernel();
    for (const X of coreClasses(u)) {
      expect(classOf(classOf(X, u), u)).toBe(u.Metaclass);
    }
  });

  it("Metaclass class class === Metaclass (el único self-loop del braid)", () => {
    const u = bootstrapKernel();
    // classOf(Metaclass) es "Metaclass class"; su clase debe ser Metaclass.
    expect(classOf(classOf(u.Metaclass, u), u)).toBe(u.Metaclass);
  });
});

describe("L2 · closure · metaclases distintas por clase (§5.2 'una metaclase por clase')", () => {
  it("cada clase núcleo tiene una metaclase ÚNICA llamada 'X class'", () => {
    const u = bootstrapKernel();
    const classes = coreClasses(u);
    const metas = classes.map((X) => classOf(X, u));
    // Distintas: tantas metaclases distintas como clases (sin compartir Metaclass).
    expect(new Set(metas).size).toBe(classes.length);
    // Nombradas "X class".
    for (const X of classes) {
      expect((classOf(X, u) as { name: string }).name).toBe(`${X.name} class`);
    }
  });

  it("la metaclase de cada clase NO es el Metaclass compartido (corrige el shared del skeleton)", () => {
    const u = bootstrapKernel();
    // Object class es una metaclase propia, no Metaclass.
    expect(classOf(u.Object, u)).not.toBe(u.Metaclass);
    // Salvo Metaclass mismo: classOf(Metaclass) es "Metaclass class", tampoco === Metaclass.
    expect(classOf(u.Metaclass, u)).not.toBe(u.Metaclass);
  });
});

describe("L2 · closure · paralelismo de superclases (§5.2 'classOf(X).superclass === classOf(X.superclass)')", () => {
  it("para cada clase con superclass !== nil, classOf(X).superclass === classOf(X.superclass)", () => {
    const u = bootstrapKernel();
    for (const X of coreClasses(u)) {
      const sup = X.superclass;
      // Object.superclass === nil (no es una clase); su paralelismo es la trampa de abajo.
      if (sup === u.nil || sup === null) continue;
      const meta = classOf(X, u);
      expect(meta.superclass).toBe(classOf(sup as never, u));
    }
  });
});

describe("L2 · closure · trampa: classOf(Object).superclass === Class (§5.2)", () => {
  it("classOf(Object).superclass === Class (raíz del braid: 'Object class' hereda de Class)", () => {
    const u = bootstrapKernel();
    expect(classOf(u.Object, u).superclass).toBe(u.Class);
  });

  it("la cadena Class -> ClassDescription -> Behavior -> Object es caminable", () => {
    const u = bootstrapKernel();
    expect(u.Class.superclass).toBe(u.ClassDescription);
    expect(u.ClassDescription.superclass).toBe(u.Behavior);
    expect(u.Behavior.superclass).toBe(u.Object);
  });
});

describe("L2 · closure · nil singleton preservado (§5.2, no regresión del skeleton)", () => {
  it("classOf(nil) === UndefinedObject; UndefinedObject.superclass === Object; Object.superclass === nil", () => {
    const u = bootstrapKernel();
    expect(classOf(u.nil, u)).toBe(u.UndefinedObject);
    expect(u.UndefinedObject.superclass).toBe(u.Object);
    expect(u.Object.superclass).toBe(u.nil);
  });

  it("classOf sobre inmediatos intacto (number->SmallInteger, string->String, bool->True/False)", () => {
    const u = bootstrapKernel();
    expect(classOf(3, u)).toBe(u.SmallInteger);
    expect(classOf("hi", u)).toBe(u.String);
    expect(classOf(true, u)).toBe(u.True);
    expect(classOf(false, u)).toBe(u.False);
  });
});
