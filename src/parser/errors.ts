// L1 · Parser — errores estructurados (R10). Espejo EXACTO de src/lexer/errors.ts:
// rechazo determinista (code + span), nunca excepción no tipada (van a `errors[]`).

import type { SourceSpan } from "../ast/nodes.js";

export type ParseErrorCode =
  | "E_UNEXPECTED_TOKEN"
  | "E_UNCLOSED_PAREN"
  | "E_UNCLOSED_BLOCK"
  | "E_UNCLOSED_ARRAY"
  | "E_UNCLOSED_BYTEARRAY"
  | "E_UNCLOSED_DYNARRAY"
  | "E_KEYWORD_NO_ARG"
  | "E_CASCADE_NO_RECEIVER"
  | "E_BYTE_RANGE";

export interface ParseError {
  code: ParseErrorCode;
  span: SourceSpan;
  message: string;
}
