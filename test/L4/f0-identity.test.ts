/**
 * L4 · F0 — identidad cross-familia (GATE-L4-IDENTITY). == / ~~ / identityHash
 * coherentes entre SmallInteger, String, Symbol, Boolean y UndefinedObject:
 * inmediatos por VALOR (3 == 3, 'a' == 'a', #foo == #foo), contenido distinto de
 * la misma clase => == false / = true (los inmutables, por valor), identityHash
 * consistente con ==. Character/Float == llegan en S2 (boxing), se anotan aquí.
 *
 * @section L4.f0-identity
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F0 · GATE-L4-IDENTITY · == por valor para inmediatos", () => {
  it("caso 1 — 3 == 3 => true (SmallInteger por valor)", () => {
    expect(printString(evalSt("3 == 3"))).toBe("true");
  });

  it("caso 2 — 3 == 4 => false; 3 ~~ 4 => true", () => {
    expect(printString(evalSt("3 == 4"))).toBe("false");
    expect(printString(evalSt("3 ~~ 4"))).toBe("true");
  });

  it("caso 3 — 'a' == 'a' => true (String por valor); 'a' == 'b' => false", () => {
    expect(printString(evalSt("'a' == 'a'"))).toBe("true");
    expect(printString(evalSt("'a' == 'b'"))).toBe("false");
  });

  it("caso 4 — #foo == #foo => true (Symbol interned, identidad por referencia)", () => {
    expect(printString(evalSt("#foo == #foo"))).toBe("true");
    expect(printString(evalSt("#foo == #bar"))).toBe("false");
  });

  it("caso 5 — true == true => true; true == false => false (Boolean por valor)", () => {
    expect(printString(evalSt("true == true"))).toBe("true");
    expect(printString(evalSt("true == false"))).toBe("false");
  });

  it("caso 6 — nil == nil => true (UndefinedObject singleton); nil == 3 => false", () => {
    expect(printString(evalSt("nil == nil"))).toBe("true");
    expect(printString(evalSt("nil == 3"))).toBe("false");
  });
});

describe("L4 · F0 · GATE-L4-IDENTITY · contenido distinto misma clase => ==false / =true", () => {
  it("BigInt promovido: el mismo entero conserva identidad (== por valor) tras overflow", () => {
    // (2^53-1)+1 promueve a bigint; comparado contra el mismo valor por número/bigint
    // debe seguir siendo == (identical() normaliza number/bigint a BigInt).
    expect(printString(evalSt("(9007199254740991 + 1) == 9007199254740992"))).toBe("true");
  });

  it("= (igualdad por valor) vs == coinciden para inmutables de mismo valor", () => {
    expect(printString(evalSt("'hola' = 'hola'"))).toBe("true");
    expect(printString(evalSt("'hola' == 'hola'"))).toBe("true");
  });
});

describe("L4 · F0 · GATE-L4-IDENTITY · identityHash consistente con ==", () => {
  it("3 identityHash == 3 identityHash (mismo valor => mismo hash)", () => {
    expect(printString(evalSt("(3 identityHash) = (3 identityHash)"))).toBe("true");
  });

  it("#foo hash == #foo hash (símbolo interned, hash por texto)", () => {
    expect(printString(evalSt("(#foo hash) = (#foo hash)"))).toBe("true");
  });

  it("'a' identityHash == 'a' identityHash (string por valor)", () => {
    expect(printString(evalSt("('a' identityHash) = ('a' identityHash)"))).toBe("true");
  });
});
