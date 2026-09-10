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
  /**
   * El contador de la evaluación en curso. Lo renueva `evaluateSheet` al empezar
   * cada región, y lo comparten los bucles de esa región y los de todas las
   * funciones de usuario a las que llame, a cualquier profundidad.
   *
   * Vive aquí y no en un argumento porque una función de usuario es un closure
   * que math.js invoca por su cuenta: cuando cada llamada estrenaba su propio
   * contador, un bucle de 30 vueltas que llamaba a una función de 60.000 daba
   * 1,8 millones de vueltas con el tope de 100.000 mirando.
   */
  guard: Guard;
}

/** Contador mutable de una evaluación: vueltas y llamadas, y anidamiento. */
export interface Guard {
  n: number;
  /** Llamadas a funciones de usuario abiertas ahora mismo (recursión). */
  profundidad: number;
}

export const nuevoGuard = (): Guard => ({ n: 0, profundidad: 0 });

/**
 * Llamadas anidadas a funciones de usuario antes de dar la recursión por
 * desbocada. Cada nivel apila decenas de marcos de math.js, así que la pila de
 * JavaScript se agota bastante antes de lo que parece: con este tope el error
 * llega con un mensaje propio y no como un «Maximum call stack size exceeded».
 */
export const MAX_PROFUNDIDAD = 100;

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
    // Las líneas en blanco no cuentan, y las de solo comentario tampoco: como
    // sentencia, math.js evalúa `# …` a `undefined`, así que una al final
    // borraba el valor del programa, y una entre el cuerpo de un `if` y su
    // `else` cerraba el `if` y dejaba el `else` huérfano.
    const texto = expanded.trim();
    if (texto === '' || texto.startsWith('#')) return;
    const indent = expanded.length - expanded.trimStart().length;
    toks.push({ indent, text: texto, line: startLine + i });
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
      const siguen = lines.slice(headIdx + 1).some((l) => {
        const t = l.trim();
        return t !== '' && !t.startsWith('#');
      });
      if (!siguen) {
        // Forma de una línea: `f(x) := x^2`, `r := 5`.
        return { name, params, body: [stmtFromLine(inlineBody, headIdx + 1)] };
      }
      // Con más líneas detrás, la primera no era una cabecera. Tomarla por una
      // de una línea descartaba todo lo demás EN SILENCIO: `total := 0` y un
      // bucle debajo daban `total = 0`, sin un error que avisara.
      if (params !== undefined) {
        throw new Error(
          `«${headLine.trim()}» es una función de una línea y lleva más líneas debajo: ` +
            `deja la cabecera sola («${name}(${params.join(', ')}) :=») y el cuerpo indentado debajo`,
        );
      }
      // Sin parámetros es un programa anónimo que empieza asignando.
      const toks = tokenize(lines, 1);
      return { body: parseBlock(toks, { i: 0 }, toks[0]?.indent ?? 0) };
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
export function runProgram(body: Stmt[], scope: Record<string, unknown>, ctx: ProgramContext): unknown {
  try {
    return execBlock(body, scope, ctx);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    if (e instanceof BreakSignal || e instanceof ContinueSignal) {
      throw new Error("'break'/'continue' fuera de un bucle");
    }
    throw e;
  }
}

/**
 * Ejecuta una función de usuario: cuenta la llamada contra el tope y vigila la
 * profundidad.
 *
 * La llamada cuenta como una vuelta porque una recursión no necesita bucles
 * para desbocarse: `fib(40)` son cientos de millones de llamadas sin un solo
 * `for`, y con el contador mirando solo los bucles colgaba la pestaña.
 */
export function runFunction(body: Stmt[], scope: Record<string, unknown>, ctx: ProgramContext): unknown {
  const g = ctx.guard;
  if (++g.n > ctx.maxIters) throw iterLimit();
  if (g.profundidad >= MAX_PROFUNDIDAD) {
    throw new Error(`Recursión demasiado profunda (más de ${MAX_PROFUNDIDAD} llamadas anidadas)`);
  }
  g.profundidad++;
  try {
    return runProgram(body, scope, ctx);
  } finally {
    g.profundidad--;
  }
}

