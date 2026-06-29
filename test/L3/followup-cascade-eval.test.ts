/**
 * Follow-up del audit loop-until-dry · B1 (blocker): el evaluador NO tenía caso
 * para CascadeNode, así que TODA expresión con `;` lanzaba un throw de host
 * ("nodo no soportado en el skeleton: Cascade") NO capturable por on:do:.
 * RED → GREEN: el receptor se evalúa UNA vez y cada mensaje se le envía en orden;
 * la cascada vale el último mensaje.
 *
 * @section L3.followup-cascade-eval
 * @kind    regression
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

const run = (code: string): string => printString(evalSt(code));

describe("followup · evaluación de cascadas (`;`)", () => {
  it("una cascada de keyword muta el MISMO receptor y vale el último mensaje", () => {
    expect(run("| t | t := OrderedCollection new. t add: 1; add: 2. t size")).toBe("2");
  });

  it("el receptor de la cascada se evalúa una sola vez (side-effect único)", () => {
    // `add:` devuelve el argumento, así que la cascada vale el último arg (3).
    expect(run("| t | t := OrderedCollection new. t add: 1; add: 2; add: 3")).toBe("3");
  });

  it("cabeza unaria/binaria: la cascada reusa el receptor previo al primer ';'", () => {
    // 3 + 4 ; - 1  ⇒  ambos mensajes van a 3 ⇒ vale 3 - 1 = 2.
    expect(run("3 + 4; - 1")).toBe("2");
  });
});
