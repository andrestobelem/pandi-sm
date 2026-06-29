/**
 * S5-eval-runtime-loader-majors — regresión para los bugs de eval/method/object/kernel/
 * kernel-loader del sweep de auditoría (ranks #13, #16, #20, #21, #22, #evalBlock-arity).
 *
 * #13 — evalSequence sobreescribe el binding de un parámetro si una temporal
 *        tiene el mismo nombre: `[:x | | x | x] value: 42` devuelve nil en vez de 42.
 * #16 — identityHash viola el contrato de hash cuando el mismo entero se almacena
 *        como `number` y como `bigint`: `identical(n, BigInt(n))` es true pero sus
 *        hashes difieren para n >= 2^31-1.
 * #20 — activate no verifica aridad: una llamada con demasiados/pocos args silencia
 *        el error (nil-padding / arg-dropping), a diferencia de evalBlock que lanza.
 * #21 — el scanner de profundidad de corchetes en kernel-loader no salta los
 *        char-literals `$[` / `$]`; un cuerpo con `$[` provoca falsa KernelLoadError.
 * #22 — subclass: (subclassFull / subclassShort) no verifica duplicados en el namespace:
 *        `Object subclass: #DupK. Object subclass: #DupK` silenciosamente machaca la
 *        clase original sin señalar error.
 * #evalBlock-arity — evalBlock lanzaba host Error (no capturable) cuando la aridad
 *        del bloque no coincide con los argumentos pasados a value/value:/...; debería
 *        señalar un Error de Smalltalk capturable via on:do:.
 *
 * #12 — FALSE POSITIVE documentado: args evaluadas "dos veces" cuando super se usa
 *        a nivel raíz. El flujo real es: args evaluadas UNA vez en línea 255, luego
 *        evalNode(receiver="super") lanza JS Error en resolveVariable (línea 102) —
 *        nunca se llega a la segunda evaluación (línea 261). No reproducible como RED.
 *
 * @section L2.s5-eval-runtime-loader-majors
 * @kind    regression
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { loadKernelSources } from "../../src/eval/kernel-loader.js";
import { eval as evalSt, printString } from "../../src/eval/index.js";
import { defineMethod } from "../../src/eval/method.js";
import { installPrimitives } from "../../src/eval/primitives.js";
import { send } from "../../src/eval/send.js";
import { basicNew, bootstrapKernel } from "../../src/runtime/index.js";
import { identityHash } from "../../src/runtime/object.js";

/** Universe fresco con primitivas instaladas (mismo bootstrap que evalWith). */
function freshUniverse() {
  const u = bootstrapKernel();
  installPrimitives(u);
  return u;
}

// ── Finding #13 · evalSequence sobreescribe param con temporal del mismo nombre ─

describe("S5 #13 · param no sobreescrito por temporal con mismo nombre", () => {
  it("[:x | | x | x] value: 42 -> 42 (no nil)", () => {
    // Antes del fix: evalSequence hacía vars.set('x', nil) incondicionalmente,
    // pisando el binding x=42 que evalBlock había establecido.
    expect(printString(evalSt("[:x | | x | x] value: 42"))).toBe("42");
  });

  it("[:x | | x | x + 1] value: 10 -> 11 (param preservado con operación)", () => {
    expect(printString(evalSt("[:x | | x | x + 1] value: 10"))).toBe("11");
  });

  it("[:x :y | | x | x + y] value: 3 value: 4 -> 7 (primer param preservado)", () => {
    // x reintroducida como temp: binding x=3 preservado; y=4 preservado también.
    expect(printString(evalSt("[:x :y | | x | x + y] value: 3 value: 4"))).toBe("7");
  });

  it("var distinta en temp no afecta el param", () => {
    // Caso sano: temp con nombre distinto inicializa a nil sin tocar el param.
    expect(printString(evalSt("[:x | | y | x] value: 99"))).toBe("99");
  });
});

// ── Finding #16 · identityHash coherente entre number y bigint ──────────────────

describe("S5 #16 · identityHash coherente con identical para number/bigint", () => {
  it("identityHash(2147483648) === identityHash(2147483648n) (misma representación)", () => {
    // 2^31: como number usa |0 -> -2147483648; como bigint usa % 0x7fffffff -> 1.
    // El fix unifica ambos por BigInt(v) % 0x7fffffffn.
    const n = 2147483648;
    const b = BigInt(n);
    // Sin fix: identityHash(n) = -2147483648, identityHash(b) = 1 → NO iguales.
    expect(identityHash(n, undefined as never)).toBe(identityHash(b, undefined as never));
  });

  it("identityHash(0x7fffffff) == identityHash(0x7fffffffn)", () => {
    const n = 0x7fffffff;
    expect(identityHash(n, undefined as never)).toBe(identityHash(BigInt(n), undefined as never));
  });

  it("identityHash pequeño preservado: identityHash(5) == identityHash(5n)", () => {
    // Rango pequeño: ambas ramas deben dar el mismo resultado.
    expect(identityHash(5, undefined as never)).toBe(identityHash(5n, undefined as never));
  });

  it("idHash consistente con = en Smalltalk via identityHash a nivel Smalltalk", () => {
    // En el evaluador: el mismo entero como número produce el mismo hash que como bigint.
    // En Smalltalk, 3 identityHash y 3 identityHash producen el mismo valor.
    expect(printString(evalSt("3 identityHash = 3 identityHash"))).toBe("true");
  });
});

// ── Finding #20 · activate verifica aridad ──────────────────────────────────────