/** Ejecuta sentencias en orden; devuelve el valor de la última expresión suelta. */
function execBlock(stmts: Stmt[], scope: Record<string, unknown>, ctx: ProgramContext): unknown {
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
        // El valor del `if` es el de la rama que se tomó: un `if/else` como
        // última sentencia es la forma natural de escribir «devuelve A o B», y
        // descartarlo dejaba el programa sin valor. Un `if` sin rama tomada
        // deja `last` en `undefined`, igual que una sentencia sin valor.
        //
        // Los bucles NO dan valor, a propósito: la última vuelta de un `for`
        // no es un resultado que nadie espere ver.
        last = undefined;
        for (const br of s.branches) {
          if (br.cond === undefined || truthy(ctx.evaluate(br.cond, scope))) {
            last = execBlock(br.body, scope, ctx);
            break;
          }
        }
        break;
      }
      case 'for': {
        // El tope se comprueba ANTES de evaluar el iterador, no después.
        //
        // math.js materializa un rango dentro de su propio `evaluate`: con
        // `for i in 1:1e9` la pestaña moría construyendo un array de mil
        // millones de elementos sin que el guard llegara a contar una sola
        // vuelta, y con el límite de 100.000 iteraciones mirando.
        const n = tamanoDeRango(s.iter, scope, ctx);
        if (n !== null && n > ctx.maxIters) throw iterLimit();
        const items = toIterable(evaluarIterador(s.iter, scope, ctx), ctx.maxIters);
        for (const item of items) {
          if (++ctx.guard.n > ctx.maxIters) throw iterLimit();
          scope[s.varName] = item;
          try {
            execBlock(s.body, scope, ctx);
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
          if (++ctx.guard.n > ctx.maxIters) throw iterLimit();
          try {
            execBlock(s.body, scope, ctx);
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

/**
 * El valor de verdad de una condición.
 *
 * `Boolean(v)` daba por cierto cualquier objeto, y eso tomaba la rama
 * equivocada en silencio en los tres casos que salen de verdad en una hoja: una
 * comparación entre vectores (`v > 0` da una matriz de booleanos), una cantidad
 * con unidad (`0 m` es un objeto, luego «verdadero») y un `NaN` (que no es `0`).
 * La cantidad se juzga por su valor; la matriz y el NaN no tienen una respuesta
 * correcta, así que son un error que lo dice.
 */
function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (Number.isNaN(v)) throw new Error('La condición dio NaN: revisa la expresión (¿una división 0/0?)');
    return v !== 0;
  }
  if (Array.isArray(v) || (v && typeof (v as { toArray?: unknown }).toArray === 'function')) {
    throw new Error(
      'La condición dio una matriz, no un sí o un no: compara elemento a elemento, o usa min()/max() sobre ella',
    );
  }
  const cantidad = v as { units?: unknown; value?: unknown } | null;
  if (cantidad && typeof cantidad === 'object' && cantidad.units && typeof cantidad.value === 'number') {
    const valor = cantidad.value;
    if (Number.isNaN(valor)) throw new Error('La condición dio NaN: revisa la expresión (¿una división 0/0?)');
    return valor !== 0;
  }
  return Boolean(v);
}

/**
 * Corta la expresión por los `:` de NIVEL SUPERIOR.
 *
 * Se salta lo que va dentro de paréntesis, corchetes, llaves o comillas, para
 * no partir `f(a:b)` ni una cadena que contenga dos puntos.
 */
function partirEnNivelCero(expr: string): string[] {
  const partes: string[] = [];
  let hondo = 0;
  let comilla: string | null = null;
  let ini = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (comilla) {
      if (c === '\\') i++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") comilla = c;
    else if (c === '(' || c === '[' || c === '{') hondo++;
    else if (c === ')' || c === ']' || c === '}') hondo--;
    else if (c === ':' && hondo === 0) {
      partes.push(expr.slice(ini, i));
      ini = i + 1;
    }
  }
  partes.push(expr.slice(ini));
  return partes;
}

/**
 * Cuántos elementos tendría el iterador si es un rango `a:b` o `a:b:c`.
 * `null` si no lo es (una lista, una matriz, una llamada a función).
 *
 * Los extremos se evalúan SUELTOS: son escalares y no cuesta nada, mientras que
 * evaluar el rango entero es justo lo que hay que evitar. Si algo no cuadra
 * —una unidad, un símbolo raro— devuelve `null` y el camino normal se encarga,
 * que es lo que había antes de esta comprobación.
 */
function tamanoDeRango(
  iter: string,
  scope: Record<string, unknown>,
  ctx: ProgramContext,
): number | null {
  const partes = partirEnNivelCero(iter);
  if (partes.length !== 2 && partes.length !== 3) return null;

  const num = (s: string): number | null => {
    try {
      const v = ctx.evaluate(s.trim(), scope);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };

  const desde = num(partes[0]);
  // math.js escribe `a:paso:b`, con el paso EN MEDIO.
  const paso = partes.length === 3 ? num(partes[1]) : 1;
  const hasta = num(partes[partes.length - 1]);
  if (desde === null || hasta === null || paso === null || paso === 0) return null;

  return Math.max(0, Math.floor((hasta - desde) / paso) + 1);
}

/**
 * Evalúa el iterador traduciendo el desbordamiento de math.js.
 *
 * `tamanoDeRango` ataja el caso que se da de verdad —`1:1e9`, que es `1:1e2`
 * mal tecleado—, pero no cubre lo que no es un rango literal. Ahí math.js
 * revienta con «Invalid array length», que no le dice nada a quien escribió el
 * bucle.
 *
 * Lo que sigue SIN cubrir, y a sabiendas: una expresión que reserve la memoria
 * de golpe (`ones(20000, 20000)`) agota el montón dentro de math.js, y eso no
 * es un error que se pueda atrapar. Tampoco es propio del `for`: una región
 * `math` con esa misma expresión hace exactamente lo mismo.
 */
function evaluarIterador(iter: string, scope: Record<string, unknown>, ctx: ProgramContext): unknown {
  try {
    return ctx.evaluate(iter, scope);
  } catch (e) {
    // Solo el desbordamiento del array. Traducir CUALQUIER `RangeError` metía
    // aquí también el de la pila de JavaScript, y una recursión desbocada dentro
    // del iterador salía como «límite de iteraciones».
    if (e instanceof RangeError && /array length/i.test(e.message)) throw iterLimit();
    throw e;
  }
}

/**
 * Normaliza un rango (1:n) o lista de math.js a un array iterable, con el tope
 * aplicado al TAMAÑO y no solo a las vueltas ya dadas.
 *
 * Un vector se recorre por ELEMENTOS aunque venga como matriz de una fila o de
 * una columna. `[1:3]` es una matriz 1×3 y `M[:, 1]` una n×1: recorrerlas por
 * filas daba una sola vuelta con el vector entero, o n vueltas con un `[x]` en
 * vez de un número, y la suma de un bucle salía como una matriz.
 */
function toIterable(v: unknown, maxIters: number): unknown[] {
  let arr: unknown[];
  if (v && typeof (v as { toArray?: unknown }).toArray === 'function') {
    arr = (v as { toArray: () => unknown[] }).toArray();
  } else if (Array.isArray(v)) {
    arr = v;
  } else {
    throw new Error("'for ... in' espera un rango (p. ej. 1:n) o una lista [..]");
  }
  if (arr.length === 1 && Array.isArray(arr[0])) {
    arr = arr[0];
  } else if (arr.length > 0 && arr.every((fila) => Array.isArray(fila) && fila.length === 1)) {
    arr = arr.map((fila) => (fila as unknown[])[0]);
  }
  if (arr.length > maxIters) throw iterLimit();
  return arr;
}
