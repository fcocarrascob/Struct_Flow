// Intérprete imperativo mínimo para las "regiones de programa" del canvas
// (estilo panel "Programación" de SMath). math.js no tiene control de flujo
// imperativo, así que aquí se parsea un bloque indentado en sentencias y se
// ejecuta, delegando cada expresión/condición a math.js vía `ctx.evaluate`.
//
// Sintaxis (la indentación define el cuerpo, como en Python):
//   nombre := <programa>          define una variable con el valor de retorno
//   nombre(a, b) := <programa>    define una función reutilizable
//   <programa sin cabecera>       se ejecuta y muestra su valor de retorno
//
// Sentencias del cuerpo:
//   nombre := expr                asignación (local al programa)
//   return expr                   retorna un valor
//   if cond / else if cond / else condicional (ramas al mismo nivel que `if`)
//   for v in 1:n   /  for v in [..]   bucle sobre rango o lista
//   while cond                    bucle por condición
//   break / continue              control de bucle
//   expr                          expresión suelta (la última es el retorno implícito)

export type Stmt =
  | { t: 'assign'; name: string; expr: string; line: number }
  | { t: 'expr'; expr: string; line: number }
  | { t: 'return'; expr: string; line: number }
  | { t: 'break'; line: number }
  | { t: 'continue'; line: number }
  | { t: 'if'; branches: { cond?: string; body: Stmt[] }[]; line: number }
  | { t: 'for'; varName: string; iter: string; body: Stmt[]; line: number }
  | { t: 'while'; cond: string; body: Stmt[]; line: number };

export interface ParsedProgram {
  /** Nombre definido por la cabecera `nombre :=` o `nombre(args) :=`. */
  name?: string;
  /** Parámetros si es una función; `undefined` si no hay paréntesis. */
  params?: string[];
  body: Stmt[];
}

export interface ProgramContext {
  /** Evalúa una expresión math.js sobre el scope dado. */
  evaluate: (expr: string, scope: Record<string, unknown>) => unknown;
  /** Tope de iteraciones acumuladas (anti-bucle-infinito). */
  maxIters: number;
}

/** Contador mutable de iteraciones, compartido por toda una ejecución. */
export interface Guard {
  n: number;
}

// --- Señales de control de flujo (excepciones internas) ---------------------
class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public value: unknown) {}
}

const HEADER_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*(?:\(([^)]*)\))?\s*:=\s*(.*)$/u;
const ASSIGN_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*:=\s*(.+)$/u;
const FOR_RE = /^for\s+([\p{L}_][\p{L}\p{N}_]*)\s+in\s+(.+)$/u;
const WHILE_RE = /^while\s+(.+)$/u;
const IF_RE = /^if\s+(.+)$/u;
const ELIF_RE = /^else\s+if\s+(.+)$/u;
const RETURN_RE = /^return\b\s*(.*)$/u;

const TAB = '    ';

interface Tok {
  indent: number;
  text: string;
  /** Nº de línea 1-based (para mensajes de error). */
  line: number;
}

/** Tokeniza el cuerpo en líneas no vacías con su nivel de indentación. */
function tokenize(lines: string[], startLine: number): Tok[] {
  const toks: Tok[] = [];
  lines.forEach((raw, i) => {
    const expanded = raw.replace(/\t/g, TAB);
    if (expanded.trim() === '') return; // las líneas en blanco no cuentan
    const indent = expanded.length - expanded.trimStart().length;
    toks.push({ indent, text: expanded.trim(), line: startLine + i });
  });
  return toks;
}

/** Separa la cabecera (`nombre(args) :=`) del cuerpo. */
export function parseProgram(src: string): ParsedProgram {
  const lines = src.split('\n');

  // Localizar la primera línea no vacía: posible cabecera.
  let headIdx = 0;
  while (headIdx < lines.length && lines[headIdx].trim() === '') headIdx++;
  const headLine = lines[headIdx] ?? '';

  const header = HEADER_RE.exec(headLine.trim());
  if (header) {
    const name = header[1];
    const params = header[2] !== undefined ? splitParams(header[2]) : undefined;
    const inlineBody = header[3].trim();
    if (inlineBody !== '') {
      // Forma de una línea: `f(x) := x^2`.
      return { name, params, body: [stmtFromLine(inlineBody, headIdx + 1)] };
    }
    const toks = tokenize(lines.slice(headIdx + 1), headIdx + 2);
    return { name, params, body: parseBlock(toks, { i: 0 }, toks[0]?.indent ?? 0) };
  }

  // Sin cabecera: programa anónimo que se evalúa y muestra.
  const toks = tokenize(lines, 1);
  return { body: parseBlock(toks, { i: 0 }, toks[0]?.indent ?? 0) };
}

function splitParams(s: string): string[] {
  return s.split(',').map((p) => p.trim()).filter((p) => p !== '');
}

/** Parsea una secuencia de sentencias al nivel de indentación `indent`. */
function parseBlock(toks: Tok[], cur: { i: number }, indent: number): Stmt[] {
  const stmts: Stmt[] = [];
  while (cur.i < toks.length && toks[cur.i].indent >= indent) {
    const tok = toks[cur.i];
    if (tok.indent > indent) {
      throw new Error(`Indentación inesperada en la línea ${tok.line}`);
    }
    stmts.push(parseStmt(toks, cur, indent));
  }
  return stmts;
}

/** Indentación del bloque hijo: la del primer token tras la cabecera. */
function childIndent(toks: Tok[], cur: { i: number }, headerIndent: number, headerLine: number): number {
  const next = toks[cur.i];
  if (!next || next.indent <= headerIndent) {
    throw new Error(`Se esperaba un bloque indentado tras la línea ${headerLine}`);
  }
  return next.indent;
}