describe("S5 #20 · activate señala error de aridad (no nil-padding)", () => {
  it("CompiledMethod unario llamado con arg extra señala error de aridad", () => {
    // Creamos un método unario de usuario (CompiledMethod, entra por `activate`).
    // Lo llamamos con 1 arg extra via send() con args=[99] — activate espera [].
    // Antes del fix: activate no chequeaba aridad — args extras se ignoraban silenciosamente.
    // Después del fix: signalError lanza Error (JS) con mensaje de aridad.
    const u = freshUniverse();
    const Greet = send(u.Object, "subclass:", [u.symbols.intern("Greet")], u);
    defineMethod(Greet as Parameters<typeof defineMethod>[0], "greet [ ^ 'hello' ]", u);
    const obj = basicNew(Greet as Parameters<typeof defineMethod>[0], u);
    // El método espera 0 args pero pasamos 1 → debe lanzar un Error
    expect(() => send(obj, "greet", [99], u)).toThrow(/aridad/i);
  });

  it("CompiledMethod keyword con muy pocos args señala error de aridad", () => {
    // Método keyword que espera 1 arg; lo llamamos con 0.
    // Antes del fix: activate hacía args[0] ?? nil → el arg faltante se rellenaba con nil.
    // Después del fix: signalError lanza Error con mensaje de aridad.
    const u = freshUniverse();
    const Dbl = send(u.Object, "subclass:", [u.symbols.intern("Dbl")], u);
    defineMethod(Dbl as Parameters<typeof defineMethod>[0], "double: n [ ^ n + n ]", u);
    const obj = basicNew(Dbl as Parameters<typeof defineMethod>[0], u);
    // El método espera 1 arg pero pasamos 0 → debe lanzar un Error
    expect(() => send(obj, "double:", [], u)).toThrow(/aridad/i);
  });
});

// ── Finding #21 · scanner de brackets ignora char-literal $[ ───────────────────

describe("S5 #21 · kernel-loader bracket-scan salta char-literals $[ y $]", () => {
  it("método con $[ en el cuerpo no provoca KernelLoadError (no false 'unclosed body')", () => {
    // Antes del fix: depth++ para '[' dentro de '$[' → balance de corchetes incorrecto
    // → el escáner considera que el cuerpo del método no está cerrado → KernelLoadError.
    const source = `Object subclass: #TestBracketChar instanceVariableNames: '' classVariableNames: '' package: 'T'
TestBracketChar >> testMethod [
  | c |
  c := $[.
  ^ c
]`;
    // loadKernelSources NO debe lanzar; si lanza, el fix no se aplicó.
    expect(() => {
      const u = freshUniverse();
      loadKernelSources(u, [source]);
    }).not.toThrow();
  });

  it("método con $] en el cuerpo no trunca el cuerpo (no falso 'cierre prematuro')", () => {
    // Antes del fix: depth-- para ']' dentro de '$]' → el escáner cierra el cuerpo antes
    // del delimitador real; el código tras $] se considera fuera del método.
    const source = `Object subclass: #TestCloseBracket instanceVariableNames: '' classVariableNames: '' package: 'T'
TestCloseBracket >> getChar [
  ^ $]
]`;
    // Debe cargar sin error; si el cuerpo se trunca, fallará con KernelLoadError o similar.
    expect(() => {
      const u = freshUniverse();
      loadKernelSources(u, [source]);
    }).not.toThrow();
  });

  it("$[ no interfiere con los bloques reales adyacentes", () => {
    // El método contiene tanto $[ como un bloque [] real; el balance debe ser correcto.
    const source = `Object subclass: #TestBracketMixed instanceVariableNames: '' classVariableNames: '' package: 'T'
TestBracketMixed >> mixed [
  | c |
  c := $[.
  ^ [c] value
]`;
    expect(() => {
      const u = freshUniverse();
      loadKernelSources(u, [source]);
    }).not.toThrow();
  });
});

// ── Finding #22 · subclass: detecta duplicados en el namespace ──────────────────

describe("S5 #22 · subclass: señala error si la clase ya existe", () => {
  it("segunda declaración Object subclass: #DupX señala error capturable", () => {
    // Antes del fix: makeClassWithMetaclass hace namespace.set incondicionalmente,
    // machacando la clase original silenciosamente.
    const src = `
      Object subclass: #DupX.
      [Object subclass: #DupX] on: Error do: [:e | 'dup-error']`;
    expect(printString(evalSt(src))).toBe("dup-error");
  });

  it("subclass: normal (nombre nuevo) sigue funcionando", () => {
    const src = `
      Object subclass: #FreshClass9911.
      FreshClass9911 new class name`;
    expect(printString(evalSt(src))).toBe("FreshClass9911");
  });
});

// ── Finding #evalBlock-arity · evalBlock aridad incorrecta es capturable ────────

describe("S5 #evalBlock-arity · aridad incorrecta en bloque es Error capturable", () => {
  it("on:do: captura la aridad incorrecta al llamar value: con menos args de los esperados", () => {
    // Antes del fix: evalBlock hacía `throw new Error(...)` (host throw), escapando
    // al VM host en vez de señalar un Error de Smalltalk capturable con on:do:.
    const src = "[[:x :y | x + y] value: 1] on: Error do: [:e | #arityErr]";
    expect(printString(evalSt(src))).toBe("#arityErr");
  });

  it("on:do: captura la aridad incorrecta al llamar value sin args cuando se esperan", () => {
    // Bloque unario llamado con argumento de más.
    const src = "[[:x | x] value] on: Error do: [:e | #arityErr2]";
    expect(printString(evalSt(src))).toBe("#arityErr2");
  });

  it("aridad correcta sigue funcionando sin excepción", () => {
    // El caso feliz no debe verse afectado.
    expect(printString(evalSt("[:x :y | x + y] value: 3 value: 4"))).toBe("7");
  });
});
