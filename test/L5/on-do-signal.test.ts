/**
 * L5 · S2 — jerarquía de excepciones + signal/signal: + on:do: (plan §5.5 alcance-in;
 * §5.5.1 A–G). Construye sobre S1 (Unwind + ensure:/ifCurtailed:). Verifica el modelo
 * de DOS FASES: el handler corre sobre el frame vivo del signal (fase 1, llamada
 * normal, valor de retorno HandlerAction); return:/fallOff desenrollan al on:do: por
 * Unwind (fase 2). La jerarquía Exception<-Error/Warning, ArithmeticError<-ZeroDivide,
 * MessageNotUnderstood se carga vía KERNELLOAD. messageText es recuperable. dNU señala
 * un MessageNotUnderstood capturable; un MNU no capturado preserva el texto host.
 *
 * Cada test referencia su positivo/negativo del gate §5.5/§6.1 (o origin=ingeniería).
 *
 * @section L5.on-do-signal
 * @kind    positive+negative
 * @layer   L5
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";

/** Lee el buffer acumulado del Transcript tras evaluar `src`. */
function trace(src: string): string {
  const { universe } = evalWith(src);
  const buf = universe.Transcript.pointers[0];
  return typeof buf === "string" ? buf : "";
}

describe("L5 · on:do: (positivo #1) captura tipo EXACTO", () => {
  it("on: Error do: captura un Error señalado y devuelve el valor del handler", () => {
    expect(printString(evalSt("[Error signal. 99] on: Error do: [:e | 42]"))).toBe("42");
  });
});

describe("L5 · on:do: (positivo #2) captura SUBTIPO via isKindOf:", () => {
  it("on: Error do: captura un ZeroDivide (subtipo de ArithmeticError < Error)", () => {
    expect(printString(evalSt("[ZeroDivide signal] on: Error do: [:e | 7]"))).toBe("7");
  });

  it("on: ArithmeticError do: captura un ZeroDivide (subtipo directo)", () => {
    expect(printString(evalSt("[ZeroDivide signal] on: ArithmeticError do: [:e | 8]"))).toBe("8");
  });
});

describe("L5 · on:do: (positivo #3) NO captura tipo no relacionado", () => {
  it("on: Warning do: NO captura un Error -> el Error escapa al top-level", () => {
    expect(() => evalSt("[Error signal: 'boom'] on: Warning do: [:e | 1]")).toThrow();
  });
});

describe("L5 · on:do:on:do: + ExceptionSet (positivo #4)", () => {
  it("on:do:on:do: captura por el segundo handler cuando el primero no aplica", () => {
    const src = "[Error signal] on: Warning do: [:e | 1] on: Error do: [:e | 2]";
    expect(printString(evalSt(src))).toBe("2");
  });

  it("ExceptionSet (Warning , Error) captura un Error", () => {
    expect(printString(evalSt("[Error signal] on: Warning , Error do: [:e | 5]"))).toBe("5");
  });

  it("ExceptionSet (Warning , Error) captura un Warning", () => {
    expect(printString(evalSt("[Warning signal] on: Warning , Error do: [:e | 6]"))).toBe("6");
  });
});

describe("L5 · return:/return/fallOff (positivos #5 #6 #7)", () => {
  it("#5 return: v hace que la expresión on:do: valga v", () => {
    expect(printString(evalSt("[Error signal] on: Error do: [:e | e return: 33]"))).toBe("33");
  });

  it("#6 return == return: nil (la expresión vale nil)", () => {
    expect(printString(evalSt("[Error signal] on: Error do: [:e | e return]"))).toBe("nil");
  });

  it("#7 fallOff == return: el valor del último envío del handler", () => {
    expect(printString(evalSt("[Error signal] on: Error do: [:e | 123]"))).toBe("123");
  });

  it("GATE-L5-RETURN-IS-UNWIND: la línea tras el signal NO se ejecuta (return: desenrolla)", () => {
    // self error: 'inalcanzable' levantaría un fallo si se ejecutara; return: 42 lo evita.
    const src = "[Error signal. nil unaLineaQueRompe] on: Error do: [:e | e return: 42]";
    expect(printString(evalSt(src))).toBe("42");
  });
});

describe("L5 · pass (positivo #12)", () => {
  it("pass delega al handler externo del mismo tipo", () => {
    const src = "[[Error signal] on: Error do: [:e | e pass]] on: Error do: [:e | 77]";
    expect(printString(evalSt(src))).toBe("77");
  });

  it("el handler interno corre una sola vez antes de delegar (traza i+o)", () => {
    const src =
      "[[Error signal] on: Error do: [:e | Transcript show: 'i'. e pass]] on: Error do: [:e | Transcript show: 'o']";
    expect(trace(src)).toBe("io");
  });
});

