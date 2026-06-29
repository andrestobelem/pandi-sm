/**
 * L1 · Lexer slice 4 — símbolos y arrays literales: #( arrayOpen, #[ byteArrayOpen,
 * #'...' quoted symbol, #selector unary/keyword/binary (R6, R12), E_EMPTY_SYMBOL.
 * TDD: este test guía el slice.
 *
 * @section L1.lexer.slice4
 * @kind    positive|negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import type { Token } from "../../src/lexer/index.js";
import { tokenize } from "../../src/lexer/index.js";

const types = (src: string): string[] => tokenize(src).tokens.map((t) => t.type);
const first = (src: string): Token => {
  const t = tokenize(src).tokens[0];
  if (t === undefined) throw new Error("sin tokens");
  return t;
};
const errors = (src: string) => tokenize(src).errors.map((e) => e.code);

describe("L1 · lexer slice 4 — símbolos y arrays literales", () => {
  // ── arrayOpen (#() ──────────────────────────────────────────────────────────
  describe("arrayOpen #(", () => {
    it("#( emite arrayOpen SIN origin (ANSI core, R12)", () => {
      const tok = first("#(");
      expect(tok.type).toBe("arrayOpen");
      expect(tok.lexeme).toBe("#(");
      expect(tok.origin).toBeUndefined(); // ANSI: sin flag
    });

    it("#( → [arrayOpen, eof]", () => {
      expect(types("#(")).toEqual(["arrayOpen", "eof"]);
    });

    it("#(1 2) → [arrayOpen, number, number, rparen, eof]", () => {
      expect(types("#(1 2)")).toEqual(["arrayOpen", "number", "number", "rparen", "eof"]);
    });

    it("el ) después de #( es rparen ordinario", () => {
      const { tokens } = tokenize("#(1 2)");
      const rparen = tokens.find((t) => t.type === "rparen");
      expect(rparen).toBeDefined();
      expect(rparen?.lexeme).toBe(")");
    });
  });

  // ── byteArrayOpen (#[) ──────────────────────────────────────────────────────
  describe("byteArrayOpen #[", () => {
    it("#[ emite byteArrayOpen CON origin ext:pharo-squeak (R12)", () => {
      const tok = first("#[");
      expect(tok.type).toBe("byteArrayOpen");
      expect(tok.lexeme).toBe("#[");
      expect(tok.origin).toBe("ext:pharo-squeak");
    });

    it("#[1 2] → [byteArrayOpen, number, number, rbracket, eof]", () => {
      expect(types("#[1 2]")).toEqual(["byteArrayOpen", "number", "number", "rbracket", "eof"]);
    });

    it("el ] después de #[ es rbracket ordinario", () => {
      const { tokens } = tokenize("#[1 2]");
      const rb = tokens.find((t) => t.type === "rbracket");
      expect(rb).toBeDefined();
      expect(rb?.lexeme).toBe("]");
    });
  });

  // ── quoted symbol (#'...') ───────────────────────────────────────────────────
  describe("quoted symbol #'...'", () => {
    it("#'hello world' → type symbol, value 'hello world'", () => {
      const tok = first("#'hello world'");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("hello world");
      expect(tok.lexeme).toBe("#'hello world'");
    });

    it("escape '' en quoted symbol → comilla literal en value", () => {
      const tok = first("#'a''b'");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("a'b");
    });

    it("quoted symbol vacío → type symbol, value ''", () => {
      const tok = first("#''");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("");
    });
  });

  // ── selector symbol unary ────────────────────────────────────────────────────
  describe("selector symbol unario", () => {
    it("#foo → type symbol, value 'foo'", () => {
      const tok = first("#foo");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("foo");
      expect(tok.lexeme).toBe("#foo");
    });

    it("#_bar → type symbol, value '_bar' (underscore válido, DEV-014)", () => {
      const tok = first("#_bar");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("_bar");
    });
  });

  // ── keyword symbol maximal (R6) ───────────────────────────────────────────────
  describe("keyword symbol maximal R6", () => {
    it("#at:put: → value 'at:put:'", () => {
      const tok = first("#at:put:");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("at:put:");
    });

    it("#foo: → value 'foo:'", () => {
      const tok = first("#foo:");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("foo:");
    });

    it("#at:put:at: → value 'at:put:at:' (tres partes, maximal)", () => {
      const tok = first("#at:put:at:");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("at:put:at:");
    });

    it("#foo:bar (sin : tras bar) → symbol 'foo:' + identifier 'bar'", () => {
      // '#foo:' es el símbolo; 'bar' es identifier separado
      const { tokens } = tokenize("#foo:bar");
      const sym = tokens[0];
      const ident = tokens[1];
      expect(sym?.type).toBe("symbol");
      expect(sym?.value).toBe("foo:");
      expect(ident?.type).toBe("identifier");
      expect(ident?.lexeme).toBe("bar");
    });
  });

  // ── binary selector symbol ────────────────────────────────────────────────────
  describe("binary selector symbol", () => {
    it("#+ → symbol value '+'", () => {
      const tok = first("#+");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("+");
      expect(tok.lexeme).toBe("#+");
    });

    it("#<= → symbol value '<='", () => {
      const tok = first("#<=");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("<=");
    });

    it("#-- → symbol value '--'", () => {
      const tok = first("#--");
      expect(tok.type).toBe("symbol");
      expect(tok.value).toBe("--");
    });
  });

  // ── E_EMPTY_SYMBOL ────────────────────────────────────────────────────────────
  describe("E_EMPTY_SYMBOL", () => {
    it("# al final de input → E_EMPTY_SYMBOL", () => {
      expect(errors("#")).toEqual(["E_EMPTY_SYMBOL"]);
    });

    it("# seguido de espacio → E_EMPTY_SYMBOL", () => {
      expect(errors("# ")).toEqual(["E_EMPTY_SYMBOL"]);
    });

    it("# seguido de ) (no es símbolo) → E_EMPTY_SYMBOL", () => {
      expect(errors("#)")).toEqual(["E_EMPTY_SYMBOL"]);
    });

    it("E_EMPTY_SYMBOL es determinista (mismo code+span en dos llamadas)", () => {
      const r1 = tokenize("#");
      const r2 = tokenize("#");
      expect(r1.errors).toEqual(r2.errors);
    });
  });

  // ── R5: nil/true/false en array — responsabilidad del parser ──────────────────
  describe("R5 — nil/true/false no reificados por el lexer", () => {
    it("#(nil true false) → lexer emite identifiers (R5 es concern del parser/L2)", () => {
      expect(types("#(nil true false)")).toEqual([
        "arrayOpen",
        "identifier",
        "identifier",
        "identifier",
        "rparen",
        "eof",
      ]);
    });
  });

  // ── integración con negativos (arrayOpen pone en posición operando, R2) ──────
  describe("arrayOpen y posición de operando para primer elemento", () => {
    it("#(-4) → [arrayOpen, number -4, rparen, eof] (primer elem en posición operando)", () => {
      const { tokens } = tokenize("#(-4)");
      expect(tokens.map((t) => t.type)).toEqual(["arrayOpen", "number", "rparen", "eof"]);
      expect(tokens[1]?.value).toBe(-4);
    });

    it("#[-4] → [byteArrayOpen, binarySelector, number, rbracket, eof] (DEV-016)", () => {
      // Asimetría deliberada con #(: byteArrayOpen NO abre posición de operando
      // (bytes sin signo [0,255]); el `-` tras #[ es binario, no signo de literal.
      const { tokens } = tokenize("#[-4]");
      expect(tokens.map((t) => t.type)).toEqual([
        "byteArrayOpen",
        "binarySelector",
        "number",
        "rbracket",
        "eof",
      ]);
      expect(tokens[1]?.lexeme).toBe("-");
      expect(tokens[2]?.value).toBe(4);
    });
  });
});
