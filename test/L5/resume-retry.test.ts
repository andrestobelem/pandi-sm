/**
 * L5 · S3 — resumibles + retry + negativos (plan §5.5 positivos #8 #9 #10 #11 #19;
 * negativos #1 #2 #3; §5.5.1 correcciones I-3 + gates J GATE-L5-RESUME-NO-UNWIND).
 * Construye sobre S1 (Unwind + ensure:/ifCurtailed:) y S2 (jerarquía + signal +
 * on:do:). Verifica el modelo de DOS FASES en su arista más sutil:
 *
 *  - resume:/resume = FASE 1 pura: signal() reactiva el handler y DEVUELVE el valor
 *    al punto del signal SIN cruzar el frame hacia afuera; el bloque protegido
 *    continúa. Por eso un ensure: que envuelve la continuación NO corre durante el
 *    resume (corre después, al salir normalmente). GATE-L5-RESUME-NO-UNWIND lo prueba
 *    por ORDEN de traza: la continuación ('k') corre ANTES del cierre del ensure:
 *    ('E') — si el resume hubiera desenrollado, 'E' correría primero (o 'k' nunca).
 *  - retry/retryUsing: = FASE 2: un Unwind etiquetado retry vuelve al on:do:, que
 *    RE-EVALÚA el bloque protegido (o el reemplazo) bajo el handler reactivado, sin
 *    crecer la pila (bucle en runProtected). Un contador demuestra el 2o intento.
 *  - isResumable por clase: Error false, Warning true, Exception base false.
 *  - Negativos (rechazo definido): resume(:) de no-resumable señala un Error CONCRETO
 *    (política origen=ingeniería, ruta al log L6 — NO conformidad ANSI); return/retry/
 *    resume fuera de un handler activo = error.
 *  - ZeroDivide: capturado por on: ZeroDivide do: Y on: ArithmeticError do: (subtipo),
 *    señalado MANUALMENTE (`ZeroDivide signal`) — la aritmética // es L4 (diferida).
 *
 * Cada test referencia su positivo/negativo del gate §5.5/§6.1 (o origin=ingeniería).
 *
 * @section L5.resume-retry
 * @kind    positive+negative
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

describe("L5 · retry (positivo #8) re-evalúa y tiene éxito a la 2a", () => {
  it("retry re-evalúa el protegido; un contador hace que la 2a vuelta no señale", () => {
    // 1a vuelta: n=1 (<2) -> Error signal -> handler retry; 2a vuelta: n=2 -> devuelve n.
    const src =
      "| n | n := 0. [n := n + 1. n < 2 ifTrue: [Error signal]. n] on: Error do: [:e | e retry]";
    expect(printString(evalSt(src))).toBe("2");
  });

  it("el protegido se evalúa DOS veces (traza 'pp'), sin crecer la pila", () => {
    const src =
      "| n | n := 0. [n := n + 1. Transcript show: 'p'. n < 2 ifTrue: [Error signal]. n] on: Error do: [:e | e retry]";
    expect(trace(src)).toBe("pp");
  });
});

describe("L5 · retryUsing: (positivo #9) reemplaza el bloque protegido", () => {
  it("retryUsing: corre el bloque de reemplazo en lugar del protegido", () => {
    const src = "[Error signal] on: Error do: [:e | e retryUsing: [42]]";
    expect(printString(evalSt(src))).toBe("42");
  });
});

describe("L5 · resume: (positivo #10) hace que signal devuelva v y el bloque continúe", () => {
  it("resume: v hace que (Warning signal) valga v y la expresión siguiente lo use", () => {
    // (Warning signal) devuelve 99 al punto del signal; 99 + 1 => 100.
    expect(printString(evalSt("[(Warning signal) + 1] on: Warning do: [:e | e resume: 99]"))).toBe(
      "100",
    );
  });

  it("la continuación del bloque protegido corre tras el resume:", () => {
    // signal resume -> el bloque sigue, evalúa la última expresión 11.
    const src = "[Warning signal. 11] on: Warning do: [:e | e resume: 99]";
    expect(printString(evalSt(src))).toBe("11");
  });

  it("GATE-L5-RESUME-NO-UNWIND: resume continúa SIN desenrollar (valor 11 y ensure NO corre durante el resume)", () => {
    // Forma del gate J §5.5.1 línea 705: continuidad del frame del signal. El ensure:
    // envuelve la continuación; si el resume DESENROLLARA, 'E' correría antes que 'k'.
    // La traza 'kE' prueba que la continuación ('k') corrió ANTES del cierre del
    // ensure: ('E') — el ensure: NO corrió DURANTE el resume, sino al salir normal.
    const src =
      "[[Warning signal. Transcript show: 'k'] ensure: [Transcript show: 'E']] on: Warning do: [:e | e resume: 1]";
    expect(trace(src)).toBe("kE");
  });

  it("el valor resumido (11) confirma que el frame del signal nunca se abandonó", () => {
    const src = "| x | x := [Warning signal. 11] on: Warning do: [:e | e resume: 99]. x";
    expect(printString(evalSt(src))).toBe("11");
  });
});

describe("L5 · resume: es transferencia no-local inmediata (REPAIR r2)", () => {
  // resume: DEVUELVE al punto del signal en el acto: las sentencias del handler tras el
  // resume: son inalcanzables. Antes del fix la continuación corría DESPUÉS del resto del
  // handler block (traza 'AFTERk' en vez de 'k') y un return: posterior pisaba el resume.

  it("la continuación del signal corre tras un resume: y la sentencia post-resume NO (traza 'k')", () => {
    // Sin el fix: 'AFTERk' (el handler seguía corriendo y luego resumía). Con el fix: 'k'.
    const src =
      "[Warning signal. Transcript show: 'k'] on: Warning do: [:e | e resume: 1. Transcript show: 'AFTER']";
    expect(trace(src)).toBe("k");
  });

  it("resume: gana sobre un return: posterior: el signal resume y la expresión continúa (100)", () => {
    // Sin el fix: el return: 7 posterior pisaba el resume (devolvía 7). Con el fix: 99 + 1 = 100.
    expect(
      printString(
        evalSt("[(Warning signal) + 1] on: Warning do: [:e | e resume: 99. e return: 7]"),
      ),
    ).toBe("100");
  });
});

describe("L5 · resume == resume: nil (positivo #11)", () => {
  it("resume (sin arg) hace que (Warning signal) valga nil", () => {
    expect(printString(evalSt("[(Warning signal) isNil] on: Warning do: [:e | e resume]"))).toBe(
      "true",
    );
  });
});

describe("L5 · Warning>>signal sin handler resume nil (positivo #19, defaultAction)", () => {
  it("Warning signal sin on:do: devuelve nil (defaultAction: self resume: nil)", () => {
    expect(printString(evalSt("(Warning signal) isNil"))).toBe("true");
  });

  it("el programa continúa tras un Warning signal sin handler", () => {
    // Warning signal resume nil; la siguiente sentencia evalúa a 5.
    expect(printString(evalSt("Warning signal. 5"))).toBe("5");
  });
});

describe("L5 · isResumable por clase (apoya #10/#19 y los negativos)", () => {
  it("Error new isResumable => false; Warning new isResumable => true; Exception base => false", () => {
    expect(printString(evalSt("Error new isResumable"))).toBe("false");
    expect(printString(evalSt("Warning new isResumable"))).toBe("true");
    expect(printString(evalSt("Exception new isResumable"))).toBe("false");
  });
});

describe("L5 · negativo #1 — resume de Error (no resumable) señala Error concreto", () => {
  // origen=ingeniería / política (NO conformidad ANSI): ruta al log de desviaciones L6.
  it("e resume: 1 sobre un Error capturado lanza un error de host", () => {
    expect(() => evalSt("[Error signal] on: Error do: [:e | e resume: 1]")).toThrow(
      /no resumable|resum/i,
    );
  });
});

describe("L5 · negativo #2 — resume: sobre Exception base (no resumable) señala Error concreto", () => {
  // misma política origen=ingeniería que el negativo #1.
  it("e resume: 1 sobre una Exception base capturada lanza un error de host", () => {
    expect(() => evalSt("[Exception signal] on: Exception do: [:e | e resume: 1]")).toThrow(
      /no resumable|resum/i,
    );
  });
});

describe("L5 · negativo #3 — return/retry/resume fuera de un handler activo = error", () => {
  it("return: fuera de un handler activo lanza", () => {
    expect(() => evalSt("Error new return: 5")).toThrow(/handler activo|active/i);
  });

  it("retry fuera de un handler activo lanza", () => {
    expect(() => evalSt("Error new retry")).toThrow(/handler activo|active/i);
  });

  it("resume: fuera de un handler activo lanza (se chequea el handler antes que la resumabilidad)", () => {
    expect(() => evalSt("Warning new resume: 1")).toThrow(/handler activo|active/i);
  });

  // Regresión: una instancia STASHEADA y RE-MANEJADA no debe quedar con un
  // activeHandler obsoleto. Tras salir su handler block, return:/retry/resume:
  // sobre la MISMA instancia deben re-disparar el guard (no hacer no-op a nil).
  it("return: sobre una instancia ya manejada (activeHandler obsoleto) lanza", () => {
    expect(() =>
      evalSt("| s | [Error signal] on: Error do: [:e | s := e. e return: 0]. s return: 5"),
    ).toThrow(/handler activo|active/i);
  });

  it("retry sobre una instancia ya manejada (activeHandler obsoleto) lanza", () => {
    expect(() =>
      evalSt("| s | [Error signal] on: Error do: [:e | s := e. e return: 0]. s retry"),
    ).toThrow(/handler activo|active/i);
  });

  it("resume: sobre una instancia ya resumida (activeHandler obsoleto) lanza", () => {
    expect(() =>
      evalSt("| s | [Warning signal] on: Warning do: [:e | s := e. e resume: 0]. s resume: 5"),
    ).toThrow(/handler activo|active/i);
  });
});

describe("L5 · cierre de integración ZeroDivide (manual; la aritmética // es L4)", () => {
  it("ZeroDivide signal capturado por on: ZeroDivide do: (tipo exacto)", () => {
    expect(printString(evalSt("[ZeroDivide signal] on: ZeroDivide do: [:e | 1]"))).toBe("1");
  });

  it("ZeroDivide signal capturado por on: ArithmeticError do: (supertipo, isKindOf:)", () => {
    expect(printString(evalSt("[ZeroDivide signal] on: ArithmeticError do: [:e | 2]"))).toBe("2");
  });

  it("ZeroDivide signal: con texto capturado y messageText recuperable", () => {
    const src = "[ZeroDivide signal: 'div0'] on: ArithmeticError do: [:e | e messageText]";
    expect(printString(evalSt(src))).toBe("div0");
  });
});

describe("L5 · los 12 selectores núcleo del gate están instalados y alcanzables (conteo === 12)", () => {
  it("exactamente los 12 selectores §6.1 viven en sus methodDict (BlockClosure + Exception)", () => {
    const { universe: u } = evalWith("3");
    const exception = u.namespace.get("Exception");
    expect(exception).toBeDefined();
    const exc = exception as NonNullable<typeof exception>;
    const blockSelectors = ["on:do:", "ensure:", "ifCurtailed:"];
    const exceptionSelectors = [
      "signal",
      "signal:",
      "return",
      "return:",
      "retry",
      "retryUsing:",
      "resume",
      "resume:",
      "pass",
    ];
    let count = 0;
    for (const sel of blockSelectors) {
      if (u.BlockClosure.methodDict.has(u.symbols.intern(sel))) count++;
    }
    for (const sel of exceptionSelectors) {
      // signal/signal: viven en la metaclase de Exception (lado-clase); el resto en
      // el lado-instancia (Exception.methodDict). Cualquiera de los dos cuenta.
      const onInstance = exc.methodDict.has(u.symbols.intern(sel));
      const onMeta = exc.class.methodDict.has(u.symbols.intern(sel));
      if (onInstance || onMeta) count++;
    }
    expect(count).toBe(12);
  });
});