describe("L5 · acciones del handler son TRANSFERENCIAS no-locales (REPAIR r2)", () => {
  // El handler block se ABANDONA al invocar la acción: las sentencias posteriores son
  // inalcanzables y GANA LA PRIMERA acción (no la última). Antes del fix las acciones
  // marcaban una pendingAction y el block seguía corriendo (last-wins, pass pisado).

  it("return: corta el handler: la sentencia siguiente NO corre (gana la primera, vale 1)", () => {
    // Sin el fix: el segundo return: pisaba al primero (devolvía 2).
    expect(
      printString(evalSt("[Error signal] on: Error do: [:e | e return: 1. e return: 2]")),
    ).toBe("1");
  });

  it("return: corta el handler: una sentencia rota posterior NUNCA se evalúa (vale 1)", () => {
    // Sin el fix: `nil boom` corría tras el return: y lanzaba doesNotUnderstand.
    expect(printString(evalSt("[Error signal] on: Error do: [:e | e return: 1. nil boom]"))).toBe(
      "1",
    );
  });

  it("pass delega de verdad al externo: un return: tras el pass NO lo pisa (vale 5)", () => {
    // Sin el fix: el pass marcaba la delegación pero el return: 1 posterior la sobrescribía
    // (devolvía 1). Con la transferencia no-local, el pass abandona el handler y delega.
    const src =
      "[[Error signal] on: Error do: [:e | e pass. e return: 1]] on: Error do: [:e | e return: 5]";
    expect(printString(evalSt(src))).toBe("5");
  });

  it("retry corta el handler: la sentencia tras el retry NO corre (traza 'rdone', no 'rTRAILdone')", () => {
    const src =
      "| n | n := 0. [n := n + 1. n < 2 ifTrue: [Error signal]. Transcript show: 'done'] on: Error do: [:e | Transcript show: 'r'. e retry. Transcript show: 'TRAIL']";
    expect(trace(src)).toBe("rdone");
  });
});

describe("L5 · signal: (positivo #13) fija messageText recuperable", () => {
  it("el handler lee el messageText fijado por signal:", () => {
    const src = "[Error signal: 'boom'] on: Error do: [:e | e messageText]";
    expect(printString(evalSt(src))).toBe("boom");
  });

  it("signal (sin texto) deja messageText en nil", () => {
    const src = "[Error signal] on: Error do: [:e | e messageText]";
    expect(printString(evalSt(src))).toBe("nil");
  });
});

describe("L5 · MessageNotUnderstood (positivo #20) capturable", () => {
  it("on: MessageNotUnderstood do: captura un dNU señalado", () => {
    expect(printString(evalSt("[nil foo] on: MessageNotUnderstood do: [:e | 55]"))).toBe("55");
  });

  it("un dNU es capturable también como Error (subtipo)", () => {
    expect(printString(evalSt("[3 fooBar] on: Error do: [:e | 56]"))).toBe("56");
  });

  it("backward-compat: un MNU NO capturado preserva el texto host (doesNotUnderstand)", () => {
    expect(() => evalSt("nil foo")).toThrow(/doesNotUnderstand|no entiende/i);
  });
});

describe("L5 · negativo #4 — signal sin handler propaga al top-level", () => {
  it("Error signal sin on:do: lanza un error de host", () => {
    expect(() => evalSt("Error signal")).toThrow();
  });

  it("Error signal: con texto sin handler propaga el texto", () => {
    expect(() => evalSt("Error signal: 'kaboom'")).toThrow(/kaboom/);
  });
});

describe("L5 · negativo #5 — pass sin handler externo -> defaultAction", () => {
  it("pass sin handler externo: el Error termina propagando al top-level", () => {
    expect(() => evalSt("[Error signal] on: Error do: [:e | e pass]")).toThrow();
  });
});

describe("L5 · jerarquía cargada vía KERNELLOAD", () => {
  it("ZeroDivide isKindOf: ArithmeticError, ArithmeticError, Error y Exception", () => {
    expect(printString(evalSt("(ZeroDivide new) isKindOf: ArithmeticError"))).toBe("true");
    expect(printString(evalSt("(ZeroDivide new) isKindOf: Error"))).toBe("true");
    expect(printString(evalSt("(ZeroDivide new) isKindOf: Exception"))).toBe("true");
  });

  it("Warning isKindOf: Exception pero NO Error", () => {
    expect(printString(evalSt("(Warning new) isKindOf: Exception"))).toBe("true");
    expect(printString(evalSt("(Warning new) isKindOf: Error"))).toBe("false");
  });
});

describe("L5 · ensure: interactúa con el unwind de signal (positivo #15 vía Unwind)", () => {
  it("ensure: corre cuando un return: desenrolla a través de su frame", () => {
    const src = "[[Error signal] ensure: [Transcript show: 'e']] on: Error do: [:e | e return: 9]";
    expect(trace(src)).toBe("e");
  });
});
