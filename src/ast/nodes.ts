// L1 · AST — nodos del subconjunto ANSI (Anexo A) como discriminated unions.
// Contrato fijado en doc/research/2026-06-28-l1-decisiones-resueltas.md (R11/R12/R13).
// `type` es el discriminante; cada nodo lleva `span`.

/** Posición: `offset` = índice de unidad UTF-16 (slice-reversible); `column` = code points (1 por surrogate pair). R1. */
export interface Position {
  offset: number;
  line: number;
  column: number;
}

/** Rango medio-abierto `[start, end)`: `source.slice(start.offset, end.offset)` = lexema. R1. */
export interface SourceSpan {
  start: Position;
  end: Position;
}

export type Origin = "ansi" | "ext:pharo-squeak";

/** R11 — `float` lleva `floatKind`; `scaledDecimal` lleva `scale`; `array`/`byteArray` llevan `elements`. */
export type LiteralKind =
  | "integer"
  | "float"
  | "scaledDecimal"
  | "character"
  | "string"
  | "symbol"
  | "array"
  | "byteArray"
  | "nil"
  | "true"
  | "false";

export interface ProgramNode {
  type: "Program";
  body: SequenceNode;
  span: SourceSpan;
}

/** Cuerpo de programa y de bloque. Las temporaries viven aquí (único hogar). R13. */
export interface SequenceNode {
  type: "Sequence";
  temporaries: VariableNode[];
  statements: Statement[]; // puede terminar en un ReturnNode (terminal)
  span: SourceSpan;
}

export interface ReturnNode {
  type: "Return";
  value: Expression; // `^` expression
  span: SourceSpan;
}

export interface AssignmentNode {
  type: "Assignment";
  target: VariableNode; // ANSI: assignment target ::= identifier
  value: Expression; // a := b := expr  =>  Assignment(a, Assignment(b, expr))
  span: SourceSpan;
}

export interface MessageSendNode {
  type: "MessageSend";
  kind: "unary" | "binary" | "keyword";
  receiver: Expression;
  selector: string; // unary: "foo"; binary: "+"; keyword: "at:put:" (concatenado, sin espacios)
  args: Expression[]; // unary: []; binary: [arg]; keyword: [arg, ...] (1 por keyword)
  span: SourceSpan;
}

/** Mensaje de cascada SIN receptor explícito (el receptor es CascadeNode.receiver). R9. */
export interface CascadeMsg {
  kind: "unary" | "binary" | "keyword";
  selector: string;
  args: Expression[];
  span: SourceSpan;
}

export interface CascadeNode {
  type: "Cascade";
  receiver: Expression; // receptor del mensaje anterior al primer ';' (puede ser un MessageSend). R9.
  messages: CascadeMsg[]; // >=2
  span: SourceSpan;
}

export interface BlockNode {
  type: "Block";
  params: VariableNode[]; // block arguments :x (temporaries van en body). R13.
  body: SequenceNode;
  span: SourceSpan;
}

export interface VariableNode {
  type: "Variable";
  name: string;
  span: SourceSpan;
}

/** `{ e1. e2 }` — NO es literal: elementos son expresiones. Extensión Pharo/Squeak. R11. */
export interface DynamicArrayNode {
  type: "DynamicArray";
  elements: Expression[];
  origin: "ext:pharo-squeak";
  span: SourceSpan;
}

export interface LiteralNode {
  type: "Literal";
  lit: LiteralKind;
  raw: string; // lexema fuente exacto del valor
  value?: number | bigint | string | boolean | null; // omitido en array/byteArray
  floatKind?: "e" | "d" | "q"; // solo lit:"float"
  scale?: number; // solo lit:"scaledDecimal"
  origin?: Origin; // solo se serializa si "ext:pharo-squeak" (R12)
  elements?: LiteralNode[]; // solo lit:"array" | "byteArray"
  span: SourceSpan;
}

export type Expression =
  | MessageSendNode
  | CascadeNode
  | AssignmentNode
  | LiteralNode
  | VariableNode
  | BlockNode
  | DynamicArrayNode;

export type Statement = Expression | ReturnNode;

export type Node =
  | ProgramNode
  | SequenceNode
  | ReturnNode
  | AssignmentNode
  | MessageSendNode
  | CascadeNode
  | BlockNode
  | VariableNode
  | DynamicArrayNode
  | LiteralNode;
