/**
 * L4 · F5 (REPAIR) — `printString` (el SEND) debe devolver un String BOXED, no un string JS
 * nativo. Antes del fix, objectPrintString devolvía hostPrintString(receiver) (un nativo), así
 * que el resultado de `x printString` era value-typed: reabría el hueco de value-identity que el
 * boxing de String había cerrado para los literales, y rompía el protocolo de String sobre el
 * resultado (asSymbol internaba '', = era incoherente).
 *
 * Cada caso FALLA en el árbol previo por el motivo correcto (Red) y PASA tras boxear la salida.
 *
 * Defecto: objectPrintString leaks a native JS string into user code — DEV-037.
 *
 * @section L4.f5-printstring-boxing-repair
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F5 · REPAIR · printString (send) devuelve un String boxed (GATE-L4-IDENTITY)", () => {
  it("DEV-037 — IDENTIDAD: 3 printString == 3 printString => false (dos cajas distintas)", () => {
    // El hueco original: dos sends devolvían nativos JS ===-iguales, así que == daba true.
    expect(printString(evalSt("3 printString == 3 printString"))).toBe("false");
  });

  it("DEV-037 — IGUALDAD POR CONTENIDO: 3 printString = 3 printString => true", () => {
    expect(printString(evalSt("3 printString = 3 printString"))).toBe("true");
  });

  it("DEV-037 — asSymbol: (3 printString) asSymbol => #3 (no el símbolo vacío #)", () => {
    // textOf(nativo) era null => internaba '' => # (respuesta silenciosamente errónea).
    expect(printString(evalSt("(3 printString) asSymbol"))).toBe("#3");
  });

  it("DEV-037 — IGUALDAD COHERENTE: 3 printString = '3' => true", () => {
    expect(printString(evalSt("3 printString = '3'"))).toBe("true");
    expect(printString(evalSt("'3' = 3 printString"))).toBe("true");
  });

  it("DEV-037 — el resultado responde el protocolo de String: 3 printString size => 1", () => {
    expect(printString(evalSt("3 printString size"))).toBe("1");
  });

  it("DEV-037 — el resultado responde , : 3 printString , '!' => '3!'", () => {
    expect(printString(evalSt("3 printString , '!'"))).toBe("3!");
  });

  it("DEV-037 — un STObject default también boxea: (Object new printString) , '' => 'a Object'", () => {
    // Confirma que el camino default ("a ClassName") cruza a usuario boxeado, no nativo.
    expect(printString(evalSt("(Object new printString) , ''"))).toBe("a Object");
  });
});
