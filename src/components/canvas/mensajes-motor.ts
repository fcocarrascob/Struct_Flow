// ─────────────────────────────────────────────────────────────────────────────
// Los errores de mathjs, en español.
//
// El motor deja pasar el mensaje de mathjs tal cual (`RegionResult.error`), y
// así tiene que seguir: la obra lo lee para dibujar sus flechas
// (`RE_INDEFINIDO` de `obra/evaluacion.ts` busca «Undefined symbol X») y
// `verify:motor` compara mensajes por texto. Lo que se traduce es lo que VE el
// usuario, en el último paso antes de pintarlo.
//
// Vive fuera de `src/lib/` por la misma razón que `informe-descartes.ts`: el
// harness sella el motor como el hash de árbol de `src/lib` + `scripts`, y
// afinar una frase no puede obligar a resellar. No importa mathjs ni React, así
// que `scripts/lib/motor.mjs` lo compila aparte sin crear una segunda instancia.
//
// Los mensajes propios del motor ya están en español y pasan sin tocar. Lo que
// no se reconoce también pasa tal cual: un mensaje en inglés es mejor que uno
// traducido mal.
// ─────────────────────────────────────────────────────────────────────────────

type Traduccion = [RegExp, (m: RegExpExecArray) => string];

/** El «(char N)» de un error de sintaxis de mathjs, como texto para la cola. */
const enCaracter = (n: string | undefined) => (n ? ` (carácter ${n})` : '');

const TRADUCCIONES: Traduccion[] = [
  [/Undefined symbol ([^\s,]+)/, (m) => `«${m[1]}» no está definida más arriba en la hoja`],
  [
    /Undefined function ([^\s,]+)/,
    (m) => `la función «${m[1]}» no está definida (una función se define en un bloque de programa)`,
  ],
  [
    /Units do not match(?: \('([^']*)' != '([^']*)'\))?/,
    (m) =>
      m[1]
        ? `las unidades no casan: «${m[2]}» no se puede expresar en «${m[1]}»`
        : 'las unidades no casan (por ejemplo, sumar kN con m)',
  ],
  [/Unit "([^"]+)" not found/, (m) => `la unidad «${m[1]}» no existe`],
  [
    /Unexpected type of argument in function (\w+) \(expected: ([^,]+), actual: ([^,]+), index: (\d+)\)/,
    (m) =>
      `tipo inesperado en el argumento ${Number(m[4]) + 1} de ${m[1]}: llegó ${tipo(m[3])} y se esperaba ${tipo(m[2])}. ` +
      '¿Una variable con nombre de unidad, o una unidad donde iba un número?',
  ],
  // La cola «(expected: number or Complex or …, index: 0)» se consume: lista los
  // tipos internos de mathjs y no le dice nada a quien escribe la hoja.
  [/Too few arguments in function (\w+)(?: \([^)]*\))?/, (m) => `faltan argumentos en ${m[1]}`],
  [
    /Too many arguments in function (\w+) \(expected: (\d+), actual: (\d+)\)/,
    (m) => `sobran argumentos en ${m[1]}: admite ${m[2]} y recibió ${m[3]}`,
  ],
  [/Too many arguments in function (\w+)(?: \([^)]*\))?/, (m) => `sobran argumentos en ${m[1]}`],
  [
    /Dimension mismatch in multiplication\. Matrix columns \((\d+)\) must match Vector length \((\d+)\)/,
    (m) => `las dimensiones no casan en el producto: la matriz tiene ${m[1]} columnas y el vector ${m[2]} elementos`,
  ],
  [/Dimension mismatch \((\d+) != (\d+)\)/, (m) => `las dimensiones no coinciden (${m[1]} y ${m[2]})`],
  [
    /shape mismatch:.*size (\d+) to size (\d+)/,
    (m) => `los tamaños no coinciden: uno tiene ${m[1]} elementos y el otro ${m[2]}`,
  ],
  [/Dimension mismatch/, () => 'las dimensiones no coinciden'],
  [/Index out of range \((\d+) [<>] (\d+)\)/, (m) => `índice fuera de rango: ${m[1]} (los índices empiezan en 1)`],
  [/Parenthesis \) expected(?: \(char (\d+)\))?/, (m) => `falta cerrar un paréntesis${enCaracter(m[1])}`],
  [/Parenthesis ] expected(?: \(char (\d+)\))?/, (m) => `falta cerrar un corchete${enCaracter(m[1])}`],
  [/Unexpected end of expression(?: \(char (\d+)\))?/, (m) => `la expresión termina de golpe${enCaracter(m[1])}`],
  [/Value expected(?: \(char (\d+)\))?/, (m) => `falta un valor${enCaracter(m[1])}`],
  [
    /Unexpected part "([^"]*)"(?: \(char (\d+)\))?/,
    (m) => `sobra «${m[1]}»${enCaracter(m[2])}: ¿falta un operador?`,
  ],
  [/Unexpected operator ([^\s(]+)(?: \(char (\d+)\))?/, (m) => `operador inesperado «${m[1]}»${enCaracter(m[2])}`],
  [/Syntax error in part "([^"]*)"(?: \(char (\d+)\))?/, (m) => `error de sintaxis en «${m[1]}»${enCaracter(m[2])}`],
  [
    /No ordering relation is defined for complex numbers/,
    () => 'no se pueden comparar números complejos: hay una raíz o un logaritmo de un negativo',
  ],
  [/Cannot convert "([^"]*)" to a number/, (m) => `«${m[1]}» no es un número`],
  [/Cannot convert (.+) to (.+)/, (m) => `no se puede convertir ${m[1]} a ${m[2]}`],
];

/** Los nombres de tipo de mathjs, en español. Uno desconocido pasa tal cual. */
function tipo(t: string): string {
  const nombres: Record<string, string> = {
    number: 'un número',
    Unit: 'una cantidad con unidad',
    string: 'un texto',
    boolean: 'un booleano',
    Matrix: 'una matriz',
    Array: 'un vector',
    Complex: 'un complejo',
  };
  return nombres[t.trim()] ?? t.trim();
}

/**
 * El mensaje de un error del motor, listo para mostrarlo.
 *
 * `program.ts` antepone contexto al mensaje de mathjs («línea 3: …»), así que
 * las expresiones no se anclan al principio: se traduce el trozo reconocido y
 * se conserva lo que lo rodea.
 */
export function mensajeDeMotor(crudo: string): string {
  for (const [re, traducir] of TRADUCCIONES) {
    const m = re.exec(crudo);
    if (!m) continue;
    const texto = traducir(m);
    const antes = crudo.slice(0, m.index);
    const despues = crudo.slice(m.index + m[0].length);
    // La primera letra en mayúscula cuando la traducción abre el mensaje.
    const cuerpo = antes.trim() === '' ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
    return antes + cuerpo + despues;
  }
  return crudo;
}
