// L1 · Lexer — escáner a mano, iteración por code point (R1).
// SLICE 1: trivia (whitespace + comentarios), puntuación/operadores,
// identifier/keyword/`:=`/`:`, decimalInteger (+ promoción BigInt), binarySelector/`|`.
// Pendiente (slices siguientes): radix/float/scaled, strings, `$c`, símbolos, #( ) #[ ],
// y la regla del `-` negativo por posición (R2).

import type { Position } from "../ast/nodes.js";
import type { LexError, LexErrorCode } from "./errors.js";
import type { Token, TokenType } from "./tokens.js";

const CP_LF = 0x0a;
const CP_CR = 0x0d;
const CP_COLON = 0x3a;
const CP_EQUALS = 0x3d;
const CP_QUOTE = 0x22; // "
const ZERO = 0x30;
const NINE = 0x39;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// Conjunto AUTORITATIVO de binaryCharacter (A.1, 16 chars). Incluye `|` y `-`.
const BINARY_CHARS = new Set<number>(
  [..."~!@%&*+,/<=>?\\|-"].map((c) => c.codePointAt(0) as number),
);

function isDigit(cp: number): boolean {
  return cp >= ZERO && cp <= NINE;
}

// `letter` = [A-Za-z] + `_` (de-facto Pharo/Squeak, DEV-014). ASCII solo.
function isLetter(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0x5f;
}

function isWhitespace(cp: number): boolean {
  return cp === 0x20 || cp === 0x09 || cp === CP_LF || cp === CP_CR || cp === 0x0c;
}

class Lexer {
  private i = 0; // offset en unidades UTF-16 (R1)
  private line = 1;
  private col = 1; // columna en code points (R1)
  readonly tokens: Token[] = [];
  readonly errors: LexError[] = [];

  constructor(private readonly src: string) {}

  private get atEnd(): boolean {
    return this.i >= this.src.length;
  }

  private cpAt(idx: number): number {
    const c = this.src.codePointAt(idx);
    return c === undefined ? -1 : c;
  }

  private peek(): number {
    return this.cpAt(this.i);
  }

  private pos(): Position {
    return { offset: this.i, line: this.line, column: this.col };
  }

  /** Consume un code point, actualizando offset/line/column (CR/CRLF/LF = 1 salto). */
  private advance(): number {
    const c = this.cpAt(this.i);
    if (c === -1) return -1;
    this.i += c >= 0x10000 ? 2 : 1;
    if (c === CP_LF) {
      this.line++;
      this.col = 1;
    } else if (c === CP_CR) {
      this.line++;
      this.col = 1;
      if (this.cpAt(this.i) === CP_LF) this.i += 1; // \r\n = 1 salto
    } else {
      this.col++;
    }
    return c;
  }

  private simple(type: TokenType, start: Position): void {
    const end = this.pos();
    this.tokens.push({ type, lexeme: this.src.slice(start.offset, end.offset), span: { start, end } });
  }

  private error(code: LexErrorCode, start: Position, message: string): void {
    this.errors.push({ code, span: { start, end: this.pos() }, message });
  }

  tokenize(): { tokens: Token[]; errors: LexError[] } {
    for (;;) {
      this.skipTrivia();
      if (this.atEnd) break;
      this.scanToken();
    }
    const end = this.pos();
    this.tokens.push({ type: "eof", lexeme: "", span: { start: end, end } });
    return { tokens: this.tokens, errors: this.errors };
  }

  private skipTrivia(): void {
    for (;;) {
      const c = this.peek();
      if (isWhitespace(c)) {
        this.advance();
        continue;
      }
      if (c === CP_QUOTE) {
        this.skipComment();
        continue;
      }
      return;
    }
  }

  private skipComment(): void {
    const start = this.pos();
    this.advance(); // "
    for (;;) {
      if (this.atEnd) {
        this.error("E_UNTERMINATED_COMMENT", start, "comentario sin cerrar");
        return;
      }
      if (this.peek() === CP_QUOTE) {
        this.advance();
        if (this.peek() === CP_QUOTE) {
          this.advance(); // "" escape: comilla doble literal interior
          continue;
        }
        return; // " de cierre
      }
      this.advance();
    }
  }

  private scanToken(): void {
    const start = this.pos();
    const c = this.peek();

    if (isDigit(c)) return this.scanDecimalInteger(start);
    if (isLetter(c)) return this.scanIdentifierOrKeyword(start);

    switch (c) {
      case CP_COLON:
        return this.scanColonOrAssign(start);
      case 0x5e: // ^
        this.advance();
        return this.simple("returnOperator", start);
      case 0x28: // (
        this.advance();
        return this.simple("lparen", start);
      case 0x29: // )
        this.advance();
        return this.simple("rparen", start);
      case 0x5b: // [
        this.advance();
        return this.simple("lbracket", start);
      case 0x5d: // ]
        this.advance();
        return this.simple("rbracket", start);
      case 0x7b: // {  (ext)
        this.advance();
        this.tokens.push({
          type: "dynArrayOpen",
          lexeme: "{",
          origin: "ext:pharo-squeak",
          span: { start, end: this.pos() },
        });
        return;
      case 0x7d: // }  (ext)
        this.advance();
        this.tokens.push({
          type: "dynArrayClose",
          lexeme: "}",
          origin: "ext:pharo-squeak",
          span: { start, end: this.pos() },
        });
        return;
      case 0x2e: // .
        this.advance();
        return this.simple("period", start);
      case 0x3b: // ;
        this.advance();
        return this.simple("semicolon", start);
    }

    if (BINARY_CHARS.has(c)) return this.scanBinarySelector(start);

    this.advance();
    this.error("E_UNEXPECTED_CHAR", start, `carácter inesperado: ${JSON.stringify(String.fromCodePoint(c))}`);
  }

  private scanIdentifierOrKeyword(start: Position): void {
    while (isLetter(this.peek()) || isDigit(this.peek())) this.advance();
    // keyword = identifier ':' pegado, salvo que sea ':=' (R3).
    if (this.peek() === CP_COLON && this.cpAt(this.i + 1) !== CP_EQUALS) {
      this.advance(); // ':'
      return this.simple("keyword", start);
    }
    return this.simple("identifier", start);
  }

  private scanColonOrAssign(start: Position): void {
    this.advance(); // ':'
    if (this.peek() === CP_EQUALS) {
      this.advance(); // '='
      return this.simple("assignmentOperator", start);
    }
    return this.simple("colon", start);
  }

  private scanBinarySelector(start: Position): void {
    while (BINARY_CHARS.has(this.peek())) this.advance();
    // `|` aislado => verticalBar; runs más largos (`||`, `<=`) => binarySelector (R10/lexical §4.4).
    const lexeme = this.src.slice(start.offset, this.i);
    return this.simple(lexeme === "|" ? "verticalBar" : "binarySelector", start);
  }

  private scanDecimalInteger(start: Position): void {
    let acc = 0n;
    while (isDigit(this.peek())) {
      acc = acc * 10n + BigInt(this.peek() - ZERO);
      this.advance();
    }
    const value = acc <= MAX_SAFE ? Number(acc) : acc; // promoción BigInt (R4)
    const end = this.pos();
    this.tokens.push({
      type: "number",
      lexeme: this.src.slice(start.offset, end.offset),
      value,
      numKind: "integer",
      span: { start, end },
    });
  }
}

/** Tokeniza el fuente Smalltalk. Errores van a `errors[]` (rechazo determinista, no excepciones). */
export function tokenize(source: string): { tokens: Token[]; errors: LexError[] } {
  return new Lexer(source).tokenize();
}
