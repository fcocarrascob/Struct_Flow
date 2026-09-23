// ─────────────────────────────────────────────────────────────────────────────
// De la obra al grafo que se dibuja.
//
// LOS NODOS Y LAS FLECHAS NO SE GUARDAN: SE DERIVAN
// -------------------------------------------------
// Lo que persiste es el documento —qué módulos hay, los cálculos con sus hojas,
// los grupos y las referencias a la biblioteca—. Los nodos, los valores y **las flechas**
// salen de aquí cada vez que se pinta.
//
// Las flechas de datos son la novedad, y son lo que convierte esto en un grafo
// de cálculo: una flecha de A a B significa «B nombra algo que define A», y sale
// de `usos` del evaluador, que a su vez sale de leer las hojas. Nadie las
// dibuja y nadie las puede dejar desfasadas — borrar la línea que usaba
// `A_planta` borra la flecha, porque la flecha ERA esa línea.
//
// LA VALIDACIÓN VIAJA COMO SEVERIDAD, NO COMO BLOQUEO
// ---------------------------------------------------
// Nombres repetidos entre nodos, ciclos, un bloque con error: nada
// de eso impide escribir. Pinta el nodo en rojo con su
// motivo. Bloquear el editor mientras se teclea obliga a pelear con él en cada
// letra; el color dice lo mismo y deja trabajar.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMathRegion } from '../../lib/worksheet';
import { peor, type AristaGrafo, type NodoGrafo, type Severidad } from '../contrato';
import { quedoAtras, type Genericas } from './biblioteca';
import { problemaDeGrafo, type EvaluacionObra } from './evaluacion';
import { ID_NODO_SAP, idNodoDeCalculo } from './ids';
import { grupoPorId, type Grupo, type NodoCalculo, type Obra, type Revision } from './modelo';

export * from './ids';

/**
 * Qué ES el nodo, para dibujarlo: el ícono y el rótulo de la tarjeta.
 *
 * SE DERIVA, NO SE DECLARA. Una biblioteca lo es por su frontera, y un resumen
 * es la hoja libre que solo cita lo que publican los demás (no define nada y usa
 * algo). Declararlo sería un campo más que puede contradecir a la hoja.
 */
export type ClaseNodo = 'calculo' | 'biblioteca' | 'resumen' | 'modelo';

/**
 * El nodo de una obra: el del contrato, más lo que solo este lienzo dibuja.
 * `contrato.ts` no cambia porque lo comparte el canvas del harness.
 */
export interface NodoDeObra extends NodoGrafo {
  clase: ClaseNodo;
  grupo?: Grupo;
  /** La marca «Revisar» del cálculo. No toca la severidad. */
  revisar?: Revision;
}

export interface Proyeccion {
  nodos: NodoDeObra[];
  aristas: AristaGrafo[];
}

/** Un nodo de obra no sale de ningún archivo y siempre se puede editar; el resto
 *  del contrato se completa aquí para no repetirlo en cada caso. */
function nodo(
  parcial: Partial<NodoDeObra> & Pick<NodoDeObra, 'id' | 'tipo' | 'etiqueta' | 'clase'>,
): NodoDeObra {
  return {
    subtitulo: '',
    campos: {},
    severidad: 'ok',
    archivo: '',
    linea: 0,
    editable: true,
    motivos: [],
    ...parcial,
  };
}

/** Cuántos nombres se citan en una flecha antes de resumir. Tres caben; con
 *  ocho, la etiqueta tapa el nodo de destino. */
const NOMBRES_EN_FLECHA = 3;

/**
 * Las flechas de datos: una por par (quien define → quien usa), con los nombres
 * que viajan por ella. Una sola flecha por par y no una por nombre, porque dos
 * nodos que comparten seis variables no son seis relaciones.
 */
function aristasDeDatos(ev: EvaluacionObra): AristaGrafo[] {
  const porPar = new Map<string, { desde: string; hasta: string; nombres: string[] }>();
  for (const [idNodo, usa] of ev.usos) {
    for (const n of usa) {
      const desde = ev.duenio.get(n);
      if (!desde || desde === idNodo) continue;
      const clave = `${desde}->${idNodo}`;
      const p = porPar.get(clave) ?? { desde, hasta: idNodo, nombres: [] };
      p.nombres.push(n);
      porPar.set(clave, p);
    }
  }
  return [...porPar.values()].map((p) => {
    const nombres = [...p.nombres].sort();
    const visibles = nombres.slice(0, NOMBRES_EN_FLECHA).join(', ');
    return {
      desde: p.desde,
      hasta: p.hasta,
      tipo: 'dato',
      etiqueta:
        nombres.length > NOMBRES_EN_FLECHA
          ? `${visibles} +${nombres.length - NOMBRES_EN_FLECHA}`
          : visibles,
      severidad: 'ok' as Severidad,
    };
  });
}

