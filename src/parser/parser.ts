// L1 · Parser — descenso recursivo sobre Token[] del lexer. SLICE P1: scaffold +
// núcleo de precedencia Smalltalk (R8): primary -> unary -> binary -> keyword.
// unary liga más fuerte que binary, binary más que keyword; los binarios son
// left-assoc SIN precedencia entre sí. parsePrimary cubre literales, variable y
// `( expr )` con E_UNCLOSED_PAREN. Rechazo determinista: errores a `errors[]`.

import type {
  AssignmentNode,
  BlockNode,
  CascadeMsg,
  DynamicArrayNode,
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

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

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

  // expression ::= assignment | cascade. Assignment SÓLO cuando hay un identifier
  // seguido de `:=` (right-assoc). En otro caso, cascade (que envuelve al mensaje).
  private parseExpression(): Expression {
    if (this.peek().type === "identifier" && this.peek(1).type === "assignmentOperator") {
      return this.parseAssignment();
    }
    return this.parseCascade();
  }

  // cascade ::= keyword-message (`;` message)*. R9: si hay `;`, el head debe ser un
  // MessageSend; su receptor pasa a ser CascadeNode.receiver y el propio head se
  // descompone en el primer CascadeMsg (kind/selector/args, SIN receptor). Cada `;`
  // siguiente parsea un mensaje más (unary|binary|keyword) sobre ese mismo receptor.
  private parseCascade(): Expression {
    const head = this.parseKeywordMessage();
    if (this.peek().type !== "semicolon") return head;
    // El head debe ser un MessageSend para poder descomponerlo (R9).
    if (head.type !== "MessageSend") {
      this.error(
        "E_CASCADE_NO_RECEIVER",
        this.peek().span,
        "cascada sin receptor (head no es envío)",
      );
      return head;
    }
    const receiver = head.receiver;
    const messages: CascadeMsg[] = [msgToCascade(head)];
    while (this.peek().type === "semicolon") {
      this.advance(); // `;`
      messages.push(this.parseCascadeMsg());
    }
    const end = messages[messages.length - 1]?.span.end ?? head.span.end;
    return { type: "Cascade", receiver, messages, span: mkSpan(receiver.span.start, end) };
  }

  // Un mensaje de cascada (sobre el receptor común ya conocido): unary | binary |
  // keyword. No lleva receptor propio (CascadeMsg). El span cubre selector+args.
  private parseCascadeMsg(): CascadeMsg {
    const start = this.peek().span.start;
    if (this.peek().type === "keyword") {
      let selector = "";
      const args: Expression[] = [];
      while (this.peek().type === "keyword") {
        selector += this.advance().lexeme; // el lexema ya incluye el `:`.
        args.push(this.parseBinaryMessage());
      }
      const end = args[args.length - 1]?.span.end ?? start;
      return { kind: "keyword", selector, args, span: mkSpan(start, end) };
    }
    if (this.peek().type === "binarySelector") {
      const op = this.advance();
      const arg = this.parseUnaryMessage();
      return {
        kind: "binary",
        selector: op.lexeme,
        args: [arg],
        span: mkSpan(start, arg.span.end),
      };
    }
    // unary: un único identifier-selector.
    const sel = this.advance();
    return { kind: "unary", selector: sel.lexeme, args: [], span: mkSpan(start, sel.span.end) };
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
    const msgStart = this.peek().span.start; // inicio del primer keyword (R9 cascade).
    let selector = "";
    const args: Expression[] = [];
    while (this.peek().type === "keyword") {
      const kw = this.advance(); // el lexema ya incluye el `:` final (`at:`).
      selector += kw.lexeme;
      args.push(this.parseBinaryMessage());
    }
    const end = args[args.length - 1]?.span.end ?? receiver.span.end;
    const node = msg("keyword", receiver, selector, args, mkSpan(receiver.span.start, end));
    msgSpans.set(node, mkSpan(msgStart, end)); // span sólo-mensaje (para cascada R9).
    return node;
  }

  // binary-message ::= unary-message (binarySelector unary-message)*  — left-assoc,
  // SIN precedencia entre binarios (R8). `|` aislado es `verticalBar`, NO binario.
  private parseBinaryMessage(): Expression {
    let receiver = this.parseUnaryMessage();
    while (this.peek().type === "binarySelector") {
      const op = this.advance();
      const arg = this.parseUnaryMessage();
      const node = msg(
        "binary",
        receiver,
        op.lexeme,
        [arg],
        mkSpan(receiver.span.start, arg.span.end),
      );
      msgSpans.set(node, mkSpan(op.span.start, arg.span.end)); // span sólo-mensaje.
      receiver = node;
    }
    return receiver;
  }

  // unary-message ::= primary (identifier)*  — liga más fuerte. R8: sin lookahead.
  private parseUnaryMessage(): Expression {
    let receiver = this.parsePrimary();
    while (this.peek().type === "identifier") {
      const sel = this.advance();
      const node = msg(
        "unary",
        receiver,
        sel.lexeme,
        [],
        mkSpan(receiver.span.start, sel.span.end),
      );
      msgSpans.set(node, sel.span); // span sólo-mensaje = el selector.
      receiver = node;
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
      case "lbracket":
        return this.parseBlock();
      case "arrayOpen":
        return this.parseLiteralArray();
      case "byteArrayOpen":
        return this.parseByteArray();
      case "dynArrayOpen":
        return this.parseDynamicArray();
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

  // block ::= `[` (`:`identifier)* (`|` si hubo params)? sequence `]`.
  // Params via colon+identifier (DEV-015/R3); si hay alguno, los cierra un `|`.
  // El cuerpo es una Sequence (que puede abrir con su propio `| temps |`, R13).
  // E_UNCLOSED_BLOCK si falta `]`.
  private parseBlock(): BlockNode {
    const open = this.advance(); // `[`
    const params: VariableNode[] = [];
    while (this.peek().type === "colon") {
      this.advance(); // `:`
      if (this.peek().type === "identifier") params.push(this.variable(this.advance()));
    }
    // El `|` terminador de params sólo aparece si hubo params (DEV-015).
    if (params.length > 0 && this.peek().type === "verticalBar") this.advance();
    const body = this.parseSequence("rbracket");
    if (this.peek().type === "rbracket") {
      const close = this.advance();
      return { type: "Block", params, body, span: mkSpan(open.span.start, close.span.end) };
    }
    this.error(
      "E_UNCLOSED_BLOCK",
      mkSpan(open.span.start, this.peek().span.end),
      "bloque sin cerrar",
    );
    return { type: "Block", params, body, span: mkSpan(open.span.start, this.peek().span.end) };
  }

  // literalArray ::= `#(` element* `)`. Cada elemento es un LITERAL (R5/R11):
  // nil/true/false reificados DENTRO del array (asimetría con nivel expresión);
  // barewords / keyword-runs / binarySelector => símbolos; `#(`/`(` anidan en
  // array; `#[` anida en byteArray. ANSI: origin "ansi" => astToJSON lo OMITE.
  // E_UNCLOSED_ARRAY si falta `)`.
  private parseLiteralArray(): LiteralNode {
    const open = this.advance(); // `#(`
    const elements: LiteralNode[] = [];
    while (this.peek().type !== "rparen" && !this.atEnd) {
      elements.push(this.parseArrayElement());
    }
    return this.closeArrayLiteral(open, "array", "rparen", elements, "E_UNCLOSED_ARRAY");
  }

  // Un elemento de literalArray: literal numérico/string/character; nil/true/false
  // reificados (R5); otros identifiers / keyword-runs / binarySelector => símbolo;
  // `#(`/`(` => array anidado; `#[` => byteArray anidado.
  private parseArrayElement(): LiteralNode {
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
      case "arrayOpen":
        return this.parseLiteralArray();
      case "lparen":
        return this.parseNestedParenArray();
      case "byteArrayOpen":
        return this.parseByteArray();
      case "identifier":
        return this.reservedOrSymbol(this.advance());
      case "binarySelector":
        return this.symbolLiteral(this.advance());
      case "keyword":
        return this.keywordRunSymbol();
      default: {
        // Token inesperado donde se esperaba un elemento de array.
        const bad = this.advance();
        this.error("E_UNEXPECTED_TOKEN", bad.span, `elemento de array inesperado: ${bad.type}`);
        return this.symbolLiteral(bad);
      }
    }
  }

  // `(` dentro de `#( )` es un array anidado (NO agrupación); mismo cierre `)`.
  private parseNestedParenArray(): LiteralNode {
    const open = this.advance(); // `(`
    const elements: LiteralNode[] = [];
    while (this.peek().type !== "rparen" && !this.atEnd) {
      elements.push(this.parseArrayElement());
    }
    return this.closeArrayLiteral(open, "array", "rparen", elements, "E_UNCLOSED_ARRAY");
  }

  // R5: nil/true/false bareword DENTRO de array => literal reservado reificado;
  // cualquier otro identifier => símbolo.
  private reservedOrSymbol(t: Token): LiteralNode {
    const reserved: Record<string, { lit: LiteralKind; value: boolean | null }> = {
      nil: { lit: "nil", value: null },
      true: { lit: "true", value: true },
      false: { lit: "false", value: false },
    };
    const r = reserved[t.lexeme];
    if (r !== undefined) {
      return { type: "Literal", lit: r.lit, raw: t.lexeme, value: r.value, span: t.span };
    }
    return this.symbolLiteral(t);
  }

  // keyword-run dentro de array: `at:put:` (dos tokens keyword) => un único símbolo
  // `at:put:` (lexema concatenado; el `:` ya viene incluido en cada keyword).
  private keywordRunSymbol(): LiteralNode {
    const start = this.peek().span.start;
    let raw = "";
    let end = start;
    while (this.peek().type === "keyword") {
      const kw = this.advance();
      raw += kw.lexeme;
      end = kw.span.end;
    }
    return { type: "Literal", lit: "symbol", raw, value: raw, span: mkSpan(start, end) };
  }

  private symbolLiteral(t: Token): LiteralNode {
    return { type: "Literal", lit: "symbol", raw: t.lexeme, value: t.lexeme, span: t.span };
  }

  // byteArray ::= `#[` integer* `]`. Cada elemento debe ser un entero en [0,255]
  // (E_BYTE_RANGE si excede; un `-` no es entero => E_UNEXPECTED_TOKEN, DEV-016).
  // origin ext:pharo-squeak (astToJSON lo EMITE). E_UNCLOSED_BYTEARRAY si falta `]`.
  private parseByteArray(): LiteralNode {
    const open = this.advance(); // `#[`
    const elements: LiteralNode[] = [];
    while (this.peek().type !== "rbracket" && !this.atEnd) {
      const t = this.peek();
      if (t.type === "number" && t.numKind === "integer") {
        this.advance();
        if (typeof t.value === "number" && (t.value < 0 || t.value > 255)) {
          this.error("E_BYTE_RANGE", t.span, `byte fuera de rango [0,255]: ${t.lexeme}`);
        }
        elements.push(this.numberLiteral(t));
      } else {
        this.advance();
        this.error("E_UNEXPECTED_TOKEN", t.span, `byte no entero: ${t.type}`);
      }
    }
    const node = this.closeArrayLiteral(
      open,
      "byteArray",
      "rbracket",
      elements,
      "E_UNCLOSED_BYTEARRAY",
    );
    node.origin = "ext:pharo-squeak";
    return node;
  }

  // Cierre común de literalArray/byteArray: consume el cierre y arma el nodo, o
  // emite el error de "sin cerrar" con span desde la apertura. raw = slice fuente.
  private closeArrayLiteral(
    open: Token,
    lit: LiteralKind,
    close: "rparen" | "rbracket",
    elements: LiteralNode[],
    unclosed: ParseErrorCode,
  ): LiteralNode {
    if (this.peek().type === close) {
      const end = this.advance().span.end;
      const span = mkSpan(open.span.start, end);
      return { type: "Literal", lit, raw: this.slice(span), elements, span };
    }
    const span = mkSpan(open.span.start, this.peek().span.end);
    this.error(unclosed, span, `array sin cerrar (${lit})`);
    return { type: "Literal", lit, raw: this.slice(span), elements, span };
  }

  // dynamicArray ::= `{` (expression (`.` expression)* `.`?) `}`. Los elementos son
  // EXPRESIONES completas (no literales). origin ext:pharo-squeak (astToJSON EMITE).
  // E_UNCLOSED_DYNARRAY si falta `}`.
  private parseDynamicArray(): DynamicArrayNode {
    const open = this.advance(); // `{`
    const elements: Expression[] = [];
    while (this.peek().type !== "dynArrayClose" && !this.atEnd) {
      elements.push(this.parseExpression());
      if (this.peek().type === "period") {
        this.advance();
      } else {
        break;
      }
    }
    if (this.peek().type === "dynArrayClose") {
      const end = this.advance().span.end;
      return {
        type: "DynamicArray",
        elements,
        origin: "ext:pharo-squeak",
        span: mkSpan(open.span.start, end),
      };
    }
    const span = mkSpan(open.span.start, this.peek().span.end);
    this.error("E_UNCLOSED_DYNARRAY", span, "array dinámico sin cerrar");
    return { type: "DynamicArray", elements, origin: "ext:pharo-squeak", span };
  }

  private slice(span: SourceSpan): string {
    return this.source.slice(span.start.offset, span.end.offset);
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

// Span "sólo-mensaje" (selector + args, SIN receptor) de cada MessageSend, registrado
// al construirlo. Lo usa la descomposición de cascada (R9) para el span del primer
// CascadeMsg sin reconstruir posiciones del lexer.
const msgSpans = new WeakMap<MessageSendNode, SourceSpan>();

// Descompone el head de una cascada en su primer CascadeMsg (R9): conserva
// kind/selector/args y descarta el receptor; el span es el del mensaje sólo.
function msgToCascade(node: MessageSendNode): CascadeMsg {
  return {
    kind: node.kind,
    selector: node.selector,
    args: node.args,
    span: msgSpans.get(node) ?? node.span,
  };
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
  const parser = new Parser(lexed.tokens, source);
  const ast = parser.parseProgram();
  return { ast, errors: [...lexed.errors, ...parser.errors] };
}
