/**
 * L3.5 · KERNELLOAD S1 — namespace mutable, evaluación de symbol-literal (#Foo) y
 * la familia de primitivas de definición (subclass:instanceVariableNames:
 * classVariableNames:package: + variantes), que enrutan a UN solo camino de
 * construcción TS (reusando la lógica de metaclase del bootstrap golden-braid).
 * GATE-KERNELLOAD-SUBCLASS-PRIM (plan §5.4.0): positivo (name/superclass/instSize/
 * methodDict vacío/classOf(Foo class)===Metaclass/Foo resoluble como global/
 * basicNew con slots nil) + negativo (no-Behavior => doesNotUnderstand:) +
 * reaseveración del cierre metacircular con Foo añadido + eval de symbol-literal.
 *
 * @section L3-5.subclass
 * @kind    positive
 * @layer   L3.5
 */
import { describe, expect, it } from "vitest";
import { evalWith } from "../../src/eval/eval.js";
import { basicNew, classOf, type STClass, type STObject } from "../../src/runtime/index.js";

/** Evalúa una fuente y devuelve {value, universe} para inspeccionar el grafo. */
function run(source: string) {
  return evalWith(source);
}

describe("L3.5 · symbol-literal eval (#Foo)", () => {
  it("#Foo evalúa al símbolo interned (identidad ==)", () => {
    const { value, universe } = run("#Foo");
    expect(value).toBe(universe.symbols.intern("Foo"));
  });

  it("#Foo == #Foo (mismo símbolo interned, identidad por referencia)", () => {
    const { value } = run("#Foo == #Foo");
    expect(value).toBe(true);
  });

  it("classOf(#Foo) === Symbol", () => {
    const { value, universe } = run("#Foo");
    expect(classOf(value, universe)).toBe(universe.Symbol);
  });
});

describe("L3.5 · GATE-KERNELLOAD-SUBCLASS-PRIM (positivo)", () => {
  const src =
    "Object subclass: #Foo instanceVariableNames: 'x' classVariableNames: '' package: 'T'";

  it("devuelve una STClass con name 'Foo', superclass===Object, instSize 1, methodDict vacío", () => {
    const { value, universe } = run(src);
    const foo = value as STClass;
    expect(foo.name).toBe("Foo");
    expect(foo.superclass).toBe(universe.Object);
    expect(foo.instSize).toBe(1);
    expect(foo.methodDict.size).toBe(0);
  });

  it("classOf(Foo) es su metaclase y classOf(classOf(Foo)) === Metaclass", () => {
    const { value, universe } = run(src);
    const foo = value as STClass;
    const metaFoo = classOf(foo, universe);
    expect(metaFoo.name).toBe("Foo class");
    expect(classOf(metaFoo, universe)).toBe(universe.Metaclass);
  });

  it("la metaclase de Foo hereda de classOf(Object) (paralelismo del braid)", () => {
    const { value, universe } = run(src);
    const foo = value as STClass;
    const metaFoo = classOf(foo, universe);
    expect(metaFoo.superclass).toBe(classOf(universe.Object, universe));
  });

  it("Foo queda resoluble como global tras el subclass:", () => {
    const { value, universe } = run(`${src}. Foo`);
    expect(value).toBe(universe.namespace.get("Foo"));
    expect((value as STClass).name).toBe("Foo");
  });

  it("basicNew(Foo) produce 1 slot inicializado a nil", () => {
    const { value, universe } = run(src);
    const foo = value as STClass;
    const inst = basicNew(foo, universe) as STObject;
    expect(inst.pointers.length).toBe(1);
    expect(inst.pointers[0]).toBe(universe.nil);
  });

  it("variante corta subclass: deriva instSize 0", () => {
    const { value } = run("Object subclass: #Bar");
    const bar = value as STClass;
    expect(bar.name).toBe("Bar");
    expect(bar.instSize).toBe(0);
  });

  it("instanceVariableNames: con 'a b c' deriva instSize 3", () => {
    const { value } = run(
      "Object subclass: #Baz instanceVariableNames: 'a b c' classVariableNames: '' package: 'T'",
    );
    expect((value as STClass).instSize).toBe(3);
  });
});

describe("L3.5 · GATE-KERNELLOAD-SUBCLASS-PRIM (negativo)", () => {
  it("3 subclass: #Bar ... enruta por doesNotUnderstand: (anclaje por selector)", () => {
    expect(() =>
      run("3 subclass: #Bar instanceVariableNames: '' classVariableNames: '' package: 'T'"),
    ).toThrowError(/doesNotUnderstand|no entiende/);
  });
});

describe("L3.5 · cierre metacircular sigue válido con Foo añadido", () => {
  const src =
    "Object subclass: #Foo instanceVariableNames: 'x' classVariableNames: '' package: 'T'";

  it("classOf(classOf(X)) === Metaclass para todo el namespace, incl. Foo", () => {
    const { universe } = run(src);
    for (const X of universe.namespace.values()) {
      expect(classOf(classOf(X, universe), universe)).toBe(universe.Metaclass);
    }
  });

  it("X class superclass === X superclass class para toda clase con superclase no-nil", () => {
    const { universe } = run(src);
    for (const X of universe.namespace.values()) {
      const sup = X.superclass;
      if (sup !== null && sup !== universe.nil && "methodDict" in sup) {
        expect(classOf(X, universe).superclass).toBe(classOf(sup as STClass, universe));
      }
    }
  });

  it("la trampa Object: classOf(Object).superclass === Class", () => {
    const { universe } = run(src);
    expect(classOf(universe.Object, universe).superclass).toBe(universe.Class);
  });
});
