/**
 * Follow-up del audit loop-until-dry · M4 (major): un `^` desde un bloque cuyo
 * método de origen YA retornó (home muerto) dejaba escapar un NonLocalReturn CRUDO
 * (no es Error, INcapturable por on:do:) que cruzaba evalWith como throw de host.
 * ANSI exige un BlockCannotReturn capturable. activate() marca su home como muerto
 * al salir; evalBlock convierte un NLR a home muerto en un Error capturable.
 * RED → GREEN. Toca el ciclo de vida de HomeMarker, así que también verifica que un
 * `^` a un home VIVO sigue intacto (no-regresión).
 *
 * @section L5.followup-dead-home
 * @kind    regression
 * @layer   L5
 */
import { describe, expect, it } from "vitest";
import { installExceptionPrimitives } from "../../src/eval/exceptions.js";
import { KERNEL_EXCEPTION_SOURCES } from "../../src/eval/kernel-exceptions.js";
import { loadKernelSources } from "../../src/eval/kernel-loader.js";
import { defineMethod } from "../../src/eval/method.js";
import { installPrimitives } from "../../src/eval/primitives.js";
import { send } from "../../src/eval/send.js";
import { basicNew, bootstrapKernel, type STClass, type STValue } from "../../src/runtime/index.js";

/** Universo con primitivas Y jerarquía L5 cargada (mismo bootstrap que evalWith). */
function fullUniverse() {
  const u = bootstrapKernel();
  installPrimitives(u);
  loadKernelSources(u, KERNEL_EXCEPTION_SOURCES);
  installExceptionPrimitives(u);
  return u;
}
type Univ = ReturnType<typeof fullUniverse>;
const subclassOf = (u: Univ, sup: STClass, name: string): STClass =>
  send(sup, "subclass:", [u.symbols.intern(name)], u) as STClass;

describe("L5 · followup · M4 · `^` desde un bloque de home muerto es BlockCannotReturn capturable", () => {
  it("invocar el bloque escapado lanza un Error (no un NonLocalReturn crudo)", () => {
    const u = fullUniverse();
    const DH = subclassOf(u, u.Object, "DeadHome1");
    defineMethod(DH, "deadBlock [ ^ [ ^ 42 ] ]", u);
    const blk = send(basicNew(DH, u), "deadBlock", [], u);
    expect(() => send(blk, "value", [], u)).toThrow(/BlockCannotReturn/);
  });

  it("ese BlockCannotReturn es capturable por on: Error do:", () => {
    const u = fullUniverse();
    const DH = subclassOf(u, u.Object, "DeadHome2");
    defineMethod(DH, "deadBlock [ ^ [ ^ 42 ] ]", u);
    defineMethod(DH, "run [ ^ [ self deadBlock value ] on: Error do: [:e | #caught ] ]", u);
    expect(send(basicNew(DH, u), "run", [], u)).toBe(u.symbols.intern("caught"));
  });

  it("no-regresión: un `^` a un home VIVO sigue retornando del método", () => {
    const u = fullUniverse();
    const DH = subclassOf(u, u.Object, "DeadHome3");
    defineMethod(DH, "live [ true ifTrue: [ ^ 7 ]. ^ 9 ]", u);
    expect(send(basicNew(DH, u), "live", [], u)).toBe(7);
  });
});
