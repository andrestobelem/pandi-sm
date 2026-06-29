// L3 · printString — representación textual MÍNIMA para el skeleton (plan §5.3).
// number -> String(n); bigint -> n.toString(); string -> los chars tal cual;
// nil -> "nil"; otros STObject -> "a ClassName" (default Smalltalk).
// El protocolo printOn:/displayString completo es L3-proper (diferido).

import type { STValue } from "../runtime/index.js";

/** printString(value): texto que el harness compara con === (p.ej. "14"). */
export function printString(value: STValue): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  // STSymbol (plain object {text}, sin slot `class`): imprime "#text" (ANSI).
  if (typeof value === "object" && !("class" in value)) return `#${value.text}`;
  // STObject: `nil` (única instancia de UndefinedObject) imprime "nil"; el resto
  // usa el default Smalltalk "a ClassName" (printOn:/displayString son L3-proper).
  if (value.class.name === "UndefinedObject") return "nil";
  return `a ${value.class.name}`;
}