/** El nodo de un cálculo suelto: una hoja libre o un cálculo con frontera. */
function nodoDeCalculo(k: NodoCalculo, genericas: Genericas, ev: EvaluacionObra, obra: Obra): NodoDeObra {
  const id = idNodoDeCalculo(k.id);
  const f = k.frontera;
  const define = ev.define.get(id) ?? [];
  const usa = [...(ev.usos.get(id) ?? [])];
  const clase: ClaseNodo =
    f?.procedencia === 'biblioteca' ? 'biblioteca' : !f && define.length === 0 && usa.length > 0 ? 'resumen' : 'calculo';
  const base = {
    id,
    tipo: 'calculo',
    etiqueta: k.nombre || 'Cálculo',
    clase,
    grupo: grupoPorId(obra, k.grupo),
    revisar: k.revisar,
  };

  if (!f) {
    const enGrafo = problemaDeGrafo(id, ev);
    const errores = k.hoja.filter((r) => ev.results[r.id]?.error).length;
    const motivos: string[] = [];
    let severidad: Severidad = 'ok';
    if (enGrafo) {
      motivos.push(enGrafo);
      severidad = 'error';
    }
    if (errores) {
      motivos.push(`${errores} bloque(s) con error.`);
      severidad = 'error';
    }
    return nodo({
      ...base,
      subtitulo:
        define.length === 0
          ? k.hoja.length === 0
            ? 'hoja vacía'
            : clase === 'resumen'
              ? `resume ${usa.length} valor${usa.length === 1 ? '' : 'es'} de la obra`
              : 'no define ninguna variable'
          : define.join(', '),
      campos: { define: define.length, bloques: k.hoja.length },
      severidad,
      motivos,
    });
  }

  const estado = f.procedencia === 'biblioteca' && f.slug ? genericas[f.slug] : undefined;
  if (f.procedencia === 'biblioteca') {
    if (!estado || estado.fase === 'cargando') {
      return nodo({ ...base, subtitulo: `${f.slug} · cargando…` });
    }
    if (estado.fase === 'error') {
      return nodo({ ...base, subtitulo: f.slug ?? '', severidad: 'error', motivos: [estado.motivo] });
    }
  }

  const modulo = estado?.fase === 'lista' ? estado.modulo : undefined;
  // La evaluación es la que hizo `evaluarObra` en el sitio de este nodo dentro
  // del orden de lectura, con los campos atados ya resueltos contra el scope que
  // había ahí. Reevaluar aquí sería una segunda autoridad sobre el mismo número.
  const instancia = ev.importadas.get(id);
  if (!instancia) return nodo({ ...base, subtitulo: `${f.slug ?? k.nombre} · cargando…` });
  const motivos: string[] = [];
  let severidad: Severidad = 'ok';

  // Un alias repetido, un ciclo o un campo atado tapado le pasan a un cálculo con
  // frontera igual que a una hoja libre.
  const enGrafo = problemaDeGrafo(id, ev);
  if (enGrafo) {
    motivos.push(enGrafo);
    severidad = 'error';
  }

  if (modulo && quedoAtras(modulo, f)) {
    motivos.push('La genérica cambió en la biblioteca desde que la importaste: revisa el resultado.');
    severidad = peor(severidad, 'aviso');
  }
  const errores = modulo
    ? (instancia.ev?.errores ?? [])
    : k.hoja.filter((r) => ev.results[r.id]?.error).map((r) => ({ error: ev.results[r.id]!.error! }));
  if (errores.length) {
    // El mensaje crudo del motor, SOLO si no hay uno del grafo que ya lo
    // explique. Con los dos, el nodo repetía en inglés —«Undefined symbol
    // A_planta»— lo que la línea de arriba acababa de decir en español, y en la
    // tarjeta del lienzo solo se ve el primer motivo.
    motivos.push(
      enGrafo
        ? `${errores.length} región(es) con error.`
        : `${errores.length} región(es) con error: ${errores[0].error}`,
    );
    severidad = peor(severidad, 'error');
  }

  const global = instancia.salidas.v_global;
  const veredicto = global === true ? 'CUMPLE' : global === false ? 'NO CUMPLE' : '';
  if (global === false) severidad = peor(severidad, 'error');

  // Lo que publica va en el subtítulo, como en un nodo de hoja libre: es lo que
  // el resto de la obra puede nombrar, y no verlo obliga a abrir el panel para
  // saber si este cálculo alimenta a alguien.
  const publica = ev.define.get(id) ?? [];
  const procedencia = modulo
    ? modulo.norma || modulo.disciplina
    : f.procedencia === 'derivada'
      ? `derivada de ${f.origen?.slug ?? '?'}`
      : 'hoja propia';
  const veredictoTexto = veredicto ? `${procedencia} · ${veredicto}` : procedencia;

  return nodo({
    ...base,
    subtitulo: publica.length ? `${veredictoTexto} · publica ${publica.join(', ')}` : veredictoTexto,
    campos: {
      planilla: f.slug ?? f.origen?.slug ?? '',
      entradas: modulo ? Object.keys(f.entradas ?? {}).length : k.hoja.length,
      publica: publica.join(', '),
    },
    severidad,
    motivos,
  });
}

export function proyectar(obra: Obra, ev: EvaluacionObra, genericas: Genericas = {}): Proyeccion {
  const nodos: NodoDeObra[] = [];
  const aristas: AristaGrafo[] = [];

  for (const k of obra.calculos) nodos.push(nodoDeCalculo(k, genericas, ev, obra));

  // El modelo de SAP2000. Por ahora solo dice con qué modelo se conectó: todavía
  // no publica nada, así que no tiene flechas.
  if (obra.modulos.includes('sap')) {
    nodos.push(
      nodo({
        id: ID_NODO_SAP,
        tipo: 'modelo',
        clase: 'modelo',
        etiqueta: 'SAP2000',
        subtitulo: obra.sap ? obra.sap.modelo : 'sin conectar',
        campos: obra.sap ? { modelo: obra.sap.modelo, version: obra.sap.version } : {},
        severidad: 'ok',
        motivos: [],
      }),
    );
  }

  // Las flechas de datos van al final y solo entre nodos que existen: un uso
  // desde una hoja cuyo nodo no se pintó no puede dejar una arista colgando.
  const vivos = new Set(nodos.map((n) => n.id));
  for (const a of aristasDeDatos(ev)) {
    if (vivos.has(a.desde) && vivos.has(a.hasta)) aristas.push(a);
  }

  return { nodos, aristas };
}
