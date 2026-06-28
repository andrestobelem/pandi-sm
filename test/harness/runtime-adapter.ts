// Host-runner · contrato RuntimeAdapter (L0).
//
// El runner host evalúa fragmentos `.st` a través de este contrato. L1 aportará
// `parse` y L3 aportará `evaluate`; en L0 sólo existe el stub, que falla limpio.
// Vive bajo `test/` (infra de host-runner), no bajo `src/`: la topología de
// carpetas de capa (`src/lexer`, `src/ast`) se mantiene mínima en el día 0.

export interface RuntimeAdapter {
  /** Texto fuente → AST (lo aporta L1). */
  parse(src: string): unknown;
  /** Texto fuente → resultado con su `printString` (lo aporta L3). */
  evaluate(src: string): { printString: string };
}

/** Señala una capacidad cuya capa aún no aterrizó. Sale con un fallo claro. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`pandi-sm: ${what} aún no implementado (llega con su capa).`);
    this.name = "NotImplementedError";
  }
}

/**
 * Adapter stub de L0. La tubería real (L1 `parse` + L3 `evaluate`) lo reemplaza
 * cuando esas capas estén verdes; mientras tanto, el corpus `.st` real no se activa.
 */
export class StubRuntimeAdapter implements RuntimeAdapter {
  parse(_src: string): unknown {
    throw new NotImplementedError("parse (L1)");
  }

  evaluate(_src: string): { printString: string } {
    throw new NotImplementedError("evaluate (L3)");
  }
}
