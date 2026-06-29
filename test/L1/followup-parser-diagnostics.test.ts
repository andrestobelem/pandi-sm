/**
 * Follow-up del audit · diagnósticos de parser objetivos (RED → GREEN).
 * El finding de "CascadeNode con 1 mensaje" se DESCARTÓ: choca con la
 * recuperación deliberada y testeada en parser-error-recovery.test.ts.
 *
 * @section L1.followup-parser-diagnostics
 * @kind    negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import type { ParseError } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

const codes = (s: string): string[] => parse(s).errors.map((e) => (e as ParseError).code);
const count = (s: string, code: string): number => codes(s).filter((c) => c === code).length;

// parser.ts:115 — `:=` no asignable dentro de un bloque ya no dispara un
// E_UNCLOSED_BLOCK espurio (el `]` está presente). Antes: 3 errores.
describe("followup · `:=` no asignable en bloque no produce E_UNCLOSED_BLOCK espurio", () => {
  it("`[a foo := 1]` emite exactamente un E_UNEXPECTED_TOKEN y NINGÚN E_UNCLOSED_BLOCK", () => {
    expect(count("[a foo := 1]", "E_UNEXPECTED_TOKEN")).toBe(1);
    expect(codes("[a foo := 1]")).not.toContain("E_UNCLOSED_BLOCK");
  });
});

// parser.ts:452 — la param-list de bloque exige `|` terminador y nombre tras `:`.
describe("followup · param-list de bloque malformada emite diagnóstico (DEV-015/R3)", () => {
  it("`[:a :b expr]` (falta `|` tras params) emite E_UNEXPECTED_TOKEN", () => {
    expect(codes("[:a :b expr]")).toContain("E_UNEXPECTED_TOKEN");
  });

  it("`[:3]` (`:` sin identificador) emite E_UNEXPECTED_TOKEN", () => {
    expect(codes("[:3]")).toContain("E_UNEXPECTED_TOKEN");
  });

  it("`[:a :b | a]` (bien formado) sigue sin errores", () => {
    expect(codes("[:a :b | a]")).toEqual([]);
  });
});

// parser.ts:135 — R13 dentro de un bloque: tras `^expr.` con más tokens antes del
// `]`, el `break` dejaba el `]` (y los tokens intermedios) sin consumir, que el
// outer message-parsing absorbía como envíos, produciendo 3 errores y un AST
// corrupto (MessageSend en vez de Block). Drenar hasta el cierre => 1 error y Block.
describe("followup · R13 dentro de bloque drena hasta `]` (no corrompe el AST)", () => {
  it("`[:x | ^x. x + 1]` emite exactamente un E_UNEXPECTED_TOKEN y ningún E_UNCLOSED_BLOCK", () => {
    expect(count("[:x | ^x. x + 1]", "E_UNEXPECTED_TOKEN")).toBe(1);
    expect(codes("[:x | ^x. x + 1]")).not.toContain("E_UNCLOSED_BLOCK");
  });

  it("el statement top-level del bloque sigue siendo un Block (no MessageSend)", () => {
    const ast = parse("[:x | ^x. x + 1]").ast;
    expect(ast?.body.statements[0]?.type).toBe("Block");
  });

  it("R13 top-level `^3. 4` sigue emitiendo un solo E_UNEXPECTED_TOKEN en offset 4", () => {
    const errs = parse("^3. 4").errors.filter(
      (e) => (e as ParseError).code === "E_UNEXPECTED_TOKEN",
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]?.span.start.offset).toBe(4);
  });
});

// parser.ts:723 — el span de E_NESTING_LIMIT apunta al SITIO de la anidación,
// no siempre a la línea 1 columna 1.
describe("followup · span de E_NESTING_LIMIT apunta al sitio de anidación", () => {
  it("anidación profunda reporta un offset > 0 (no tokens[0])", () => {
    const deep = "(".repeat(2000) + "1" + ")".repeat(2000);
    const err = parse(deep).errors.find((e) => (e as ParseError).code === "E_NESTING_LIMIT") as
      | ParseError
      | undefined;
    expect(err).toBeDefined();
    expect(err?.span.start.offset).toBeGreaterThan(0);
  });
});
