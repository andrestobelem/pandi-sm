/**
 * Follow-up del audit loop-until-dry · huecos de eval que producían throws de host
 * NO capturables por on:do: sobre input válido. RED → GREEN.
 *
 * @section L3.followup-eval-gaps
 * @kind    regression
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

const run = (code: string): string => printString(evalSt(code));

// eval.ts:162 — un literal scaledDecimal (`3.14s2`) lexea y parsea bien pero
// evalNode no tenía rama: lanzaba un throw de host ("literal no soportado…") NO
// capturable. M3: señala un Error capturable (soporte numérico real diferido).
describe("followup · M3 · scaledDecimal en eval señala Error capturable (no crash de host)", () => {
  it("`3.14s2` es capturable por on: Error do:", () => {
    expect(run("[3.14s2] on: Error do: [:e | #caught]")).toBe("#caught");
  });
});
