// L3 · printString — representación textual MÍNIMA para el skeleton (plan §5.3).
// number -> String(n); bigint -> n.toString(); string -> los chars tal cual.
// El protocolo printOn:/displayString completo es L3-proper (diferido).

import type { STValue } from "../runtime/index.js";

/** printString(value): texto que el harness compara con === (p.ej. "14"). */
export function printString(value: STValue): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  // booleans/STObject no aparecen como resultado en el skeleton; fallback textual.
  return String(value);
}
