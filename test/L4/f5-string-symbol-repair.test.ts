/**
 * L4 · F5 (REPAIR) — regresiones de String/Symbol que el gate verde original ocultaba.
 * Cada caso FALLA en el árbol previo a la reparación por el motivo correcto (Red), y PASA tras
 * el fix mínimo (Green). Root-cause, no síntoma: los cuerpos de String que un Symbol HEREDA
 * (=, asSymbol, size, ,) leían sólo `.chars`, así que un receptor Symbol caía a "" / `no igual`;
 * y `hash`/`String new` heredaban el default de Object (por objeto / basicNew sin `chars`).
 *
 * Cubre 4 defectos:
 *   1) Symbol>>= no reflexiva (#foo = #foo => false)            — DEV-044
 *   2) Symbol>>asSymbol devolvía el símbolo vacío # (no ^self)  — DEV-045
 *   3) hash no consistente con = (a=b pero a hash ~= b hash)    — DEV-046
 *   4) String new => instancia rota sin `chars` (protocolo dNU) — DEV-047
 *
 * @section L4.f5-string-symbol-repair
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F5 · REPAIR · Symbol>>= por contenido (heredada, reflexiva)", () => {
  it("DEV-044 — #foo = #foo => true (Symbol receptor desenvuelve su .text)", () => {
    expect(printString(evalSt("#foo = #foo"))).toBe("true");
  });

  it("DEV-044 — #foo ~= #foo => false", () => {
    expect(printString(evalSt("#foo ~= #foo"))).toBe("false");
  });

  it("DEV-044 — la igualdad de Symbol elige la rama correcta de ifTrue:ifFalse:", () => {
    expect(printString(evalSt("(#a = #a) ifTrue: [1] ifFalse: [2]"))).toBe("1");
  });

  it("DEV-044 — distintos símbolos NO son iguales (#foo = #bar => false)", () => {
    expect(printString(evalSt("#foo = #bar"))).toBe("false");
  });
});

describe("L4 · F5 · REPAIR · Symbol>>asSymbol es ^self (mismo objeto interned)", () => {
  it("DEV-045 — #foo asSymbol imprime #foo (no el símbolo vacío #)", () => {
    expect(printString(evalSt("#foo asSymbol"))).toBe("#foo");
  });

  it("DEV-045 — #foo asSymbol == #foo => true (identidad interned preservada)", () => {
    expect(printString(evalSt("#foo asSymbol == #foo"))).toBe("true");
  });
});

describe("L4 · F5 · REPAIR · hash por CONTENIDO (a = b => a hash = b hash)", () => {
  it("DEV-046 — String: ('foo' hash) = ('foo' copy hash) => true (cajas distintas, mismo hash)", () => {
    expect(printString(evalSt("('foo' hash) = ('foo' copy hash)"))).toBe("true");
  });

  it("DEV-046 — Symbol hereda hash por contenido: (#foo hash) = ('foo' hash) => true", () => {
    expect(printString(evalSt("(#foo hash) = ('foo' hash)"))).toBe("true");
  });

  it("DEV-046 — identityHash sigue siendo POR OBJETO ('foo' ~~ 'foo' copy)", () => {
    expect(printString(evalSt("'foo' == 'foo' copy"))).toBe("false");
  });
});

describe("L4 · F5 · REPAIR · String class>>new => '' boxed funcional", () => {
  it("DEV-047 — String new size => 0 (no lanza; es un String boxed real)", () => {
    expect(printString(evalSt("String new size"))).toBe("0");
  });

  it("DEV-047 — String new , 'x' => 'x' (responde el protocolo de String)", () => {
    expect(printString(evalSt("String new , 'x'"))).toBe("x");
  });

  it("DEV-047 — String new = '' => true (igualdad por contenido con la cadena vacía)", () => {
    expect(printString(evalSt("String new = ''"))).toBe("true");
  });

  it("DEV-047 — dos String new son cajas DISTINTAS (== false) pero iguales (= true)", () => {
    expect(printString(evalSt("String new == String new"))).toBe("false");
    expect(printString(evalSt("String new = String new"))).toBe("true");
  });
});
