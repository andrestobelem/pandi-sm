// L3 · printString — representación textual MÍNIMA para el skeleton (plan §5.3).
// number -> String(n); bigint -> n.toString(); string -> los chars tal cual;
// nil -> "nil"; otros STObject -> "a ClassName" (default Smalltalk).
// El protocolo printOn:/displayString completo es L3-proper (diferido).

import { isCharacter, isFloat, type STValue } from "../runtime/index.js";

/** Imprime un double con punto SIEMPRE: 3.0 => "3.0" (distinguible de SmallInteger 3). */
function printFloat(n: number): string {
  if (!Number.isFinite(n)) return String(n); // Infinity/NaN tal cual (raros en el MVP)
  // Number.isInteger(3.0) es true: String(3.0) daría "3"; forzamos el ".0" para que
  // un Float boxed nunca colisione con la impresión de un SmallInteger.
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/** printString(value): texto que el harness compara con === (p.ej. "14"). */
export function printString(value: STValue): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  // STSymbol (plain object {text}, sin slot `class`): imprime "#text" (ANSI).
  if (typeof value === "object" && !("class" in value)) return `#${value.text}`;
  // L4 F2 · Float boxed => "3.0"/"3.14"; Character boxed => "$a" (ANSI). ANTES del
  // default "a ClassName" para que el bridge host concuerde con el send printString.
  if (isFloat(value)) return printFloat(value.floatValue);
  if (isCharacter(value)) return `$${String.fromCodePoint(value.codePoint)}`;
  // STObject: `nil` (única instancia de UndefinedObject) imprime "nil"; el resto
  // usa el default Smalltalk "a ClassName" (printOn:/displayString son L3-proper).
  if (value.class.name === "UndefinedObject") return "nil";
  return `a ${value.class.name}`;
}
