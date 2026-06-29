/**
 * L1 · Lexer slice 1 — trivia, puntuación/operadores, identifier/keyword/`:=`/`:`,
 * decimalInteger (+ BigInt), binarySelector/`|`, spans. TDD: este test guía el slice.
 *
 * @section L1.lexer.slice1
 * @kind    positive
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import type { Token } from "../../src/lexer/index.js";
import { tokenize } from "../../src/lexer/index.js";

const types = (src: string): string[] => tokenize(src).tokens.map((t) => t.type);
const lexemes = (src: string): string[] => tokenize(src).tokens.map((t) => t.lexeme);
const first = (src: string): Token => {
  const t = tokenize(src).tokens[0];
  if (t === undefined) throw new Error("sin tokens");
  return t;
};

describe("L1 · lexer slice 1", () => {
  it("tokeniza `3 + 4 * 2` con precedencia plana (sin agrupar: eso es del parser)", () => {
    expect(types("3 + 4 * 2")).toEqual([
      "number",
      "binarySelector",
      "number",
      "binarySelector",
      "number",
      "eof",
    ]);
    expect(lexemes("3 + 4 * 2")).toEqual(["3", "+", "4", "*", "2", ""]);
  });

  it("promueve a BigInt por encima de 2^53-1; number nativo por debajo", () => {
    expect(first("3").value).toBe(3);
    expect(typeof first("3").value).toBe("number");
    expect(first("9007199254740991").value).toBe(9007199254740991); // MAX_SAFE
    expect(first("9007199254740993").value).toBe(9007199254740993n); // bigint
    expect(typeof first("9007199254740993").value).toBe("bigint");
    expect(first("42").numKind).toBe("integer");
  });

  it("rastrea spans medio-abiertos por offset/line/column", () => {
    const { tokens } = tokenize("3 + 4");
    expect(tokens[0]?.span).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 1, line: 1, column: 2 },
    });
    expect(tokens[1]?.span.start).toEqual({ offset: 2, line: 1, column: 3 }); // '+'
    expect(tokens[2]?.span.start).toEqual({ offset: 4, line: 1, column: 5 }); // '4'
  });

  it("distingue identifier, keyword y `:=` / `:` (R3)", () => {
    expect(types("foo")).toEqual(["identifier", "eof"]);
    expect(types("at:")).toEqual(["keyword", "eof"]);
    expect(types("foo:bar")).toEqual(["keyword", "identifier", "eof"]);
    expect(lexemes("foo:bar")).toEqual(["foo:", "bar", ""]);
    expect(types("x := 1")).toEqual(["identifier", "assignmentOperator", "number", "eof"]);
    expect(types("x:=1")).toEqual(["identifier", "assignmentOperator", "number", "eof"]);
    expect(types(":")).toEqual(["colon", "eof"]); // `:` aislado
    expect(types("[:x")).toEqual(["lbracket", "colon", "identifier", "eof"]); // block arg
  });

  it("acepta `_` en identifiers (DEV-014)", () => {
    expect(types("_foo bar_baz")).toEqual(["identifier", "identifier", "eof"]);
  });

  it("trata `|` aislado como verticalBar y runs largos como binarySelector", () => {
    expect(first("|").type).toBe("verticalBar");
    expect(first("||").type).toBe("binarySelector");
    expect(first("<=").type).toBe("binarySelector");
    expect(lexemes("a||b")).toEqual(["a", "||", "b", ""]);
  });

  it("emite returnOperator y todos los delimitadores con su origin", () => {
    expect(first("^").type).toBe("returnOperator");
    expect(types("()[].;")).toEqual([
      "lparen",
      "rparen",
      "lbracket",
      "rbracket",
      "period",
      "semicolon",
      "eof",
    ]);
    expect(first("{").type).toBe("dynArrayOpen");
    expect(first("{").origin).toBe("ext:pharo-squeak");
    expect(first("}").origin).toBe("ext:pharo-squeak");
  });

  it('descarta comentarios `"..."` (con escape `""`)', () => {
    expect(types('3 "un comentario" + 4')).toEqual(["number", "binarySelector", "number", "eof"]);
    expect(types('1 "con "" comilla" 2')).toEqual(["number", "number", "eof"]);
  });

  it("reporta errores deterministas (no excepciones)", () => {
    const unterminated = tokenize('"abc');
    expect(unterminated.errors.map((e) => e.code)).toEqual(["E_UNTERMINATED_COMMENT"]);
    const badChar = tokenize("`");
    expect(badChar.errors.map((e) => e.code)).toEqual(["E_UNEXPECTED_CHAR"]);
    // repetible: mismo code + span
    expect(tokenize("`").errors).toEqual(badChar.errors);
  });
});
