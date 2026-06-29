// L3 · printString — representación textual MÍNIMA para el skeleton (plan §5.3).
// number -> String(n); bigint -> n.toString(); string -> los chars tal cual;
// nil -> "nil"; otros STObject -> "a ClassName" (default Smalltalk).
// El protocolo printOn:/displayString completo es L3-proper (diferido).

import { isArray, isCharacter, isFloat, type STValue } from "../runtime/index.js";

/** Imprime un double con punto SIEMPRE: 3.0 => "3.0" (distinguible de SmallInteger 3). */
function printFloat(n: number): string {
  if (!Number.isFinite(n)) return String(n); // Infinity/NaN tal cual (raros en el MVP)
  const s = String(n);
  // Magnitud en notación exponencial (|n| >= 1e21): String(n) ya da p.ej. "1e+21"
  // (entero PERO con exponente). NO añadir ".0" -> daría "1e+21.0", malformado e
  // imparseable. El 'e' ya distingue el Float del SmallInteger; normalizamos el '+'
  // del exponente JS ("1e+21" -> "1e21", forma Smalltalk; "1e-7" queda igual).
  if (s.includes("e") || s.includes("E")) return s.replace("e+", "e");
  // Sin punto ni exponente => entero exacto (3.0, 1000): forzamos ".0" para que un
  // Float boxed nunca colisione con la impresión de un SmallInteger.
  return s.includes(".") ? s : `${s}.0`;
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
  // L4 F4 · Array boxed => forma literal "#(e1 e2 …)" (Pharo): cada elemento por su
  // propio printString, separados por espacio; vacío => "#()". ANTES del default
  // "a ClassName" para que el bridge host concuerde con el send printString.
  if (isArray(value)) return `#(${value.elements.map(printString).join(" ")})`;
  // STObject: `nil` (única instancia de UndefinedObject) imprime "nil"; el resto
  // usa el default Smalltalk "a ClassName" (printOn:/displayString son L3-proper).
  if (value.class.name === "UndefinedObject") return "nil";
  return `a ${value.class.name}`;
}
