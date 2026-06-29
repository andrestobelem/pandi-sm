/**
 * Follow-up del audit loop-until-dry · dos bug-minors objetivos confirmados por
 * reproducción (RED → GREEN). Los demás minors quedaron triajeados como
 * subjetivos / falsos positivos (ver doc/research).
 *
 * @section L5.followup-minors
 * @kind    regression
 * @layer   L5
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

const run = (code: string): string => printString(evalSt(code));

// ─────────────────────────────────────────────────────────────────────────────
// object.ts:568 / primitives instVarAt: — índice NO-entero (1.5, NaN).
//   Bug: con un receptor de instSize ≥ 2, `instVarAt: 1.5` pasaba el chequeo de
//   rango (1 ≤ 1.5 ≤ 2) y leía pointers[0.5] = undefined → crash de host
//   "Cannot read properties of undefined (reading 'class')" al imprimir.
//   Fix: validar Number.isInteger ⇒ Error capturable (como Array>>at:).
// ─────────────────────────────────────────────────────────────────────────────
describe("followup · instVarAt: índice no-entero señala Error capturable (no crash de host)", () => {
  const defPt =
    "Object subclass: #FU1 instanceVariableNames: 'x y' classVariableNames: '' package: 'T'.";

  it("instVarAt: 1.5 sobre objeto de 2 ivars es capturable por on:do:", () => {
    expect(run(`${defPt} [FU1 new instVarAt: 1.5] on: Error do: [:e | #caught]`)).toBe("#caught");
  });

  it("instVarAt:put: 1.5 también es capturable (no muta ni crashea)", () => {
    expect(run(`${defPt} [FU1 new instVarAt: 2.5 put: 99] on: Error do: [:e | #caught]`)).toBe(
      "#caught",
    );
  });

  it("instVarAt:put: 1 (entero válido) sigue funcionando y devuelve el valor escrito", () => {
    expect(run(`${defPt} FU1 new instVarAt: 1 put: 42`)).toBe("42");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exceptions.ts:88 isExceptionSet — falso positivo sobre STArray/STOrderedCollection.
//   Bug: isExceptionSet duck-typeaba sobre `.elements`, idéntico a STArray/OC, así
//   que un Array literal `{ZeroDivide}` era aceptado como handler-set y CAPTURABA.
//   Fix: discriminante propio `exceptionSet: true` en el set construido por `,`.
// ─────────────────────────────────────────────────────────────────────────────
describe("followup · isExceptionSet no confunde un Array con un ExceptionSet", () => {
  it("on: {ZeroDivide} do: NO captura (un Array no es un handler-set válido)", () => {
    // El Array no maneja la excepción ⇒ no la captura ⇒ el handler externo (Error) sí.
    expect(run("[[1/0] on: {ZeroDivide} do: [:e | #inner]] on: Error do: [:e | #outer]")).toBe(
      "#outer",
    );
  });

  it("un ExceptionSet REAL (Error , ZeroDivide) sigue capturando", () => {
    expect(run("[1/0] on: (Error , ZeroDivide) do: [:e | #caught]")).toBe("#caught");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// primitives.ts:1226 Object>>error: — lanzaba un Error de host CRUDO, NO capturable
//   por on:do:, pese a que L5 ya está implementado (dNU sí se completó en L5). El
//   diferimiento ("capturable es L5") era condicional a que L5 no existiera.
//   Fix: bajo evalWith (jerarquía cargada) error: SEÑALA un Error capturable, igual
//   que dNU; sin jerarquía (send crudo) cae a host-throw con el texto (test L2).
// ─────────────────────────────────────────────────────────────────────────────
describe("followup · Object>>error: señala un Error capturable por on:do:", () => {
  it("error: es capturado por on: Error do: y conserva el messageText", () => {
    expect(run("[nil error: 'boom'] on: Error do: [:e | 'caught: ', e messageText]")).toBe(
      "caught: boom",
    );
  });
});
