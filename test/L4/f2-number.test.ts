/**
 * L4 · F2 — núcleo de la torre numérica (GATE-F2-NUMBER, GATE-F2-ZERODIVIDE,
 * GATE-L4-IDENTITY/PROVENANCE para Float/Character).
 * NUEVO en este slice (origin=ingeniería/dialecto, se flaggea para el log L6):
 *   - Representación: SmallInteger sigue NATIVO (number|bigint); Float y Character
 *     son STObjects BOXED ({class: Float|Character} + campo dedicado). classOf gana
 *     dos ramas (vía v.class). print.ts aprende Float (3.0 => '3.0', 3.14 => '3.14')
 *     y Character ($a => '$a').
 *   - Número/Magnitude: / abs negated max: min: between:and: (las comparaciones y
 *     + - * pre-existen de L3). División /: exacta => Integer; no-exacta => Float
 *     (Fraction DIFERIDA, desviación). Divisor 0 => SEÑALA ZeroDivide (máquina L5).
 *   - Promoción a BigInt al cruzar ±(2^53-1) con resultado EXACTO.
 *   - Coerción mixta Int<->Float: la presencia de un Float promueve la operación a Float.
 *
 * @section L4.f2-number
 * @kind    positive
 * @layer   L4
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";
import { NUMERICS_PROVENANCE } from "../../src/eval/kernel-numerics.js";
import { compiledMethodOf } from "../../src/eval/method.js";
import type { STClass } from "../../src/runtime/index.js";
import { lookupMethod } from "../../src/runtime/index.js";

describe("L4 · F2 · literales y representación boxed (Float/Character)", () => {
  it("literal float evalúa a un Float boxed; printString distingue 3.0 de 3", () => {
    expect(printString(evalSt("3.0"))).toBe("3.0");
    expect(printString(evalSt("3.14"))).toBe("3.14");
    // un SmallInteger nativo sigue imprimiendo sin punto.
    expect(printString(evalSt("3"))).toBe("3");
  });

  it("literal character evalúa a un Character boxed; printString => $a", () => {
    expect(printString(evalSt("$a"))).toBe("$a");
    expect(printString(evalSt("$Z"))).toBe("$Z");
  });

  it("class de un Float es Float; class de un Character es Character; 3 sigue SmallInteger", () => {
    expect(printString(evalSt("3.0 class name"))).toBe("Float");
    expect(printString(evalSt("$a class name"))).toBe("Character");
    expect(printString(evalSt("3 class name"))).toBe("SmallInteger");
  });
});

describe("L4 · F2 · GATE-F2-NUMBER · aritmética y comparación (13 selectores)", () => {
  it("positivos aritméticos: + - * sobre enteros (pre-existentes, siguen verdes)", () => {
    expect(printString(evalSt("3 + 4"))).toBe("7"); // 1
    expect(printString(evalSt("10 - 7"))).toBe("3"); // 2
    expect(printString(evalSt("6 * 7"))).toBe("42"); // 3
  });

  it("positivos comparación: < <= > >= = (pre-existentes)", () => {
    expect(printString(evalSt("3 < 4"))).toBe("true"); // 4
    expect(printString(evalSt("4 <= 4"))).toBe("true"); // 5
    expect(printString(evalSt("5 > 4"))).toBe("true"); // 6
    expect(printString(evalSt("4 >= 5"))).toBe("false"); // 7
    expect(printString(evalSt("4 = 4"))).toBe("true"); // 8
  });

  it("positivo / exacto => Integer (8 / 2 => 4)", () => {
    expect(printString(evalSt("8 / 2"))).toBe("4"); // 9
  });

  it("positivo / no-exacto => Float (7 / 2 => 3.5; Fraction diferida)", () => {
    expect(printString(evalSt("7 / 2"))).toBe("3.5"); // 10
  });

  it("positivo abs y negated", () => {
    expect(printString(evalSt("5 negated"))).toBe("-5"); // 11
    expect(printString(evalSt("-5 abs"))).toBe("5"); // 12
    expect(printString(evalSt("5 abs"))).toBe("5");
  });

  it("positivo max: / min: (derivados en Magnitude vía < y =)", () => {
    expect(printString(evalSt("3 max: 7"))).toBe("7"); // 13
    expect(printString(evalSt("3 min: 7"))).toBe("3"); // 14
    expect(printString(evalSt("7 max: 3"))).toBe("7");
    expect(printString(evalSt("7 min: 3"))).toBe("3");
  });

  it("positivo between:and: (derivado en Magnitude)", () => {
    expect(printString(evalSt("5 between: 1 and: 10"))).toBe("true"); // 15
    expect(printString(evalSt("15 between: 1 and: 10"))).toBe("false");
  });
});

describe("L4 · F2 · GATE-F2-NUMBER · promoción a BigInt EXACTA al cruzar 2^53-1", () => {
  it("(2^53-1) + 1 da el sucesor EXACTO vía bigint (no pierde precisión)", () => {
    // 9007199254740991 + 1 = 9007199254740992 exacto (bigint).
    expect(printString(evalSt("9007199254740991 + 1"))).toBe("9007199254740992");
    // y un paso más cruzando holgadamente el límite.
    expect(printString(evalSt("9007199254740991 + 10"))).toBe("9007199254741001");
  });

  it("multiplicación grande exacta promueve a bigint", () => {
    expect(printString(evalSt("9007199254740991 * 2"))).toBe("18014398509481982");
  });
});

describe("L4 · F2 · coerción mixta Int<->Float", () => {
  it("3 + 2.5 => Float 5.5 (la presencia de un Float promueve a Float)", () => {
    expect(printString(evalSt("3 + 2.5"))).toBe("5.5");
    expect(printString(evalSt("2.5 + 3"))).toBe("5.5");
  });

  it("comparación mixta produce Boolean nativo", () => {
    expect(printString(evalSt("3 < 3.5"))).toBe("true");
    expect(printString(evalSt("3.5 < 3"))).toBe("false");
  });
});

describe("L4 · F2 · Character protocolo mínimo (asInteger / comparación)", () => {
  it("$a asInteger => 97 (code point)", () => {
    expect(printString(evalSt("$a asInteger"))).toBe("97");
    expect(printString(evalSt("$A asInteger"))).toBe("65");
  });

  it("$a < $b => true (comparación por code point, Magnitude)", () => {
    expect(printString(evalSt("$a < $b"))).toBe("true");
    expect(printString(evalSt("$b < $a"))).toBe("false");
  });

  it("Character vs Float NO coerce a NaN: $a (97) compara por code point contra el double", () => {
    // Regresión: un Float boxed es un STObject; Number(<STObject>) daba NaN y TODA
    // comparación contra NaN era false (un valor silenciosamente erróneo). Ahora se
    // deriva el double del campo dedicado del Float.
    expect(printString(evalSt("$a < 98.5"))).toBe("true"); // 97 < 98.5
    expect(printString(evalSt("$a > 96.5"))).toBe("true"); // 97 > 96.5
    expect(printString(evalSt("$a <= 97.0"))).toBe("true"); // 97 <= 97.0
    expect(printString(evalSt("$a >= 97.0"))).toBe("true"); // 97 >= 97.0 (Magnitude vía <)
    expect(printString(evalSt("$a < 96.5"))).toBe("false"); // 97 < 96.5
  });
});

describe("L4 · F2 · GATE-F2-ZERODIVIDE · Integer/0 y Float/0 señalan ZeroDivide", () => {
  it("3 / 0 señala ZeroDivide capturable por on: ZeroDivide do:", () => {
    const src = "[3 / 0] on: ZeroDivide do: [:e | 42]";
    expect(printString(evalSt(src))).toBe("42");
  });

  it("3.0 / 0 señala ZeroDivide (Float/0 NO devuelve Infinity)", () => {
    const src = "[3.0 / 0] on: ZeroDivide do: [:e | 99]";
    expect(printString(evalSt(src))).toBe("99");
  });

  it("ZeroDivide es capturable también por su SUPERTIPO ArithmeticError", () => {
    const src = "[3 / 0] on: ArithmeticError do: [:e | 7]";
    expect(printString(evalSt(src))).toBe("7");
  });

  it("sin handler, Integer/0 propaga (NO devuelve un número)", () => {
    expect(() => evalSt("3 / 0")).toThrow();
  });
});

describe("L4 · F2 · GATE-L4-IDENTITY · Character/Float", () => {
  it("$a == $a => true (Character == por code point, valor)", () => {
    expect(printString(evalSt("$a == $a"))).toBe("true");
    expect(printString(evalSt("$a == $b"))).toBe("false");
  });

  it("$a = $a => true (igualdad por valor)", () => {
    expect(printString(evalSt("$a = $a"))).toBe("true");
  });

  it("dos literales Float con igual valor son = por valor", () => {
    expect(printString(evalSt("3.0 = 3.0"))).toBe("true");
    expect(printString(evalSt("3.0 = 3.5"))).toBe("false");
  });

  it("identityHash de Character coincide con su code point (consistente con ==)", () => {
    // El identityHash de un Character ES su code point ($a => 97): consistente con
    // `==` por valor (dos $a comparten code point => comparten hash). Todo en un solo
    // universe vía evalSt (`$a identityHash` resuelve Object>>identityHash heredado).
    expect(printString(evalSt("$a identityHash"))).toBe("97");
    expect(printString(evalSt("$A identityHash"))).toBe("65");
  });
});

describe("L4 · F2 · GATE-L4-PROVENANCE · tag de procedencia + log de desviaciones", () => {
  it("Magnitude/Number/Float/Character son clases vivas resolubles", () => {
    // NOTA: Magnitude/Number/Float/Character se construyen en TS (makeClass en
    // src/runtime/kernel.ts), NO se cargan desde un .st; lo que SÍ se carga como
    // cuerpo .st (vía defineMethod, con tag) son los métodos DERIVADOS de Magnitude.
    expect(printString(evalSt("Float name"))).toBe("Float");
    expect(printString(evalSt("Character name"))).toBe("Character");
    expect(printString(evalSt("Magnitude name"))).toBe("Magnitude");
    expect(printString(evalSt("Number name"))).toBe("Number");
  });

  it("los métodos derivados de Magnitude (max:/min:/between:and:) portan NUMERICS_PROVENANCE", () => {
    const { universe } = evalWith("nil");
    const magnitude = universe.namespace.get("Magnitude") as STClass;
    for (const selector of ["max:", "min:", "between:and:"]) {
      const prim = lookupMethod(magnitude, universe.symbols.intern(selector));
      expect(prim, `Magnitude>>${selector} debe estar instalado`).toBeDefined();
      const meta = compiledMethodOf(prim as NonNullable<typeof prim>);
      expect(meta?.provenanceTag, `tag de ${selector}`).toBe(NUMERICS_PROVENANCE);
    }
    // el tag declara su origen (spec-ANSI: las comparaciones derivan de < y =).
    expect(NUMERICS_PROVENANCE).toMatch(/origin=/);
  });

  it("el log de desviaciones registra cada desviación esperada de L4 (DEV-026..DEV-030)", () => {
    const logPath = fileURLToPath(
      new URL("../../doc/research/log-de-desviaciones.md", import.meta.url),
    );
    const log = readFileSync(logPath, "utf8");
    // (a) F1-ext &/|/xor:/ifNil:, (b) Integer>>/ no-exacta => Float, (c) Float/Character
    // boxed, (d) Float único (e/d/q colapsan), (e) bigint+Float lossy.
    for (const dev of ["DEV-026", "DEV-027", "DEV-028", "DEV-029", "DEV-030"]) {
      expect(log, `${dev} debe existir en el log`).toContain(`| ${dev} |`);
    }
  });
});
