// L2 · SymbolTable — interning de selectores con identidad (== por referencia).
// Plan §5.2 (decisión clave: tabla de interning propia). El skeleton (S1) sólo
// necesita que dos intern del mismo texto devuelvan el MISMO objeto y textos
// distintos objetos distintos; eso basta para que send() (L3) compare por
// identidad sin depender de igualdad estructural de strings.

/** Símbolo interno: identidad estable; `text` es el lexema del selector. */
export interface STSymbol {
  readonly text: string;
}

/** SymbolId = el STSymbol interned (identidad ==). Selectores se internean antes del dispatch. */
export type SymbolId = STSymbol;

export class SymbolTable {
  private readonly table = new Map<string, STSymbol>();

  /** Devuelve el símbolo único para `text` (idempotente por instancia). */
  intern(text: string): STSymbol {
    const existing = this.table.get(text);
    if (existing !== undefined) return existing;
    const sym: STSymbol = { text };
    this.table.set(text, sym);
    return sym;
  }
}
