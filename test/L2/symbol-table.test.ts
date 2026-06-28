/**
 * L2 · SymbolTable — interning con identidad (==). El skeleton requiere al menos
 * '+', '*', 'show:'. Dos intern del mismo texto devuelven el MISMO objeto;
 * intern de textos distintos devuelve objetos distintos (identidad por selector).
 *
 * @section L2.symbol-table
 * @kind    positive
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { SymbolTable } from "../../src/runtime/index.js";

describe("L2 · SymbolTable · interning por identidad", () => {
  it("intern('+') === intern('+') (misma identidad)", () => {
    const t = new SymbolTable();
    expect(t.intern("+")).toBe(t.intern("+"));
  });

  it("intern('+') !== intern('*') (selectores distintos, identidades distintas)", () => {
    const t = new SymbolTable();
    expect(t.intern("+")).not.toBe(t.intern("*"));
  });

  it("intern('show:') estable e identidad distinta de '+' y '*'", () => {
    const t = new SymbolTable();
    const show = t.intern("show:");
    expect(t.intern("show:")).toBe(show);
    expect(show).not.toBe(t.intern("+"));
    expect(show).not.toBe(t.intern("*"));
  });
});