function parseStmt(toks: Tok[], cur: { i: number }, indent: number): Stmt {
  const tok = toks[cur.i];
  const { text, line } = tok;

  // --- if / else if / else ---
  const ifm = IF_RE.exec(text);
  if (ifm) {
    cur.i++;
    const branches: { cond?: string; body: Stmt[] }[] = [];
    const ci = childIndent(toks, cur, indent, line);
    branches.push({ cond: ifm[1].trim(), body: parseBlock(toks, cur, ci) });
    // Cláusulas else-if / else al mismo nivel que el `if`.
    while (cur.i < toks.length && toks[cur.i].indent === indent) {
      const t = toks[cur.i].text;
      const elif = ELIF_RE.exec(t);
      if (elif) {
        const l = toks[cur.i].line;
        cur.i++;
        const bi = childIndent(toks, cur, indent, l);
        branches.push({ cond: elif[1].trim(), body: parseBlock(toks, cur, bi) });
      } else if (t === 'else') {
        const l = toks[cur.i].line;
        cur.i++;
        const bi = childIndent(toks, cur, indent, l);
        branches.push({ body: parseBlock(toks, cur, bi) });
        break;
      } else {
        break;
      }
    }
    return { t: 'if', branches, line };
  }

  // --- for v in ITER ---
  const form = FOR_RE.exec(text);
  if (form) {
    cur.i++;
    const ci = childIndent(toks, cur, indent, line);
    return { t: 'for', varName: form[1], iter: form[2].trim(), body: parseBlock(toks, cur, ci), line };
  }

  // --- while COND ---
  const wm = WHILE_RE.exec(text);
  if (wm) {
    cur.i++;
    const ci = childIndent(toks, cur, indent, line);
    return { t: 'while', cond: wm[1].trim(), body: parseBlock(toks, cur, ci), line };
  }

  // --- sentencias de una línea ---
  cur.i++;
  return stmtFromLine(text, line);
}

/** Sentencia de una sola línea (sin cuerpo anidado). */
function stmtFromLine(text: string, line: number): Stmt {
  if (text === 'break') return { t: 'break', line };
  if (text === 'continue') return { t: 'continue', line };
  const ret = RETURN_RE.exec(text);
  if (ret) return { t: 'return', expr: ret[1].trim(), line };
  if (ELIF_RE.test(text) || text === 'else') {
    throw new Error(`'${text}' sin un 'if' correspondiente (línea ${line})`);
  }
  const asg = ASSIGN_RE.exec(text);
  if (asg) return { t: 'assign', name: asg[1], expr: asg[2].trim(), line };
  return { t: 'expr', expr: text, line };
}

// --- Ejecución --------------------------------------------------------------

/** Ejecuta un programa ya parseado y devuelve su valor de retorno. */
export function runProgram(
  body: Stmt[],
  scope: Record<string, unknown>,
  ctx: ProgramContext,
  guard: Guard,
): unknown {
  try {
    return execBlock(body, scope, ctx, guard);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    if (e instanceof BreakSignal || e instanceof ContinueSignal) {
      throw new Error("'break'/'continue' fuera de un bucle");
    }
    throw e;
  }
}

/** Ejecuta sentencias en orden; devuelve el valor de la última expresión suelta. */
function execBlock(stmts: Stmt[], scope: Record<string, unknown>, ctx: ProgramContext, guard: Guard): unknown {
  let last: unknown = undefined;
  for (const s of stmts) {
    switch (s.t) {
      case 'assign':
        scope[s.name] = ctx.evaluate(s.expr, scope);
        break;
      case 'expr':
        last = ctx.evaluate(s.expr, scope);
        break;
      case 'return':
        throw new ReturnSignal(s.expr ? ctx.evaluate(s.expr, scope) : undefined);
      case 'break':
        throw new BreakSignal();
      case 'continue':
        throw new ContinueSignal();
      case 'if': {
        for (const br of s.branches) {
          if (br.cond === undefined || truthy(ctx.evaluate(br.cond, scope))) {
            execBlock(br.body, scope, ctx, guard);
            break;
          }
        }
        break;
      }
      case 'for': {
        const items = toIterable(ctx.evaluate(s.iter, scope));
        for (const item of items) {
          if (++guard.n > ctx.maxIters) throw iterLimit();
          scope[s.varName] = item;
          try {
            execBlock(s.body, scope, ctx, guard);
          } catch (e) {
            if (e instanceof ContinueSignal) continue;
            if (e instanceof BreakSignal) break;
            throw e;
          }
        }
        break;
      }
      case 'while': {
        while (truthy(ctx.evaluate(s.cond, scope))) {
          if (++guard.n > ctx.maxIters) throw iterLimit();
          try {
            execBlock(s.body, scope, ctx, guard);
          } catch (e) {
            if (e instanceof ContinueSignal) continue;
            if (e instanceof BreakSignal) break;
            throw e;
          }
        }
        break;
      }
    }
  }
  return last;
}

function iterLimit(): Error {
  return new Error('Límite de iteraciones excedido (posible bucle infinito)');
}

function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/** Normaliza un rango (1:n) o lista de math.js a un array iterable. */
function toIterable(v: unknown): unknown[] {
  if (v && typeof (v as { toArray?: unknown }).toArray === 'function') {
    return (v as { toArray: () => unknown[] }).toArray();
  }
  if (Array.isArray(v)) return v;
  throw new Error("'for ... in' espera un rango (p. ej. 1:n) o una lista [..]");
}
