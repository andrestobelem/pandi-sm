// L1 · Lexer — tipos de Token. Catálogo de `type` (R10/lexical). El valor numérico
// concreto (number|bigint) y los sub-discriminantes los aporta el escáner numérico.

import type { SourceSpan } from "../ast/nodes.js";

export type TokenType =
  | "identifier"
  | "keyword" // `id:`
  | "binarySelector"
  | "assignmentOperator" // `:=`
  | "returnOperator" // `^`
  | "verticalBar" // `|` aislado (rol lo decide el parser)
  | "colon" // `:` que no forma keyword ni `:=` (p.ej. block argument)
  | "number"
  | "character" // `$c`
  | "string" // `'...'`
  | "symbol" // `#sym`, `#at:put:`, `#+`, `#'...'`
  | "arrayOpen" // `#(`
  | "byteArrayOpen" // `#[`  (ext)
  | "dynArrayOpen" // `{`    (ext)
  | "dynArrayClose" // `}`   (ext)
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "period"
  | "semicolon"
  | "eof";

export interface Token {
  type: TokenType;
  lexeme: string;
  value?: number | bigint | string;
  numKind?: "integer" | "float" | "scaledDecimal";
  floatKind?: "e" | "d" | "q";
  scale?: number;
  origin?: "ext:pharo-squeak";
  span: SourceSpan;
}
