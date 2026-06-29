/**
 * L4 · F4 · S3 — SequenceableCollection abstract + Interval concreto (plan §5.4 F4,
 * GATE-F4-SEQUENCEABLE). Construye sobre S1 (Array boxed, at:/at:put:/size 1-based,
 * Error capturable) y S2 (Collection abstract: do:/collect:/select:/…).
 *
 * SequenceableCollection (.st) deriva first/last (S1) + , (concat) + copyFrom:to:
 * PURAMENTE de at:/size + un acumulador growable (el acceso por nombre de ivar en
 * cuerpos .st no está cableado). Interval es la colección computada (campos dedicados
 * from/to/by, sin `elements`): do:/at:/size se calculan. (1 to: 5) -> Interval;
 * (1 to: 10 by: 2) -> Interval. Interval collect: -> Array (species, origin=dialecto).
 *
 * GATE-F4-SEQUENCEABLE: at: at:put: first last , copyFrom:to: (6 selectores) 1-based,
 * >=8 positivos + >=2 negativos (at: 0 y at: size+1 => Error capturable por on:do:).
 *
 * REGRESIÓN crítica: SmallInteger>>to:/to:by: devuelven un Interval AHORA, pero el
 * special-form de bucle (1 to: 5 do: [:i | …]) con bloque literal NO debe romperse
 * (se reconoce ANTES del envío dinámico en eval.ts).
 *
 * @section L4.f4-sequenceable-interval
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F4 · S3 · Interval construcción (to: / to:by:)", () => {
  it("(1 to: 5) es un Interval", () => {
    expect(printString(evalSt("(1 to: 5) class == Interval"))).toBe("true");
  });

  it("(1 to: 5) size es 5", () => {
    expect(printString(evalSt("(1 to: 5) size"))).toBe("5");
  });

  it("(1 to: 10 by: 2) size es 5 (1 3 5 7 9)", () => {
    expect(printString(evalSt("(1 to: 10 by: 2) size"))).toBe("5");
  });

  it("(2 to: 1) es un Interval vacío (size 0)", () => {
    expect(printString(evalSt("(2 to: 1) size"))).toBe("0");
  });

  it("Interval es kindOf SequenceableCollection y Collection", () => {
    expect(printString(evalSt("(1 to: 3) isKindOf: SequenceableCollection"))).toBe("true");
    expect(printString(evalSt("(1 to: 3) isKindOf: Collection"))).toBe("true");
  });
});

describe("L4 · F4 · S3 · Interval at:/do: (computados, 1-based)", () => {
  it("at: es 1-based y computa el valor (1 to: 5) at: 1 => 1", () => {
    expect(printString(evalSt("(1 to: 5) at: 1"))).toBe("1");
  });

  it("at: en un Interval con paso: (1 to: 10 by: 2) at: 3 => 5", () => {
    expect(printString(evalSt("(1 to: 10 by: 2) at: 3"))).toBe("5");
  });

  it("do: itera los elementos del Interval (suma)", () => {
    const src = `
      | sum |
      sum := 0.
      (1 to: 5) do: [:e | sum := sum + e].
      sum`;
    expect(printString(evalSt(src))).toBe("15");
  });

  it("do: respeta el paso (1 to: 10 by: 2) suma 1+3+5+7+9 = 25", () => {
    const src = `
      | sum |
      sum := 0.
      (1 to: 10 by: 2) do: [:e | sum := sum + e].
      sum`;
    expect(printString(evalSt(src))).toBe("25");
  });
});

describe("L4 · F4 · S3 · Interval collect: -> Array (species, GATE F4)", () => {
  it("Interval collect: produce un Array (species, origin=dialecto)", () => {
    expect(printString(evalSt("((1 to: 3) collect: [:e | e * 10]) class == Array"))).toBe("true");
  });

  it("Interval collect: aplica el bloque a cada elemento", () => {
    expect(printString(evalSt("(1 to: 3) collect: [:e | e * 10]"))).toBe("#(10 20 30)");
  });

  it("Interval hereda inject:into: de Collection (suma)", () => {
    expect(printString(evalSt("(1 to: 4) inject: 0 into: [:acc :e | acc + e]"))).toBe("10");
  });
});

describe("L4 · F4 · S3 · SequenceableCollection first/last sobre Interval", () => {
  it("first es at: 1", () => {
    expect(printString(evalSt("(3 to: 7) first"))).toBe("3");
  });

  it("last es at: self size", () => {
    expect(printString(evalSt("(3 to: 7) last"))).toBe("7");
  });
});

describe("L4 · F4 · S3 · , (concat) sobre SequenceableCollection (GATE F4)", () => {
  it(", concatena dos Arrays en un Array fresco", () => {
    expect(printString(evalSt("#(1 2) , #(3 4)"))).toBe("#(1 2 3 4)");
  });

  it(", de un Interval con un Array (species Array)", () => {
    expect(printString(evalSt("(1 to: 3) , #(4 5)"))).toBe("#(1 2 3 4 5)");
  });

  it(", produce un Array (species)", () => {
    expect(printString(evalSt("(#(1 2) , #(3 4)) class == Array"))).toBe("true");
  });
});

describe("L4 · F4 · S3 · copyFrom:to: sobre SequenceableCollection (GATE F4)", () => {
  it("copyFrom:to: extrae un sub-rango 1-based (inclusive)", () => {
    expect(printString(evalSt("#(10 20 30 40 50) copyFrom: 2 to: 4"))).toBe("#(20 30 40)");
  });

  it("copyFrom:to: con from > to produce un Array vacío", () => {
    expect(printString(evalSt("#(10 20 30) copyFrom: 2 to: 1"))).toBe("#()");
  });

  it("copyFrom:to: sobre un Interval (species Array)", () => {
    expect(printString(evalSt("(1 to: 5) copyFrom: 2 to: 4"))).toBe("#(2 3 4)");
  });
});

describe("L4 · F4 · S3 · GATE-F4-SEQUENCEABLE negativos (at: fuera de rango)", () => {
  it("Interval at: 0 señala un Error capturable por on:do:", () => {
    const src = `[ (1 to: 5) at: 0 ] on: Error do: [:e | #fuera ]`;
    expect(printString(evalSt(src))).toBe("#fuera");
  });

  it("Interval at: size+1 señala un Error capturable por on:do:", () => {
    const src = `[ (1 to: 5) at: 6 ] on: Error do: [:e | #fuera ]`;
    expect(printString(evalSt(src))).toBe("#fuera");
  });
});

describe("L4 · F4 · S3 · Interval mal formado FALLA RUIDOSO, nunca miscomputa en silencio", () => {
  // Ronda de reparación: un paso/extremo no soportado caía a Number()=>NaN (paso Float) o
  // colapsaba la precisión (extremo bigint > 2^53-1), dando un Interval silenciosamente
  // erróneo (size 0 / size 1) y, en el caso bigint, un bucle de impresión sin fin. El MVP
  // sólo soporta Intervals de enteros seguros; lo demás se DIFIERE señalando un Error
  // capturable por on:do:, NO se miscomputa.

  it("paso Float (1 to: 2 by: 0.5) señala un Error capturable (no Interval vacío silencioso)", () => {
    const src = `[ (1 to: 2 by: 0.5) size ] on: Error do: [:e | #pasoNoEntero ]`;
    expect(printString(evalSt(src))).toBe("#pasoNoEntero");
  });

  it("extremo Float (1 to: 2.5) señala un Error capturable", () => {
    const src = `[ (1 to: 2.5) size ] on: Error do: [:e | #finNoEntero ]`;
    expect(printString(evalSt(src))).toBe("#finNoEntero");
  });

  it("extremo bigint fuera del rango seguro señala un Error capturable (no colapsa la precisión)", () => {
    const src = `[ (1000000000000000000000 to: 1000000000000000000002) size ] on: Error do: [:e | #bigUnsafe ]`;
    expect(printString(evalSt(src))).toBe("#bigUnsafe");
  });

  it("printString de un Interval bigint mal formado NO cuelga: señala antes de imprimir", () => {
    const src = `[ (1000000000000000000000 to: 1000000000000000000002) printString ] on: Error do: [:e | #bigPrint ]`;
    expect(printString(evalSt(src))).toBe("#bigPrint");
  });

  it("un Interval con bigint dentro del rango seguro SÍ funciona (no es un rechazo ciego)", () => {
    // 10^15 cabe en 2^53-1 (~9.007e15): debe construir y computar correctamente.
    expect(printString(evalSt("(1000000000000000 to: 1000000000000002) size"))).toBe("3");
    expect(printString(evalSt("(1000000000000000 to: 1000000000000002) last"))).toBe(
      "1000000000000002",
    );
  });
});

describe("L4 · F4 · S3 · REGRESIÓN: to:do: con bloque literal sigue iterando", () => {
  it("(1 to: 5 do: [:i | ...]) literal block sigue siendo special-form (suma 15)", () => {
    const src = `
      | sum |
      sum := 0.
      1 to: 5 do: [:i | sum := sum + i].
      sum`;
    expect(printString(evalSt(src))).toBe("15");
  });

  it("(1 to: 10 by: 2 do: [:i | ...]) literal block sigue iterando (suma 25)", () => {
    const src = `
      | sum |
      sum := 0.
      1 to: 10 by: 2 do: [:i | sum := sum + i].
      sum`;
    expect(printString(evalSt(src))).toBe("25");
  });
});
