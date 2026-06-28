/**
 * L1 · Lexer slice 3 — strings `'...'` (con escape `''`) y caracteres `$c`.
 * TDD: este test guía el slice. RED antes de implementar.
 *
 * @section L1.lexer.slice3
 * @kind    positive/negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/lexer/index.js";
import type { Token } from "../../src/lexer/index.js";

const types = (src: string): string[] => tokenize(src).tokens.map((t) => t.type);
const first = (src: string): Token => {
  const t = tokenize(src).tokens[0];
  if (t === undefined) throw new Error("sin tokens");
  return t;
};
const errors = (src: string) => tokenize(src).errors.map((e) => e.code);

// ─── Strings ──────────────────────────────────────────────────────────────────

describe("L1 · lexer slice 3 — string", () => {
  it("string simple: 'abc' → type string, value abc, lexeme con comillas", () => {
    const t = first("'abc'");
    expect(t.type).toBe("string");
    expect(t.value).toBe("abc");
    expect(t.lexeme).toBe("'abc'");
  });

  it("string vacío: '' → value vacío, lexeme ''", () => {
    const t = first("''");
    expect(t.type).toBe("string");
    expect(t.value).toBe("");
    expect(t.lexeme).toBe("''");
  });

  it("escape de comilla simple: 'a''b' → value a'b (una comilla)", () => {
    const t = first("'a''b'");
    expect(t.type).toBe("string");
    expect(t.value).toBe("a'b");
    expect(t.lexeme).toBe("'a''b'");
  });

  it("múltiples escapes: 'it''s a ''test''' → value it's a 'test'", () => {
    const t = first("'it''s a ''test'''");
    expect(t.type).toBe("string");
    expect(t.value).toBe("it's a 'test'");
  });

  it("sin cerrar: 'abc → E_UNTERMINATED_STRING (sin excepción)", () => {
    expect(errors("'abc")).toEqual(["E_UNTERMINATED_STRING"]);
  });

  it("sin cerrar es determinista: mismo error dos veces", () => {
    const r1 = tokenize("'abc");
    const r2 = tokenize("'abc");
    expect(r1.errors).toEqual(r2.errors);
  });

  it("string en contexto: 1 'x' 2 → [number, string, number, eof]", () => {
    expect(types("1 'x' 2")).toEqual(["number", "string", "number", "eof"]);
  });

  it("string con salto de línea interno → tokenizado correctamente", () => {
    const t = first("'hello\nworld'");
    expect(t.type).toBe("string");
    expect(t.value).toBe("hello\nworld");
  });
});

// ─── Caracteres ───────────────────────────────────────────────────────────────

describe("L1 · lexer slice 3 — character", () => {
  it("$a → type character, value 'a', lexeme '$a'", () => {
    const t = first("$a");
    expect(t.type).toBe("character");
    expect(t.value).toBe("a");
    expect(t.lexeme).toBe("$a");
  });

  it("$$ → value '$'", () => {
    const t = first("$$");
    expect(t.type).toBe("character");
    expect(t.value).toBe("$");
  });

  it("'$ ' (dólar-espacio) → value ' ' (espacio válido)", () => {
    const t = first("$ ");
    expect(t.type).toBe("character");
    expect(t.value).toBe(" ");
  });

  it("$A → value 'A' (mayúscula)", () => {
    const t = first("$A");
    expect(t.type).toBe("character");
    expect(t.value).toBe("A");
  });

  it("carácter astral $🎉 → value contiene el code point completo (decisions-modelo (a))", () => {
    const emoji = "🎉"; // U+1F389, surrogate pair en UTF-16
    const t = first(`$${emoji}`);
    expect(t.type).toBe("character");
    expect(t.value).toBe(emoji);
    // lexema incluye el dólar y los dos code units del emoji
    expect(t.lexeme).toBe(`$${emoji}`);
  });

  it("$ al final de input → E_UNTERMINATED_CHAR (sin excepción)", () => {
    expect(errors("$")).toEqual(["E_UNTERMINATED_CHAR"]);
  });

  it("E_UNTERMINATED_CHAR es determinista: mismo error dos veces", () => {
    const r1 = tokenize("$");
    const r2 = tokenize("$");
    expect(r1.errors).toEqual(r2.errors);
  });

  it("$a en contexto: 1 $x 2 → [number, character, number, eof]", () => {
    expect(types("1 $x 2")).toEqual(["number", "character", "number", "eof"]);
  });
});
