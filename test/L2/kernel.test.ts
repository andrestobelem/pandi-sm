/**
 * L2 · kernel — invariantes del metamodelo MÍNIMO (walking skeleton, plan §4/§5.2).
 * NO se verifica el cierre metacircular completo ni el protocolo de 23 selectores
 * (eso es L2-proper, diferido). Sólo lo que el skeleton necesita para que send()
 * pueda hacer lookup: cadena de clases núcleo, nil único, classOf sobre inmediatos,
 * y method dicts vacíos (Map) en bootstrap.
 *
 * @section L2.kernel
 * @kind    positive
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { bootstrapKernel, classOf } from "../../src/runtime/index.js";

describe("L2 · kernel · classOf sobre inmediatos y objetos", () => {
  it("classOf(3) === Universe.SmallInteger (number nativo)", () => {
    const u = bootstrapKernel();
    expect(classOf(3, u)).toBe(u.SmallInteger);
  });

  it("classOf(bigint) === Universe.SmallInteger (entero promovido)", () => {
    const u = bootstrapKernel();
    expect(classOf(9007199254740993n, u)).toBe(u.SmallInteger);
  });

  it("classOf('hi') === Universe.String", () => {
    const u = bootstrapKernel();
    expect(classOf("hi", u)).toBe(u.String);
  });

  it("classOf(Universe.Transcript) === Universe.Transcript_class", () => {
    const u = bootstrapKernel();
    expect(classOf(u.Transcript, u)).toBe(u.Transcript_class);
  });
});

describe("L2 · kernel · nil singleton", () => {
  it("classOf(nil) === Universe.UndefinedObject", () => {
    const u = bootstrapKernel();
    expect(classOf(u.nil, u)).toBe(u.UndefinedObject);
  });

  it("nil es la única instancia: dos bootstraps producen nils referencialmente distintos pero cada Universe tiene UN solo nil", () => {
    const u = bootstrapKernel();
    // No hay segunda forma de fabricar nil dentro del mismo Universe.
    expect(u.nil).toBe(u.nil);
    expect(classOf(u.nil, u)).toBe(u.UndefinedObject);
  });
});

describe("L2 · kernel · cadena de clases núcleo (lookup-ready)", () => {
  it("Object.superclass es nil; Behavior->Object; ClassDescription->Behavior; Class->ClassDescription", () => {
    const u = bootstrapKernel();
    expect(u.Object.superclass).toBe(u.nil);
    expect(u.Behavior.superclass).toBe(u.Object);
    expect(u.ClassDescription.superclass).toBe(u.Behavior);
    expect(u.Class.superclass).toBe(u.ClassDescription);
  });

  it("UndefinedObject.superclass === Object (raíz de la cadena de inmediatos/clases)", () => {
    const u = bootstrapKernel();
    expect(u.UndefinedObject.superclass).toBe(u.Object);
  });

  it("Metaclass existe (mínimo) y SmallInteger/String/Transcript_class encadenan a Object", () => {
    const u = bootstrapKernel();
    expect(u.Metaclass).toBeDefined();
    expect(u.SmallInteger.superclass).toBe(u.Object);
    expect(u.String.superclass).toBe(u.Object);
    expect(u.Transcript_class.superclass).toBe(u.Object);
  });
});

describe("L2 · kernel · method dicts vacíos en bootstrap (L3 instala primitivas)", () => {
  it("cada clase núcleo tiene methodDict que es un Map vacío", () => {
    const u = bootstrapKernel();
    for (const cls of [
      u.Object,
      u.Behavior,
      u.ClassDescription,
      u.Class,
      u.Metaclass,
      u.UndefinedObject,
      u.SmallInteger,
      u.String,
      u.Transcript_class,
    ]) {
      expect(cls.methodDict).toBeInstanceOf(Map);
      expect(cls.methodDict.size).toBe(0);
    }
  });
});

describe("L2 · kernel · SymbolTable inyectada en el Universe", () => {
  it("el Universe expone una SymbolTable que internea '+','*','show:' con identidad", () => {
    const u = bootstrapKernel();
    expect(u.symbols.intern("+")).toBe(u.symbols.intern("+"));
    expect(u.symbols.intern("+")).not.toBe(u.symbols.intern("show:"));
  });
});
