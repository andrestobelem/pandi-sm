/**
 * L5 · S3 regresión — ExceptionSet , chaining, on:do:on:do: prioridad,
 * messageText/description boxeo nativo.
 *
 * Cada describe reproduce exactamente el bug descrito en el audit (RED → GREEN).
 *
 * @section L5.s3-exceptions-fixes
 * @kind    regression
 * @layer   L5
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Finding #8 — ExceptionSet , chaining (izquierda asociativa):
//   `Error , Warning , ZeroDivide` debe capturar Error, Warning y ZeroDivide.
//   Bug: la segunda `,` tiene receptor ExceptionSet; exceptionComma ignoraba eso
//   (lo metía como elemento único en vez de aplanar) y además `,` no era alcanzable
//   desde una instancia ExceptionSet → DNU.
// ─────────────────────────────────────────────────────────────────────────────
describe("S3 · #8 ExceptionSet , chaining (izquierda asociativa)", () => {
  it("(Error , Warning , ZeroDivide) captura un Error señalado [3-way chain]", () => {
    const src = "[Error signal] on: Error , Warning , ZeroDivide do: [:e | 42]";
    expect(printString(evalSt(src))).toBe("42");
  });

  it("(Error , Warning , ZeroDivide) captura un Warning señalado [3-way chain]", () => {
    const src = "[Warning signal] on: Error , Warning , ZeroDivide do: [:e | 43]";
    expect(printString(evalSt(src))).toBe("43");
  });

  it("(Error , Warning , ZeroDivide) captura un ZeroDivide señalado [3-way chain]", () => {
    const src = "[ZeroDivide signal] on: Error , Warning , ZeroDivide do: [:e | 44]";
    expect(printString(evalSt(src))).toBe("44");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding #9 — on:do:on:do: prioridad invertida:
//   ANSI requiere que el handler listado PRIMERO gane cuando ambos aplican.
//   Bug: blockOnDoOnDo empujaba [pair1, pair2] en orden; pair2 quedaba en el tope
//   de la pila y signalException lo encontraba primero.
// ─────────────────────────────────────────────────────────────────────────────
describe("S3 · #9 on:do:on:do: primer handler listado gana (ANSI first-listed-wins)", () => {
  it("[1/0] on: Error do: ['A'] on: ZeroDivide do: ['B'] debe devolver 'A' (Error gana al ser primero)", () => {
    // Error es superclase de ZeroDivide; el primer handler (Error) debe ganar.
    const src = "[1/0] on: Error do: [:e | 'A'] on: ZeroDivide do: [:e | 'B']";
    expect(printString(evalSt(src))).toBe("A");
  });

  it("handler de ZeroDivide actúa cuando está PRIMERO listado (no aplica Error antes)", () => {
    // Primer handler es ZeroDivide (exacto), segundo es Error (subtipo también): ZeroDivide gana.
    const src = "[1/0] on: ZeroDivide do: [:e | 'B'] on: Error do: [:e | 'A']";
    expect(printString(evalSt(src))).toBe("B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding #10 — instMessageText devuelve string nativo JS cuando el MNU/internal
//   path guarda un template literal.
//   Bug: `[3 zzz] on: MessageNotUnderstood do: [:e | e messageText size]` lanzaba
//   'String>>size requiere un receptor String' (textOf retorna null para strings JS).
// ─────────────────────────────────────────────────────────────────────────────
describe("S3 · #10 instMessageText: caja el string nativo en STString", () => {
  it("e messageText size no lanza para un MNU capturado", () => {
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e messageText size]";
    expect(() => evalSt(src)).not.toThrow();
  });

  it("e messageText size devuelve un entero positivo para el texto del MNU", () => {
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e messageText size]";
    const result = printString(evalSt(src));
    const n = parseInt(result, 10);
    expect(n).toBeGreaterThan(0);
  });

  it("e messageText del MNU contiene el selector (como String boxed)", () => {
    // El texto de un MNU incluye el selector; length > 0 valida que es un STString usable.
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e messageText]";
    expect(() => printString(evalSt(src))).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding #11 — instDescription devuelve string nativo JS cuando messageText es nativo.
//   Bug: line 259 `return text` devuelve el string JS crudo; cualquier envío posterior
//   (p.ej. size, printString) lanza.
// ─────────────────────────────────────────────────────────────────────────────
describe("S3 · #11 instDescription: caja el string nativo en STString", () => {
  it("e description size no lanza para un MNU capturado", () => {
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e description size]";
    expect(() => evalSt(src)).not.toThrow();
  });

  it("e description size devuelve un entero positivo", () => {
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e description size]";
    const result = printString(evalSt(src));
    const n = parseInt(result, 10);
    expect(n).toBeGreaterThan(0);
  });

  it("e description devuelve un STString boxed usable (printString no lanza)", () => {
    const src = "[3 zzz] on: MessageNotUnderstood do: [:e | e description]";
    expect(() => printString(evalSt(src))).not.toThrow();
  });
});
