// L1 · Lexer — errores estructurados (R10). Rechazo determinista: code + span,
// nunca excepción no tipada (van a `errors[]`).

import type { SourceSpan } from "../ast/nodes.js";

export type LexErrorCode =
  | "E_UNTERMINATED_STRING"
  | "E_UNTERMINATED_COMMENT"
  | "E_UNTERMINATED_CHAR"
  | "E_EMPTY_SYMBOL"
  | "E_RADIX_BASE"
  | "E_RADIX_DIGIT"
  | "E_RADIX_NO_DIGITS"
  | "E_EXPONENT_MALFORMED"
  | "E_UNEXPECTED_CHAR";

export interface LexError {
  code: LexErrorCode;
  span: SourceSpan;
  message: string;
}
