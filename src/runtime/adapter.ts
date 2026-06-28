// L3 · RuntimeAdapter real — cablea L1 (parse) + L3 (eval) para el host-runner.
// Reemplaza el StubRuntimeAdapter de L0: cada evaluate() corre sobre un Universe
// fresco (evalWith), así el buffer del Transcript no se filtra entre fragmentos.
// El contrato mínimo del runner es evaluate(src) -> { printString }; además
// exponemos el efecto del Transcript (buffer en memoria) para aserciones.

import { evalWith, printString } from "../eval/index.js";
import { parse } from "../parser/index.js";

/** Resultado de evaluar un fragmento: su printString + el buffer del Transcript. */
export interface AdapterResult {
  /** printString del valor del último statement (lo que el harness compara con ===). */
  printString: string;
  /** Texto acumulado por Transcript>>show: durante esta evaluación ("" si nada). */
  transcript: string;
}

/** Adapter real de la tubería pandi-sm: parse (L1) + evaluate (L3). */
export class PandiRuntimeAdapter {
  /** Texto fuente → AST (delega en L1; útil para el corpus phase: parse). */
  parse(src: string): unknown {
    return parse(src);
  }

  /** Texto fuente → printString del último valor + efecto del Transcript. */
  evaluate(src: string): AdapterResult {
    const { value, universe } = evalWith(src);
    const buffer = universe.Transcript.pointers[0];
    return {
      printString: printString(value),
      transcript: typeof buffer === "string" ? buffer : "",
    };
  }
}
