// L3 · printString — representación textual MÍNIMA para el skeleton (plan §5.3).
// number -> String(n); bigint -> n.toString(); string -> los chars tal cual;
// nil -> "nil"; otros STObject -> "a ClassName" (default Smalltalk).
// El protocolo printOn:/displayString completo es L3-proper (diferido).

import {
  isArray,
  isCharacter,
  isFloat,
  isInterval,
  isString,
  type STValue,
} from "../runtime/index.js";

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
  // L4 F5 · String boxed => sus chars tal cual (el harness compara con ===). ANTES de la
  // rama de objeto y de isFloat/isCharacter. La rama de string JS NATIVO de abajo se conserva
  // como red de seguridad para los string internos (send("hi", "printString") en tests de bajo
  // nivel, class.name que aún fluyan nativos): ambos imprimen su texto.
  if (isString(value)) return value.chars;
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
  // OrderedCollection comparte el campo `elements` con Array, así que isArray() la captura;
  // se distingue por la clase para imprimir la forma Pharo "an OrderedCollection(1 2 3)".
  if (isArray(value)) {
    const inner = value.elements.map(printString).join(" ");
    if (value.class.name === "OrderedCollection") return `an OrderedCollection(${inner})`;
    return `#(${inner})`;
  }
  // L4 F4/S3 · Interval COMPUTADO => forma Pharo "(1 2 3 4 5)": los términos materializados
  // entre paréntesis, separados por espacio (vacío => "()"). ANTES del default "an Interval".
  if (isInterval(value)) {
    const terms: string[] = [];
    // Iteramos por la CANTIDAD de términos (espejo de intervalLength en primitives.ts), NO
    // por `v += by` con condición `v <= to`. Razón (DRIFT-L4): si `by` fuera 0 o sub-ulp
    // (p.ej. un extremo enorme donde `v + by === v` en double), el bucle por suma NUNCA
    // avanzaría y empujaría términos sin fin (RangeError "Invalid array length"). Contar los
    // términos primero acota el bucle SIEMPRE; un `by` 0/NaN da count 0 (Interval vacío).
    const span = value.to - value.from;
    const count = value.by !== 0 ? Math.floor(span / value.by) + 1 : 0;
    for (let k = 0; k < count; k++) {
      terms.push(printString(value.from + k * value.by));
    }
    return `(${terms.join(" ")})`;
  }
  // STObject: `nil` (única instancia de UndefinedObject) imprime "nil"; el resto
  // usa el default Smalltalk "a ClassName" (printOn:/displayString son L3-proper).
  if (value.class.name === "UndefinedObject") return "nil";
  return `a ${value.class.name}`;
}
