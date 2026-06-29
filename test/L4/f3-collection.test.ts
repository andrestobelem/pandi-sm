/**
 * L4 · F3 · S2 — Collection abstract protocol (plan §5.4 F3, GATE-F3-COLLECTION).
 * Los selectores de enumeración (do: collect: select: reject: detect: detect:ifNone:
 * inject:into: size isEmpty notEmpty includes: add:) viven en Collection (.st),
 * derivados PURAMENTE de do:/size + bloques + self (el acceso por nombre de ivar en
 * cuerpos .st no está cableado). do: es una PRIMITIVA sobre los receptores concretos
 * (Array/OrderedCollection: itera `elements` reentrando al evaluador con evalBlock).
 *
 * Species (origin=ingenieria/dialecto, NO ANSI estricto, §8.10): collect:/select:/
 * reject: construyen SIEMPRE un Array (Interval collect: -> Array es el caso de
 * species de F4; aquí lo cubrimos sobre Array y OrderedCollection). add: vive en una
 * OrderedCollection growable (Array es de tamaño fijo: su add: señala un Error).
 *
 * @section L4.f3-collection
 * @kind    positive
 * @layer   L4
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";
import { COLLECTIONS_PROVENANCE } from "../../src/eval/kernel-collections.js";
import { compiledMethodOf } from "../../src/eval/method.js";
import type { STClass } from "../../src/runtime/index.js";
import { lookupMethod } from "../../src/runtime/index.js";

describe("L4 · F3 · S2 · do: (primitiva, itera elements)", () => {
  it("do: invoca el bloque por cada elemento (acumula efecto)", () => {
    const src = `
      | sum |
      sum := 0.
      #(1 2 3 4) do: [:e | sum := sum + e].
      sum`;
    expect(printString(evalSt(src))).toBe("10");
  });

  it("do: sobre un Array vacío no invoca el bloque", () => {
    const src = `
      | n |
      n := 0.
      { } do: [:e | n := n + 1].
      n`;
    expect(printString(evalSt(src))).toBe("0");
  });
});

describe("L4 · F3 · S2 · size / isEmpty / notEmpty (derivados .st)", () => {
  it("isEmpty es true para un Array vacío, false si tiene elementos", () => {
    expect(printString(evalSt("{ } isEmpty"))).toBe("true");
    expect(printString(evalSt("{ 1 } isEmpty"))).toBe("false");
  });

  it("notEmpty es la negación de isEmpty", () => {
    expect(printString(evalSt("{ } notEmpty"))).toBe("false");
    expect(printString(evalSt("{ 1 } notEmpty"))).toBe("true");
  });
});

describe("L4 · F3 · S2 · includes: (derivado de do:)", () => {
  it("includes: es true cuando el elemento está presente", () => {
    expect(printString(evalSt("#(1 2 3) includes: 2"))).toBe("true");
  });

  it("includes: es false cuando el elemento está ausente", () => {
    expect(printString(evalSt("#(1 2 3) includes: 9"))).toBe("false");
  });
});

describe("L4 · F3 · S2 · collect: / select: / reject: (species = Array)", () => {
  it("collect: aplica el bloque a cada elemento (resultado Array)", () => {
    expect(printString(evalSt("#(1 2 3) collect: [:e | e * 2]"))).toBe("#(2 4 6)");
  });

  it("collect: produce un Array (species, origin=dialecto)", () => {
    expect(printString(evalSt("(#(1 2 3) collect: [:e | e * 2]) class == Array"))).toBe("true");
  });

  it("select: conserva los elementos que satisfacen el bloque", () => {
    expect(printString(evalSt("#(1 2 3 4) select: [:e | e > 2]"))).toBe("#(3 4)");
  });

  it("reject: descarta los elementos que satisfacen el bloque", () => {
    expect(printString(evalSt("#(1 2 3 4) reject: [:e | e > 2]"))).toBe("#(1 2)");
  });

  it("select: produce un Array (species)", () => {
    expect(printString(evalSt("(#(1 2 3 4) select: [:e | e > 2]) class == Array"))).toBe("true");
  });
});

describe("L4 · F3 · S2 · detect: / detect:ifNone:", () => {
  it("detect: devuelve el primer elemento que satisface el bloque", () => {
    expect(printString(evalSt("#(1 2 3 4) detect: [:e | e > 2]"))).toBe("3");
  });

  it("detect:ifNone: devuelve el valor del bloque ifNone cuando NO hay match", () => {
    expect(printString(evalSt("#(1 2 3) detect: [:e | e > 9] ifNone: [#ninguno]"))).toBe(
      "#ninguno",
    );
  });

  it("detect:ifNone: con match devuelve el elemento (no el ifNone)", () => {
    expect(printString(evalSt("#(1 2 3) detect: [:e | e > 1] ifNone: [#ninguno]"))).toBe("2");
  });

  it("detect: sin match señala un Error capturable por on:do:", () => {
    const src = `[ #(1 2 3) detect: [:e | e > 9] ] on: Error do: [:e | #noEncontrado ]`;
    expect(printString(evalSt(src))).toBe("#noEncontrado");
  });
});

describe("L4 · F3 · S2 · inject:into:", () => {
  it("inject:into: pliega los elementos (suma)", () => {
    expect(printString(evalSt("#(1 2 3 4) inject: 0 into: [:acc :e | acc + e]"))).toBe("10");
  });

  it("inject:into: con receptor vacío devuelve el acumulador inicial", () => {
    expect(printString(evalSt("{ } inject: 42 into: [:acc :e | acc + e]"))).toBe("42");
  });
});

describe("L4 · F3 · S2 · add: sobre OrderedCollection growable", () => {
  it("add: agrega un elemento y devuelve el valor agregado", () => {
    expect(printString(evalSt("OrderedCollection new add: 5"))).toBe("5");
  });

  it("add: hace crecer la colección (size refleja los add:)", () => {
    const src = `
      | c |
      c := OrderedCollection new.
      c add: 10.
      c add: 20.
      c add: 30.
      c size`;
    expect(printString(evalSt(src))).toBe("3");
  });

  it("OrderedCollection acumula y at: lee 1-based lo agregado", () => {
    const src = `
      | c |
      c := OrderedCollection new.
      c add: 10.
      c add: 20.
      c at: 2`;
    expect(printString(evalSt(src))).toBe("20");
  });

  it("OrderedCollection hereda do:/collect: de Collection (species Array)", () => {
    const src = `
      | c |
      c := OrderedCollection new.
      c add: 1.
      c add: 2.
      (c collect: [:e | e * 10])`;
    expect(printString(evalSt(src))).toBe("#(10 20)");
  });

  it("Array es de tamaño fijo: add: señala un Error capturable", () => {
    const src = `[ { 1. 2 } add: 3 ] on: Error do: [:e | #fijo ]`;
    expect(printString(evalSt(src))).toBe("#fijo");
  });
});

describe("L4 · F3 · S2 · regresión: literales/bucles intactos", () => {
  it("(1 to: 5 do: [:i | ...]) sigue iterando", () => {
    const src = `
      | sum |
      sum := 0.
      1 to: 5 do: [:i | sum := sum + i].
      sum`;
    expect(printString(evalSt(src))).toBe("15");
  });
});

describe("L4 · F3/F4 · GATE-L4-PROVENANCE: tags de procedencia + log de desviaciones", () => {
  // Espejo de f2-number.test.ts: cada método derivado .st porta su tag COLLECTIONS_PROVENANCE,
  // y el log de desviaciones registra cada desviación esperada de L4 colecciones.

  it("los métodos derivados de Collection portan COLLECTIONS_PROVENANCE", () => {
    const { universe } = evalWith("nil");
    const collection = universe.namespace.get("Collection") as STClass;
    for (const selector of [
      "isEmpty",
      "notEmpty",
      "includes:",
      "inject:into:",
      "detect:ifNone:",
      "detect:",
      "collect:",
      "select:",
      "reject:",
    ]) {
      const prim = lookupMethod(collection, universe.symbols.intern(selector));
      expect(prim, `Collection>>${selector} debe estar instalado`).toBeDefined();
      const meta = compiledMethodOf(prim as NonNullable<typeof prim>);
      expect(meta?.provenanceTag, `tag de ${selector}`).toBe(COLLECTIONS_PROVENANCE);
    }
  });

  it("los métodos derivados de SequenceableCollection portan COLLECTIONS_PROVENANCE", () => {
    const { universe } = evalWith("nil");
    const sequenceable = universe.namespace.get("SequenceableCollection") as STClass;
    for (const selector of ["first", "last", ",", "copyFrom:to:"]) {
      const prim = lookupMethod(sequenceable, universe.symbols.intern(selector));
      expect(prim, `SequenceableCollection>>${selector} debe estar instalado`).toBeDefined();
      const meta = compiledMethodOf(prim as NonNullable<typeof prim>);
      expect(meta?.provenanceTag, `tag de ${selector}`).toBe(COLLECTIONS_PROVENANCE);
    }
    // el tag declara su origen (origin=ingenieria/dialecto: species/1-based no son ANSI core).
    expect(COLLECTIONS_PROVENANCE).toMatch(/origin=/);
  });

  it("el log de desviaciones registra cada desviación esperada de L4 colecciones (DEV-032..DEV-035)", () => {
    const logPath = fileURLToPath(
      new URL("../../doc/research/log-de-desviaciones.md", import.meta.url),
    );
    const log = readFileSync(logPath, "utf8");
    // (DEV-032) species=Array; (DEV-033) 1-based at:/at:put:; (DEV-034) {}/#( )/#[ ] -> Array;
    // (DEV-035) Interval sólo de enteros seguros (paso/extremo no entero o bigint inseguro señala).
    for (const dev of ["DEV-032", "DEV-033", "DEV-034", "DEV-035"]) {
      expect(log, `${dev} debe existir en el log`).toContain(`| ${dev} |`);
    }
    // DEV-025 (raíz instSize) debe estar transicionada a "implementada (raíz cerrada)".
    expect(log).toContain("implementada (raíz cerrada)");
  });
});
