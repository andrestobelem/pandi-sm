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
  // Lista de temporaries `| ident* |` sin el `|` de cierre. Sin este diagnóstico,
  // `| x y z` tragaba los identificadores como temps en silencio (cambiando la
  // semántica del programa: un global como SmallInteger quedaba shadowed por nil).
  | "E_UNCLOSED_TEMPS"
  | "E_KEYWORD_NO_ARG"
  | "E_CASCADE_NO_RECEIVER"
  | "E_BYTE_RANGE"
  // Anidación patológica que desborda el stack de V8 (descenso recursivo sin TCO):
  // parse() lo mapea a este error determinista en vez de propagar el RangeError
  // (R10: parse() NUNCA lanza). Ver DEV-019.
  | "E_NESTING_LIMIT";

export interface ParseError {
  code: ParseErrorCode;
  span: SourceSpan;
  message: string;
}
