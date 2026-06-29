/**
 * L4 · F5 (S1) — String BOXING + frontera nativo/boxed (GATE-F5 parcial, GATE-L4-IDENTITY).
 * String pasa de valor NATIVO JS a un STObject boxed {class:u.String, …, chars}, mirroring
 * STArray.elements (DEV-028: una sola representación por clase). CONSECUENCIA observable:
 * dos literales 'foo' distintos son objetos DISTINTOS -> '==' por IDENTIDAD es FALSE; la
 * igualdad por CONTENIDO (String>>=) sigue TRUE. Los inmediatos (SmallInteger/Character/
 * Boolean) NO se tocan. La frontera nativa interna (class.name, printString bridge, symbol
 * table) debe seguir verde: 'foo' printString y X class name siguen imprimiendo su texto.
 *
 * @section L4.f5-string-boxing
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F5 · String boxed · IDENTIDAD (==) por referencia", () => {
  it("identidad — 'foo' == 'foo' copy => false (copy es una instancia FRESCA)", () => {
    expect(printString(evalSt("'foo' == 'foo' copy"))).toBe("false");
  });

  it("identidad — dos literales 'foo' distintos NO son == (objetos distintos)", () => {
    expect(printString(evalSt("'foo' == 'foo'"))).toBe("false");
    // ~~ es la negación: dos cajas distintas SÍ son ~~.
    expect(printString(evalSt("'foo' ~~ 'foo'"))).toBe("true");
  });

  it("identidad — un mismo binding ES == a sí mismo (misma caja)", () => {
    expect(printString(evalSt("| s | s := 'foo'. s == s"))).toBe("true");
  });

  it("identidad — copy preserva el contenido ('foo' = 'foo' copy => true)", () => {
    expect(printString(evalSt("'foo' = 'foo' copy"))).toBe("true");
  });
});

describe("L4 · F5 · String boxed · CONTENIDO (=) por valor", () => {
  it("contenido — 'foo' = 'foo' => true (igualdad por chars, no por identidad)", () => {
    expect(printString(evalSt("'foo' = 'foo'"))).toBe("true");
  });

  it("contenido — 'foo' = 'bar' => false; 'foo' ~= 'bar' => true", () => {
    expect(printString(evalSt("'foo' = 'bar'"))).toBe("false");
    expect(printString(evalSt("'foo' ~= 'bar'"))).toBe("true");
  });

  it("contenido — 'foo' = 3 => false (un no-String no es igual, sin error)", () => {
    expect(printString(evalSt("'foo' = 3"))).toBe("false");
  });
});

describe("L4 · F5 · String boxed · inmediatos INTACTOS (no se boxean)", () => {
  it("SmallInteger sigue por valor: 3 == 3 => true", () => {
    expect(printString(evalSt("3 == 3"))).toBe("true");
  });

  it("Character sigue por valor: $a == $a => true", () => {
    expect(printString(evalSt("$a == $a"))).toBe("true");
  });

  it("Symbol interned sigue por identidad: #foo == #foo => true", () => {
    expect(printString(evalSt("#foo == #foo"))).toBe("true");
  });
});

describe("L4 · F5 · frontera nativa/boxed · printString y class name verdes", () => {
  it("printString de un literal String => sus chars ('hola')", () => {
    expect(printString(evalSt("'hola'"))).toBe("hola");
  });

  it("'foo' class => String (classOf despacha la caja por .class)", () => {
    expect(printString(evalSt("'foo' class name"))).toBe("String");
  });

  it("X class name (name boxed) sigue imprimiendo el texto de la clase", () => {
    expect(printString(evalSt("3 class name"))).toBe("SmallInteger");
  });

  it("Class>>name es un String boxed que responde protocolo (= por contenido)", () => {
    // El leak clave: aClass name llega a código de usuario como String boxed, no nativo.
    expect(printString(evalSt("(3 class name) = 'SmallInteger'"))).toBe("true");
  });
});

describe("L4 · F5 · interning · String<->Symbol por identidad", () => {
  it("'foo' asSymbol == #foo => true (intern por la misma SymbolTable)", () => {
    expect(printString(evalSt("'foo' asSymbol == #foo"))).toBe("true");
  });

  it("#foo asString => un String boxed con los chars del símbolo", () => {
    expect(printString(evalSt("#foo asString"))).toBe("foo");
    expect(printString(evalSt("#foo asString = 'foo'"))).toBe("true");
  });
});
