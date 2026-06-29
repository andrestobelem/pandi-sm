/**
 * S1-blockers — regresión para los 3 bugs bloqueantes de primitivas (rank #1, #2, #3).
 * Tests que deben fallar ANTES del fix (RED) y pasar después (GREEN).
 *
 * #1 — perform:/respondsTo: pasan un STSymbol boxed donde send()/intern() esperan un
 *      string JS: toda llamada Smalltalk perform: #sel termina en DNU.
 * #2 — instVarAt:/instVarAt:put: hacen .pointers en un receptor inmediato (42, true,
 *      bigint) → host TypeError que escapa al on:do:.
 * #3 — copy alialea elements/buffer: mutar la copia corrompe el original.
 *
 * @section L2.s1-blockers-regression
 * @kind    regression
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

// ── Finding #1 · perform:/respondsTo: con selector simbólico ────────────────

describe("S1 #1 · perform: con selector STSymbol dispatch correcto", () => {
  it("3 perform: #printString devuelve '3' (no DNU)", () => {
    // Antes del fix: intern(STSymbol) nunca hace match -> DNU -> host Error.
    expect(printString(evalSt("3 perform: #printString"))).toBe("3");
  });

  it("3 perform: #yourself devuelve 3", () => {
    expect(printString(evalSt("3 perform: #yourself"))).toBe("3");
  });

  it("perform:with: con selector STSymbol y argumento", () => {
    // 3 + 4 -> 7 vía perform:with:
    expect(printString(evalSt("3 perform: #+ with: 4"))).toBe("7");
  });
});

describe("S1 #1 · respondsTo: con selector STSymbol resultado correcto", () => {
  it("3 respondsTo: #yourself -> true (no false por STSymbol)", () => {
    // Antes del fix: intern(STSymbol) no matchea -> siempre false.
    expect(printString(evalSt("3 respondsTo: #yourself"))).toBe("true");
  });

  it("3 respondsTo: #+ -> true", () => {
    expect(printString(evalSt("3 respondsTo: #+"))).toBe("true");
  });

  it("3 respondsTo: #noExiste -> false", () => {
    expect(printString(evalSt("3 respondsTo: #noExiste"))).toBe("false");
  });
});

// ── Finding #2 · instVarAt: receptor inmediato señal capturable ─────────────

describe("S1 #2 · instVarAt: en receptor inmediato señala Error capturable", () => {
  it("[42 instVarAt: 1] on: Error do:[:e | 'caught'] -> 'caught' (no host TypeError)", () => {
    // Antes del fix: 42 as STObject -> .pointers es undefined -> TypeError de host
    // que escapa al on:do:.
    const src = "[42 instVarAt: 1] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("[true instVarAt: 1] on: Error do:[:e | 'ok'] -> 'ok'", () => {
    const src = "[true instVarAt: 1] on: Error do: [:e | 'ok']";
    expect(printString(evalSt(src))).toBe("ok");
  });

  it("[42 instVarAt: 1 put: 99] on: Error do:[:e | 'safe'] -> 'safe'", () => {
    const src = "[42 instVarAt: 1 put: 99] on: Error do: [:e | 'safe']";
    expect(printString(evalSt(src))).toBe("safe");
  });
});

// ── Finding #3 · copy de Array no aliasea elements ──────────────────────────

describe("S1 #3 · copy de Array no aliasea elements (mutación en copia no corrompe original)", () => {
  it("a := #(1 2 3). b := a copy. (b at: 1 put: 99). a at: 1 -> 1 (no 99)", () => {
    // Antes del fix: b.elements === a.elements (misma referencia) -> a at: 1 => 99.
    const src = `
      | a b |
      a := #(1 2 3).
      b := a copy.
      b at: 1 put: 99.
      a at: 1`;
    expect(printString(evalSt(src))).toBe("1");
  });

  it("copy de OrderedCollection no aliasea elements", () => {
    const src = `
      | oc cp |
      oc := OrderedCollection new.
      oc add: 10.
      oc add: 20.
      cp := oc copy.
      cp add: 30.
      oc size`;
    // La copia recibe add: pero el original sigue con 2 elementos.
    expect(printString(evalSt(src))).toBe("2");
  });
});
