/**
 * L2 · instanciación + identidad (S2, plan §5.2 líneas 290-302 "instanciación e
 * identidad"). Suite pura-TS sobre el modelo de objetos: basicNew (slot count +
 * nil-init), instVarAt:/instVarAt:put: base-1 con rango chequeado, identityHash
 * estable, == / ~~ por referencia, identidad sobre INMEDIATOS (3 == 3 por valor),
 * y lookupMethod resolviendo a la superclase que define. Character ($a == $a) es
 * L4 (no testeable hoy, diferido).
 *
 * @section L2.instantiation-identity
 * @kind    positive+negative
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import {
  basicNew,
  bootstrapKernel,
  identical,
  identityHash,
  instVarAt,
  instVarAtPut,
  lookupMethod,
  notIdentical,
} from "../../src/runtime/index.js";

describe("L2 · basicNew · slot count + nil-init (§5.2 basicNew)", () => {
  it("basicNew(cls) produce un STObject con pointers.length === instSize", () => {
    const u = bootstrapKernel();
    // Inyectamos una clase con instSize 3 mutando una clase núcleo de prueba.
    u.Object.instSize = 3;
    const obj = basicNew(u.Object, u);
    expect(obj.pointers.length).toBe(3);
  });

  it("basicNew inicializa cada slot a nil (no undefined)", () => {
    const u = bootstrapKernel();
    u.Object.instSize = 2;
    const obj = basicNew(u.Object, u);
    expect(obj.pointers[0]).toBe(u.nil);
    expect(obj.pointers[1]).toBe(u.nil);
  });

  it("basicNew(cls).class === cls y es instancia (no la clase misma)", () => {
    const u = bootstrapKernel();
    const obj = basicNew(u.Object, u);
    expect(obj.class).toBe(u.Object);
    expect(obj).not.toBe(u.Object);
  });

  it("instSize 0 produce un objeto sin slots (pointers vacío)", () => {
    const u = bootstrapKernel();
    const obj = basicNew(u.SmallInteger, u);
    expect(obj.pointers.length).toBe(0);
  });
});

describe("L2 · instVarAt:/instVarAt:put: · base-1 + round-trip (§5.2)", () => {
  it("instVarAtPut(obj, i, v) seguido de instVarAt(obj, i) devuelve v (base-1)", () => {
    const u = bootstrapKernel();
    u.Object.instSize = 2;
    const obj = basicNew(u.Object, u);
    instVarAtPut(obj, 1, 42);
    instVarAtPut(obj, 2, "x");
    expect(instVarAt(obj, 1)).toBe(42);
    expect(instVarAt(obj, 2)).toBe("x");
  });

  it("instVarAt: 0 lanza un error de rango determinista (base-1, no base-0)", () => {
    const u = bootstrapKernel();
    u.Object.instSize = 1;
    const obj = basicNew(u.Object, u);
    expect(() => instVarAt(obj, 0)).toThrow(/index|rango|range/i);
  });

  it("instVarAt: N+1 lanza un error de rango determinista", () => {
    const u = bootstrapKernel();
    u.Object.instSize = 1;
    const obj = basicNew(u.Object, u);
    expect(() => instVarAt(obj, 2)).toThrow(/index|rango|range/i);
  });

  it("instVarAtPut: fuera de rango también lanza error determinista", () => {
    const u = bootstrapKernel();
    u.Object.instSize = 1;
    const obj = basicNew(u.Object, u);
    expect(() => instVarAtPut(obj, 0, 1)).toThrow(/index|rango|range/i);
    expect(() => instVarAtPut(obj, 2, 1)).toThrow(/index|rango|range/i);
  });
});

describe("L2 · identityHash · estable y por objeto (§5.2 identityHash)", () => {
  it("identityHash del mismo objeto es igual en llamadas sucesivas", () => {
    const u = bootstrapKernel();
    const obj = basicNew(u.Object, u);
    expect(identityHash(obj, u)).toBe(identityHash(obj, u));
  });

  it("dos basicNew distintos tienen identityHash distinto", () => {
    const u = bootstrapKernel();
    const a = basicNew(u.Object, u);
    const b = basicNew(u.Object, u);
    expect(identityHash(a, u)).not.toBe(identityHash(b, u));
  });
});

describe("L2 · == / ~~ · por referencia (§5.2 identidad)", () => {
  it("a == a es true; dos basicNew distintos a == b es false", () => {
    const u = bootstrapKernel();
    const a = basicNew(u.Object, u);
    const b = basicNew(u.Object, u);
    expect(identical(a, a)).toBe(true);
    expect(identical(a, b)).toBe(false);
  });

  it("~~ es la negación de == por referencia", () => {
    const u = bootstrapKernel();
    const a = basicNew(u.Object, u);
    const b = basicNew(u.Object, u);
    expect(notIdentical(a, b)).toBe(true);
    expect(notIdentical(a, a)).toBe(false);
  });
});

describe("L2 · identidad sobre INMEDIATOS · por valor (§5.2; Character DIFERIDO a L4)", () => {
  it("3 == 3 es true (SmallInteger inmediato compara por valor)", () => {
    expect(identical(3, 3)).toBe(true);
  });

  it("identityHash de un SmallInteger es estable y consistente con la igualdad por valor", () => {
    const u = bootstrapKernel();
    expect(identityHash(3, u)).toBe(identityHash(3, u));
    // Consistencia: si 3 == 3 entonces sus identityHash coinciden.
    expect(identical(3, 3)).toBe(true);
    expect(identityHash(3, u)).toBe(identityHash(3, u));
  });

  it("strings inmediatos comparan por valor: 'a' == 'a' es true", () => {
    expect(identical("a", "a")).toBe(true);
    expect(identical("a", "b")).toBe(false);
  });
});

describe("L2 · lookupMethod · resuelve a la superclase que define (§5.2 lookup)", () => {
  it("un selector definido en una superclase se encuentra subiendo la cadena", () => {
    const u = bootstrapKernel();
    const sel = u.symbols.intern("foo");
    const prim = () => u.nil;
    // Definimos en Object; lo buscamos desde una subclase (SmallInteger < Object).
    u.Object.methodDict.set(sel, prim);
    expect(lookupMethod(u.SmallInteger, sel)).toBe(prim);
  });

  it("un selector no definido en ninguna superclase devuelve undefined", () => {
    const u = bootstrapKernel();
    const sel = u.symbols.intern("noSuchSelector");
    expect(lookupMethod(u.SmallInteger, sel)).toBeUndefined();
  });

  it("la definición más específica (subclase) gana sobre la heredada", () => {
    const u = bootstrapKernel();
    const sel = u.symbols.intern("bar");
    const inherited = () => u.nil;
    const own = () => u.Transcript;
    u.Object.methodDict.set(sel, inherited);
    u.SmallInteger.methodDict.set(sel, own);
    expect(lookupMethod(u.SmallInteger, sel)).toBe(own);
  });
});
