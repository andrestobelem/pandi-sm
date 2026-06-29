/**
 * L4 · F5 (S2) — String + Symbol PROTOCOLO (GATE-F5-STRING-SYMBOL, plan §5.4 línea 790).
 * Sobre el String BOXED de S1 (STObject {class:u.String, …, chars}), este slice cablea el
 * protocolo observable por código de usuario:
 *   , (concat -> un String FRESCO con los chars concatenados),
 *   size (cantidad de chars),
 *   asSymbol (intern -> el MISMO Symbol que #foo, igualdad por IDENTIDAD),
 *   asString (en String -> self; en Symbol -> un String boxed con sus chars),
 *   = (igualdad por CONTENIDO; == sigue por IDENTIDAD, de S1).
 * La identidad interned de Symbol (#foo == #foo) ya existe (SymbolTable).
 *
 * GATE-F5: >=8 positivos + >=2 identidad = 10 casos.
 *
 * @section L4.f5-string-symbol
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F5 · String protocolo · , size asString = (positivos)", () => {
  it("positivo 1 — 'ab' , 'cd' => 'abcd' (concat devuelve un String)", () => {
    expect(printString(evalSt("'ab' , 'cd'"))).toBe("abcd");
  });

  it("positivo 2 — el resultado de , es un String (responde size = 4)", () => {
    expect(printString(evalSt("('ab' , 'cd') size"))).toBe("4");
  });

  it("positivo 3 — concat con vacío es neutro: 'foo' , '' => 'foo'", () => {
    expect(printString(evalSt("'foo' , ''"))).toBe("foo");
    expect(printString(evalSt("'' , 'foo'"))).toBe("foo");
  });

  it("positivo 4 — size de un literal cuenta sus chars ('hola' size => 4)", () => {
    expect(printString(evalSt("'hola' size"))).toBe("4");
    expect(printString(evalSt("'' size"))).toBe("0");
  });

  it("positivo 5 — String>>asString es self por contenido ('foo' asString = 'foo')", () => {
    expect(printString(evalSt("'foo' asString = 'foo'"))).toBe("true");
  });

  it("positivo 6 — 'foo' = 'foo' => true por CONTENIDO (S1, base de F5)", () => {
    expect(printString(evalSt("'foo' = 'foo'"))).toBe("true");
    expect(printString(evalSt("'foo' = 'bar'"))).toBe("false");
  });

  it("positivo 7 — round-trip 'foo' asSymbol asString = 'foo' (String->Symbol->String)", () => {
    expect(printString(evalSt("'foo' asSymbol asString = 'foo'"))).toBe("true");
  });

  it("positivo 8 — Symbol HEREDA size de String (#hola size => 4)", () => {
    expect(printString(evalSt("#hola size"))).toBe("4");
  });

  it("positivo 9 — Symbol>>asString => un String boxed (#foo asString = 'foo')", () => {
    expect(printString(evalSt("#foo asString"))).toBe("foo");
    expect(printString(evalSt("#foo asString = 'foo'"))).toBe("true");
  });
});

describe("L4 · F5 · String/Symbol IDENTIDAD (>=2)", () => {
  it("identidad 1 — #foo == #foo => true (Symbol interned por la SymbolTable)", () => {
    expect(printString(evalSt("#foo == #foo"))).toBe("true");
    expect(printString(evalSt("#foo == #bar"))).toBe("false");
  });

  it("identidad 2 — 'foo' asSymbol == #foo => true (intern por la MISMA tabla)", () => {
    expect(printString(evalSt("'foo' asSymbol == #foo"))).toBe("true");
  });

  it("identidad 3 — 'foo' == 'foo' copy => false (copy es una caja FRESCA, contenido =)", () => {
    expect(printString(evalSt("'foo' == 'foo' copy"))).toBe("false");
    expect(printString(evalSt("'foo' = 'foo' copy"))).toBe("true");
  });

  it("identidad 4 — Symbol>>= es por IDENTIDAD: #foo = #foo true, #foo = 'foo' FALSE (ANSI/Pharo)", () => {
    // Symbol interned: su '=' ES '=='. Diverge del = por contenido que heredaría de String.
    expect(printString(evalSt("#foo = #foo"))).toBe("true");
    expect(printString(evalSt("#foo = 'foo'"))).toBe("false");
    expect(printString(evalSt("#foo ~= 'foo'"))).toBe("true");
    expect(printString(evalSt("#foo = #bar"))).toBe("false");
  });

  it("identidad 5 — asimetría deliberada: 'foo' = #foo TRUE (String>>= por contenido)", () => {
    // String>>= compara contenido y un Symbol (< String) aporta su .text; la asimetría
    // (#foo = 'foo' false PERO 'foo' = #foo true) es la de Smalltalk estándar.
    expect(printString(evalSt("'foo' = #foo"))).toBe("true");
  });
});
