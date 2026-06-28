// L1 · Parser — descenso recursivo sobre Token[] del lexer. SLICE P1: scaffold +
// núcleo de precedencia Smalltalk (R8): primary -> unary -> binary -> keyword.
// unary liga más fuerte que binary, binary más que keyword; los binarios son
// left-assoc SIN precedencia entre sí. parsePrimary cubre literales, variable y
// `( expr )` con E_UNCLOSED_PAREN. Rechazo determinista: errores a `errors[]`.

import type {
  AssignmentNode,
  Expression,
  LiteralKind,
  LiteralNode,
  MessageSendNode,
  Position,
  ProgramNode,
  SequenceNode,
  SourceSpan,
  Statement,
  VariableNode,
} from "../ast/nodes.js";
import { tokenize } from "../lexer/index.js";
import type { LexError } from "../lexer/index.js";
import type { Token } from "../lexer/index.js";
import type { ParseError, ParseErrorCode } from "./errors.js";

// Mapeo numKind del token -> LiteralKind del nodo (R11). Identidad para los tres.
const NUM_KIND: Record<NonNullable<Token["numKind"]>, LiteralKind> = {
  integer: "integer",
  float: "float",
  scaledDecimal: "scaledDecimal",
};

class Parser {
  private i = 0;
  readonly errors: ParseError[] = [];

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    // El lexer SIEMPRE termina con un token `eof`, así que el índice clampado a
    // la cola devuelve `eof` (sentinela) en vez de undefined.
    const idx = this.i + offset;
    const last = this.tokens[this.tokens.length - 1] as Token;
    return this.tokens[idx] ?? last;
  }

  private get atEnd(): boolean {
    return this.peek().type === "eof";
  }

  private advance(): Token {
    const t = this.peek();
    if (!this.atEnd) this.i++;
    return t;
  }

  private error(code: ParseErrorCode, span: SourceSpan, message: string): void {
    this.errors.push({ code, span, message });
  }

  // ── Programa / secuencia ────────────────────────────────────────────────
  // program ::= sequence (hasta eof). La Sequence es el ÚNICO hogar de las
  // temporaries (R13/DEV-012). La fuente vacía da una Sequence vacía.
  parseProgram(): ProgramNode {
    const start = this.peek().span.start;
    const body = this.parseSequence("eof");
    const end = this.peek().span.end;
    const span = mkSpan(start, end);
    return { type: "Program", body, span };
  }

  // sequence ::= temporaries? (statement (`.` statement)* `.`?)
  // Termina en `close` (eof o rbracket para bloques). R13: tras un Return sólo
  // se admite la `.` final y el cierre; un statement posterior es inesperado.
  private parseSequence(close: "eof" | "rbracket"): SequenceNode {
    const start = this.peek().span.start;
    const temporaries = this.parseTemporaries();
    const statements: Statement[] = [];
    while (!this.atClose(close)) {
      const stmt = this.parseStatement();
      statements.push(stmt);
      // Target no asignable (CORR-2/DEV-010, R8): si tras parsear el statement
      // queda un `:=` sin consumir, el target no era un identifier simple
      // (`3 := 4`, `a foo := 1`) => `:=` inesperado. Determinista por code+span.
      if (this.peek().type === "assignmentOperator") {
        this.error("E_UNEXPECTED_TOKEN", this.peek().span, "target no asignable: :=");
        break;
      }
      // Separador de statements: `.`. Sin `.` el statement debe ser el último.
      if (this.peek().type === "period") {
        this.advance();
      } else {
        break;
      }
      // R13: `^expr` es TERMINAL — tras su `.` opcional sólo cabe el cierre.
      if (stmt.type === "Return" && !this.atClose(close)) {
        const t = this.peek();
        this.error("E_UNEXPECTED_TOKEN", t.span, `statement tras ^ terminal (R13): ${t.type}`);
        break;
      }
    }
    const end = this.peek().span.start;
    return { type: "Sequence", temporaries, statements, span: mkSpan(start, end) };
  }

  private atClose(close: "eof" | "rbracket"): boolean {
    return close === "eof" ? this.atEnd : this.peek().type === "rbracket" || this.atEnd;
  }

  // temporaries ::= `|` identifier* `|`. Viven como VariableNode[] en Sequence
  // (R13/DEV-012). Sólo se consumen si la secuencia abre con `|`.
  private parseTemporaries(): VariableNode[] {
    if (this.peek().type !== "verticalBar") return [];
    this.advance(); // `|` de apertura
    const temps: VariableNode[] = [];
    while (this.peek().type === "identifier") {
      temps.push(this.variable(this.advance()));
    }
    if (this.peek().type === "verticalBar") this.advance(); // `|` de cierre
    return temps;
  }

  // statement ::= `^` expression  |  expression. `^expr` => ReturnNode.
  private parseStatement(): Statement {
    if (this.peek().type === "returnOperator") {
      const caret = this.advance();
      const value = this.parseExpression();
      return { type: "Return", value, span: mkSpan(caret.span.start, value.span.end) };
    }
    return this.parseExpression();
  }

  // expression ::= assignment | keyword-message. Assignment SÓLO cuando hay un
  // identifier seguido de `:=` (right-assoc). Cascade llega en otra slice.
  private parseExpression(): Expression {
    if (this.peek().type === "identifier" && this.peek(1).type === "assignmentOperator") {
      return this.parseAssignment();
    }
    return this.parseKeywordMessage();
  }

  // assignment ::= variable `:=` expression (right-assoc => `a := b := c` anida).
  // El target sólo puede ser un identifier (R8/CORR-2); un target no-variable
  // (p.ej. `3 := 4`, `a foo := 1`) se detecta en parseKeywordMessage: al volver,
  // el `:=` sobrante queda sin consumir y es E_UNEXPECTED_TOKEN.
  private parseAssignment(): AssignmentNode {
    const target = this.variable(this.advance()); // identifier
    this.advance(); // `:=`
    const value = this.parseExpression();
    return { type: "Assignment", target, value, span: mkSpan(target.span.start, value.span.end) };
  }

  // keyword-message ::= binary-message (keyword binary-message)*  — liga más flojo.
  private parseKeywordMessage(): Expression {
    const receiver = this.parseBinaryMessage();
    if (this.peek().type !== "keyword") return receiver;
    let selector = "";
    const args: Expression[] = [];
    while (this.peek().type === "keyword") {
      const kw = this.advance(); // el lexema ya incluye el `:` final (`at:`).
      selector += kw.lexeme;
      args.push(this.parseBinaryMessage());
    }
    const span = mkSpan(receiver.span.start, args[args.length - 1]?.span.end ?? receiver.span.end);
    return msg("keyword", receiver, selector, args, span);
  }

  // binary-message ::= unary-message (binarySelector unary-message)*  — left-assoc,
  // SIN precedencia entre binarios (R8). `|` aislado es `verticalBar`, NO binario.
  private parseBinaryMessage(): Expression {
    let receiver = this.parseUnaryMessage();
    while (this.peek().type === "binarySelector") {
      const op = this.advance();
      const arg = this.parseUnaryMessage();
      const span = mkSpan(receiver.span.start, arg.span.end);
      receiver = msg("binary", receiver, op.lexeme, [arg], span);
    }
    return receiver;
  }

  // unary-message ::= primary (identifier)*  — liga más fuerte. R8: sin lookahead.
  private parseUnaryMessage(): Expression {
    let receiver = this.parsePrimary();
    while (this.peek().type === "identifier") {
      const sel = this.advance();
      const span = mkSpan(receiver.span.start, sel.span.end);
      receiver = msg("unary", receiver, sel.lexeme, [], span);
    }
    return receiver;
  }

  // primary ::= literal | variable | `(` expression `)`.
  private parsePrimary(): Expression {
    const t = this.peek();
    switch (t.type) {
      case "number":
        return this.numberLiteral(this.advance());
      case "string":
        return this.simpleLiteral(this.advance(), "string");
      case "character":
        return this.simpleLiteral(this.advance(), "character");
      case "symbol":
        return this.simpleLiteral(this.advance(), "symbol");
      case "identifier":
        // R5: nil/true/false a nivel de EXPRESIÓN son Variable (no reificados).
        return this.variable(this.advance());
      case "lparen":
        return this.parseParenExpr();
      default:
        // Token inesperado donde se esperaba un primary: rechazo determinista.
        this.error("E_UNEXPECTED_TOKEN", t.span, `token inesperado: ${t.type}`);
        return this.variable(this.advance());
    }
  }

  // `(` expression `)` — agrupación (no genera nodo); E_UNCLOSED_PAREN si falta `)`.
  private parseParenExpr(): Expression {
    const open = this.advance(); // `(`
    const inner = this.parseExpression();
    if (this.peek().type === "rparen") {
      this.advance();
      return inner;
    }
    this.error(
      "E_UNCLOSED_PAREN",
      mkSpan(open.span.start, this.peek().span.end),
      "paréntesis sin cerrar",
    );
    return inner;
  }

  private numberLiteral(t: Token): LiteralNode {
    const lit = NUM_KIND[t.numKind ?? "integer"];
    const node: LiteralNode = { type: "Literal", lit, raw: t.lexeme, span: t.span };
    // scaledDecimal conserva STRING (R4); no se coacciona a number.
    if (t.value !== undefined) node.value = t.value;
    if (t.floatKind !== undefined) node.floatKind = t.floatKind;
    if (t.scale !== undefined) node.scale = t.scale;
    return node;
  }

  private simpleLiteral(t: Token, lit: LiteralKind): LiteralNode {
    const node: LiteralNode = { type: "Literal", lit, raw: t.lexeme, span: t.span };
    if (t.value !== undefined) node.value = t.value;
    return node;
  }

  private variable(t: Token): VariableNode {
    return { type: "Variable", name: t.lexeme, span: t.span };
  }
}

function mkSpan(start: Position, end: Position): SourceSpan {
  return { start, end };
}

function msg(
  kind: MessageSendNode["kind"],
  receiver: Expression,
  selector: string,
  args: Expression[],
  span: SourceSpan,
): MessageSendNode {
  return { type: "MessageSend", kind, receiver, selector, args, span };
}

/**
 * Parsea fuente Smalltalk: tokeniza vía lexer, arrastra los LexError hacia adelante
 * y corre el descenso recursivo añadiendo ParseError. `ast` es null sólo si no se
 * pudo producir Program (de momento siempre se produce best-effort).
 */
export function parse(source: string): {
  ast: ProgramNode | null;
  errors: Array<LexError | ParseError>;
} {
  const lexed = tokenize(source);
  const parser = new Parser(lexed.tokens);
  const ast = parser.parseProgram();
  return { ast, errors: [...lexed.errors, ...parser.errors] };
}
