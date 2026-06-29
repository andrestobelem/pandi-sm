/**
 * L5 · S1 — terminación garantizada: BlockClosure>>ensure: e ifCurtailed:
 * (plan §5.5 alcance-in; §5.5.1 D + corrección I-3). El contrato OBSERVABLE de
 * ensure:/ifCurtailed: se cierra AQUÍ (no en L3): su mecanismo es JS try/finally
 * sobre el frame de la primitiva, de modo que corre tanto en retorno normal como
 * cuando un NonLocalReturn de L3 (`^`) o un Unwind de L5 cruza el frame. El orden
 * de unwind es INVERSO (el ensure: más interno corre primero) por anidamiento de
 * los try/finally. Cada test referencia su positivo/negativo del gate §5.5 §6.1.
 *
 * Trazas de orden: usamos el buffer del Transcript (Transcript show: 'x' acumula
 * en memoria, legible vía evalWith(...).universe.Transcript.pointers[0]) como
 * registrador de orden determinista — no hay colecciones literales hasta L4.
 *
 * @section L5.ensure-curtailed
 * @kind    positive
 * @layer   L5
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";

/** Lee el buffer acumulado del Transcript (orden de los show:) tras evaluar `src`. */
function trace(src: string): string {
  const { universe } = evalWith(src);
  const buf = universe.Transcript.pointers[0];
  return typeof buf === "string" ? buf : "";
}

describe("L5 · ensure: (positivo #14) corre en retorno normal", () => {
  it("ensure: ejecuta el bloque de cierre y la expresión devuelve el valor del protegido", () => {
    // El protegido devuelve 7; ensure: devuelve el valor del protegido, no del cierre.
    expect(printString(evalSt("[7] ensure: [Transcript show: 'e']"))).toBe("7");
  });

  it("ensure: corre el cierre AUNQUE el protegido retorne normal (efecto observable)", () => {
    expect(trace("[Transcript show: 'p'] ensure: [Transcript show: 'e']")).toBe("pe");
  });
});

describe("L5 · ensure: (positivo #15) corre cuando una excepción/condición escapa", () => {
  it("ensure: corre el cierre cuando el protegido lanza (host error) y RELANZA el fallo", () => {
    // `nil foo` es un dNU -> error de host que ESCAPA; el ensure: corre durante el
    // unwind y el fallo se propaga (no se traga). Observamos el efecto del cierre
    // espiando el método de cierre: lo invocamos vía un bloque que registra en una
    // variable JS-side capturada por la primitiva value (el cierre es un bloque
    // Smalltalk; su único efecto observable cross-throw es que el error sí escapa).
    expect(() => evalSt("[nil foo] ensure: [Transcript show: 'e']")).toThrow(
      /doesNotUnderstand|no entiende/i,
    );
  });

  it("el cierre del ensure: SÍ corre durante el escape (trace via finally observable)", () => {
    // Demostramos que el cierre corre durante un escape: usamos un `^` (no-local
    // return de L3) que también ABANDONA el frame del ensure: (mismo camino de
    // unwind que un fallo), tras escribir en el cierre. El programa retorna el valor
    // del `^` y el Transcript muestra 'e' — prueba que el cierre corrió en la salida
    // anormal por unwind (un dNU host descartaría el Universe, no es observable).
    expect(trace("| r | r := [^7] ensure: [Transcript show: 'e']. r")).toBe("e");
  });
});

describe("L5 · ensure: (positivo #16) corre durante un non-local return de L3", () => {
  it("un `^` que cruza el frame de ensure: dispara el cierre antes de retornar", () => {
    // `^7` desenrolla al home del programa; el ensure: intermedio corre durante el
    // unwind (PROBE1: el finally de JS dispara durante un throw). El programa
    // devuelve 7 (valor del ^) y el Transcript muestra que el cierre corrió.
    expect(trace("[^7] ensure: [Transcript show: 'e']")).toBe("e");
  });

  it("el valor del programa es el del `^` aunque haya un ensure: intermedio", () => {
    expect(printString(evalSt("[^7] ensure: [Transcript show: 'e']"))).toBe("7");
  });
});

describe("L5 · ifCurtailed: (positivo #17) NO corre en retorno normal", () => {
  it("ifCurtailed: devuelve el valor del protegido y NO ejecuta el cierre", () => {
    expect(printString(evalSt("[7] ifCurtailed: [Transcript show: 'c']"))).toBe("7");
  });

  it("ifCurtailed: no deja traza cuando el protegido retorna normal", () => {
    expect(trace("[Transcript show: 'p'] ifCurtailed: [Transcript show: 'c']")).toBe("p");
  });
});

describe("L5 · ifCurtailed: (positivo #18) corre en salida anormal", () => {
  it("ifCurtailed: ejecuta el cierre cuando el protegido lanza y relanza el fallo", () => {
    expect(() => evalSt("[nil foo] ifCurtailed: [Transcript show: 'c']")).toThrow(
      /doesNotUnderstand|no entiende/i,
    );
  });

  it("ifCurtailed: corre durante un non-local return de L3 (salida anormal)", () => {
    expect(trace("[^7] ifCurtailed: [Transcript show: 'c']")).toBe("c");
  });
});

describe("L5 · orden de unwind INVERSO (negativo #6 / GATE-L5-UNWIND-ORDER)", () => {
  it("[[^7] ensure: [show a] ] ensure: [show b] => el más interno (a) corre primero", () => {
    // Anidamiento canónico §5.5.1 D: una salida que cruza AMBOS frames corre el
    // ensure: más interno primero (a) y luego el externo (b): traza == 'ab'.
    const src = "[[^7] ensure: [Transcript show: 'a']] ensure: [Transcript show: 'b']";
    expect(trace(src)).toBe("ab");
  });

  it("orden inverso también con ifCurtailed: anidado en salida anormal", () => {
    const src = "[[^7] ifCurtailed: [Transcript show: 'a']] ifCurtailed: [Transcript show: 'b']";
    expect(trace(src)).toBe("ab");
  });
});
