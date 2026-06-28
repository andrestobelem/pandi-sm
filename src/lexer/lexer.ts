// L1 · Lexer — escáner a mano, iteración por code point (R1).
// SLICE 1: trivia (whitespace + comentarios), puntuación/operadores,
// identifier/keyword/`:=`/`:`, decimalInteger (+ promoción BigInt), binarySelector/`|`.
// SLICE 2: número completo — radix/float (e/d/q)/scaledDecimal + `-` negativo por
// posición (R2/CORR-1), backtrack de exponente y E_EXPONENT_MALFORMED (R7).
// SLICE 3: strings `'...'` (escape `''`) y caracteres `$c` (surrogate-safe).
// Pendiente (slices siguientes): símbolos, #( ) #[ ].

import type { Position } from "../ast/nodes.js";
import type { LexError, LexErrorCode } from "./errors.js";
import type { Token, TokenType } from "./tokens.js";

const CP_LF = 0x0a;
const CP_CR = 0x0d;
const CP_COLON = 0x3a;
const CP_EQUALS = 0x3d;
const CP_QUOTE = 0x22; // "
const CP_APOSTROPHE = 0x27; // '
const CP_DOLLAR = 0x24; // $
const CP_MINUS = 0x2d; // -
const CP_PERIOD = 0x2e; // .
const CP_R = 0x72; // r (radix)
const CP_S = 0x73; // s (scaledDecimal)
const CP_PLUS = 0x2b; // +
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

// Letra de exponente float (R7): `e`/`d`/`q`, mayúsc/minúsc.
function isExponentMarker(cp: number): boolean {
  return cp === 0x65 || cp === 0x45 || cp === 0x64 || cp === 0x44 || cp === 0x71 || cp === 0x51;
}

// Valor de un dígito radix (R4): 0-9 A-Z (case-insensitive) ⇒ 0..35, o -1 si no aplica.
function radixDigitValue(cp: number): number {
  if (cp >= ZERO && cp <= NINE) return cp - ZERO;
  if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41 + 10; // A-Z
  if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61 + 10; // a-z
  return -1;
}

