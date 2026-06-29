/**
 * L1 · astToJSON — serialización canónica (R12): orden de claves fijo,
 * bigint -> {$bigint}, origin solo si ext, omisión de claves ausentes.
 *
 * @section L1.astToJSON
 * @kind    positive
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import type {
  LiteralNode,
  MessageSendNode,
  SourceSpan,
  VariableNode,
} from "../../src/ast/index.js";
import { astToJSON } from "../../src/ast/index.js";

// Span compartido (los valores concretos no importan para estos tests de forma).
const SP: SourceSpan = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
};
const SPAN_JSON = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
};

const intLit = (raw: string, value: number | bigint): LiteralNode => ({
  type: "Literal",
  lit: "integer",
  raw,
  value,
  span: SP,
});

describe("L1 · astToJSON", () => {
  it("serializa un integer con value number", () => {
    expect(astToJSON(intLit("42", 42))).toEqual({
      type: "Literal",
      lit: "integer",
      raw: "42",
      value: 42,
      span: SPAN_JSON,
    });
  });

  it("serializa un bigint como {$bigint}", () => {
    expect(astToJSON(intLit("9007199254740993", 9007199254740993n))).toEqual({
      type: "Literal",
      lit: "integer",
      raw: "9007199254740993",
      value: { $bigint: "9007199254740993" },
      span: SPAN_JSON,
    });
  });

  it("emite origin solo en nodos ext:pharo-squeak", () => {
    const byteArray: LiteralNode = {
      type: "Literal",
      lit: "byteArray",
      raw: "#[1]",
      origin: "ext:pharo-squeak",
      elements: [intLit("1", 1)],
      span: SP,
    };
    const out = astToJSON(byteArray) as Record<string, unknown>;
    expect(out.origin).toBe("ext:pharo-squeak");
    expect(out.elements).toHaveLength(1);
  });

  it("OMITE origin en nodos ANSI", () => {
    const ansiArray: LiteralNode = {
      type: "Literal",
      lit: "array",
      raw: "#(1)",
      origin: "ansi",
      elements: [intLit("1", 1)],
      span: SP,
    };
    expect(Object.keys(astToJSON(ansiArray) as object)).not.toContain("origin");
  });

  it("emite value:null para el literal nil (no lo omite)", () => {
    const nilLit: LiteralNode = { type: "Literal", lit: "nil", raw: "nil", value: null, span: SP };
    const out = astToJSON(nilLit) as Record<string, unknown>;
    expect("value" in out).toBe(true);
    expect(out.value).toBeNull();
  });

  it("fija el orden canónico de claves (type primero, span último)", () => {
    const recv: VariableNode = { type: "Variable", name: "a", span: SP };
    const ms: MessageSendNode = {
      type: "MessageSend",
      kind: "binary",
      receiver: recv,
      selector: "+",
      args: [intLit("4", 4)],
      span: SP,
    };
    expect(Object.keys(astToJSON(ms) as object)).toEqual([
      "type",
      "kind",
      "receiver",
      "selector",
      "args",
      "span",
    ]);
    // Literal: type, lit, raw, value, span (sin floatKind/scale/origin/elements ausentes).
    expect(Object.keys(astToJSON(intLit("4", 4)) as object)).toEqual([
      "type",
      "lit",
      "raw",
      "value",
      "span",
    ]);
  });

  it("serializa un float no finito (overflow) como {$float} (DEV-017)", () => {
    const floatLit = (raw: string, value: number): LiteralNode => ({
      type: "Literal",
      lit: "float",
      raw,
      value,
      span: SP,
    });
    const litValue = (n: LiteralNode): unknown => (astToJSON(n) as Record<string, unknown>).value;
    expect(litValue(floatLit("1e400", Number.POSITIVE_INFINITY))).toEqual({ $float: "Infinity" });
    expect(litValue(floatLit("-1e400", Number.NEGATIVE_INFINITY))).toEqual({ $float: "-Infinity" });
    expect(litValue(floatLit("nan", Number.NaN))).toEqual({ $float: "NaN" });
    // un float finito normal pasa tal cual (no se envuelve).
    expect(litValue(floatLit("1.5", 1.5))).toBe(1.5);
  });
});