// Promoción por magnitud (R4): number nativo si |n| ≤ 2^53-1, si no bigint.
function promoteInteger(mag: bigint, negative: boolean): number | bigint {
  const signed = negative ? -mag : mag;
  return mag <= MAX_SAFE ? Number(signed) : signed;
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

    if (isDigit(c)) return this.scanNumber(start, false);
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
      case CP_APOSTROPHE: // ' → string (R5/slice3)
        return this.scanString(start);
      case CP_DOLLAR: // $ → character (R5/slice3)
        return this.scanCharacter(start);
    }

    // `-` negativo léxico (R2/CORR-1): sólo si va pegado a dígito (o `.`dígito) Y
    // estamos en posición de operando. Si no, cae a binarySelector (maximal-munch
    // ⇒ `--`, `-=`). DEBE ir ANTES del fallthrough de BINARY_CHARS.
    if (c === CP_MINUS && this.operandPosition() && this.startsNumberAfterSign()) {
      this.advance(); // '-'
      return this.scanNumber(start, true);
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

  // Posición de operando (R2): el `-` inicia literal negativo sólo si el token
  // previo deja al lexer esperando un operando. Sin trivia en `tokens`, el último
  // token empujado ES el último significativo. Tokens de VALOR ⇒ `-` binario.
  private operandPosition(): boolean {
    const prev = this.tokens[this.tokens.length - 1];
    if (prev === undefined) return true; // inicio de input
    switch (prev.type) {
      case "lparen":
      case "lbracket":
      case "dynArrayOpen":
      case "arrayOpen":
      case "binarySelector":
      case "keyword":
      case "assignmentOperator":
      case "returnOperator":
      case "period":
      case "semicolon":
      case "verticalBar":
        return true;
      default:
        return false; // number/identifier/`)`/`]`/`}`/string/char/symbol/colon…
    }
  }

  // El `-` (this.i) va pegado a un dígito, o a `.`dígito ⇒ es un literal numérico.
  private startsNumberAfterSign(): boolean {
    const next = this.cpAt(this.i + 1);
    if (isDigit(next)) return true;
    return next === CP_PERIOD && isDigit(this.cpAt(this.i + 2));
  }

  // Autómata numérico (R4/R7): decimalInteger | radix | float (e/d/q) | scaledDecimal.
  // `start` apunta al inicio del lexema (incl. `-` si negative). `this.i` ya pasó el `-`.
  private scanNumber(start: Position, negative: boolean): void {
    let acc = 0n;
    while (isDigit(this.peek())) {
      acc = acc * 10n + BigInt(this.peek() - ZERO);
      this.advance();
    }

    // radix (R4): `<base>r<digits>` — acumula en BigInt, degrada por magnitud.
    if (this.peek() === CP_R) {
      return this.scanRadix(start, negative, acc);
    }

    // fracción (R7): `.` se consume sólo si va seguido de dígito (puede ser de un
    // float o de la mantissa de un scaledDecimal — `1.5s2` es válido).
    let isFloat = false;
    if (this.peek() === CP_PERIOD && isDigit(this.cpAt(this.i + 1))) {
      isFloat = true;
      this.advance(); // '.'
      while (isDigit(this.peek())) this.advance();
    }

    // scaledDecimal (R4/DEV-011): sufijo `s` cierra la mantissa con scale opcional.
    // Tiene prioridad sobre el exponente (un scaledDecimal no lleva e/d/q).
    if (this.peek() === CP_S) return this.scanScaled(start, negative);

    // exponente (R7): `e`/`d`/`q` consumido sólo si va seguido de `[+-]?digit`.
    if (isExponentMarker(this.peek())) {
      const after = this.cpAt(this.i + 1);
      const hasSign = after === CP_PLUS || after === CP_MINUS;
      const digitAt = hasSign ? this.cpAt(this.i + 2) : after;
      if (isDigit(digitAt)) {
        isFloat = true;
        this.advance(); // letra
        if (hasSign) this.advance(); // signo
        while (isDigit(this.peek())) this.advance();
      } else if (hasSign) {
        // `1.5e+` / `1e-`: letra+signo SIN dígito ⇒ negativo real (R7/R10).
        this.advance(); // letra
        this.advance(); // signo
        return this.error("E_EXPONENT_MALFORMED", start, "exponente sin dígitos");
      }
      // si no hay dígito y no hay signo: backtrack — la letra queda como identifier.
    }

    if (isFloat) return this.emitFloat(start);

    // entero decimal (R4).
    const end = this.pos();
    this.tokens.push({
      type: "number",
      lexeme: this.src.slice(start.offset, end.offset),
      value: promoteInteger(acc, negative),
      numKind: "integer",
      span: { start, end },
    });
  }

  // radix (R4): base ya en `base`; valida base∈[2,36], dígitos<base, ≥1 dígito.
  private scanRadix(start: Position, negative: boolean, base: bigint): void {
    this.advance(); // 'r'
    let acc = 0n;
    let count = 0;
    for (;;) {
      const v = radixDigitValue(this.peek());
      if (v === -1) break;
      if (base >= 2n && BigInt(v) >= base) {
        this.advance();
        return this.error("E_RADIX_DIGIT", start, "dígito ≥ base en literal radix");
      }
      acc = acc * base + BigInt(v);
      count++;
      this.advance();
    }
    if (base < 2n || base > 36n) {
      return this.error("E_RADIX_BASE", start, "base de radix fuera de [2,36]");
    }
    if (count === 0) {
      return this.error("E_RADIX_NO_DIGITS", start, "literal radix sin dígitos");
    }
    const end = this.pos();
    this.tokens.push({
      type: "number",
      lexeme: this.src.slice(start.offset, end.offset),
      value: promoteInteger(acc, negative),
      numKind: "integer",
      span: { start, end },
    });
  }

  // float (R4): value = parseFloat con `d`/`q`→`e` (parseFloat no entiende d/q).
  private emitFloat(start: Position): void {
    const end = this.pos();
    const raw = this.src.slice(start.offset, end.offset);
    const value = Number.parseFloat(raw.replace(/[dq]/i, "e"));
    const marker = raw.match(/[edqEDQ]/)?.[0]?.toLowerCase();
    const floatKind = marker === "d" ? "d" : marker === "q" ? "q" : marker === "e" ? "e" : undefined;
    this.tokens.push({
      type: "number",
      lexeme: raw,
      value,
      numKind: "float",
      ...(floatKind !== undefined ? { floatKind } : {}),
      span: { start, end },
    });
  }

  // string (slice3): '...' con escape '' para comilla literal (R5).
  // value = contenido DESESCAPADO; lexeme = fuente crudo incluyendo comillas.
  private scanString(start: Position): void {
    this.advance(); // comilla de apertura
    let value = "";
    for (;;) {
      if (this.atEnd) {
        this.error("E_UNTERMINATED_STRING", start, "string sin cerrar");
        return;
      }
      const c = this.peek();
      if (c === CP_APOSTROPHE) {
        this.advance(); // comilla
        if (this.peek() === CP_APOSTROPHE) {
          // '' → comilla literal
          this.advance();
          value += "'";
          continue;
        }
        // comilla de cierre
        break;
      }
      value += String.fromCodePoint(c);
      this.advance();
    }
    const end = this.pos();
    this.tokens.push({
      type: "string",
      lexeme: this.src.slice(start.offset, end.offset),
      value,
      span: { start, end },
    });
  }

  // character (slice3): $c — consume un code point completo vía advance() (surrogate-safe,
  // decisions-modelo (a)). `$` al final de input → E_UNTERMINATED_CHAR.
  private scanCharacter(start: Position): void {
    this.advance(); // '$'
    if (this.atEnd) {
      this.error("E_UNTERMINATED_CHAR", start, "carácter sin valor");
      return;
    }
    const cp = this.peek();
    this.advance(); // code point (BMP o astral)
    const end = this.pos();
    this.tokens.push({
      type: "character",
      lexeme: this.src.slice(start.offset, end.offset),
      value: String.fromCodePoint(cp),
      span: { start, end },
    });
  }

  // scaledDecimal (R4/DEV-011): value = mantissa string (exacta), scale = dígitos
  // fraccionales declarados tras `s`, o los de la mantissa si se omite.
  private scanScaled(start: Position, _negative: boolean): void {
    const mantissaEnd = this.i; // antes de consumir 's'
    const mantissa = this.src.slice(start.offset, mantissaEnd);
    this.advance(); // 's'
    let scale = 0;
    let declared = false;
    while (isDigit(this.peek())) {
      scale = scale * 10 + (this.peek() - ZERO);
      declared = true;
      this.advance();
    }
    if (!declared) {
      // scale por defecto = dígitos fraccionales de la mantissa (0 si entero).
      const dot = mantissa.indexOf(".");
      scale = dot === -1 ? 0 : mantissa.length - dot - 1;
    }
    const end = this.pos();
    this.tokens.push({
      type: "number",
      lexeme: this.src.slice(start.offset, end.offset),
      value: mantissa,
      numKind: "scaledDecimal",
      scale,
      span: { start, end },
    });
  }
}

/** Tokeniza el fuente Smalltalk. Errores van a `errors[]` (rechazo determinista, no excepciones). */
export function tokenize(source: string): { tokens: Token[]; errors: LexError[] } {
  return new Lexer(source).tokenize();
}
