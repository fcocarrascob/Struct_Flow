// ─────────────────────────────────────────────────────────────────────────────
// De la obra al grafo que se dibuja.
//
// LOS NODOS Y LAS FLECHAS NO SE GUARDAN: SE DERIVAN
// -------------------------------------------------
// Lo que persiste es el documento —qué módulos hay, qué cargas, las mini hojas y
// las referencias a la biblioteca—. Los nodos, los valores y **las flechas**
// salen de acá cada vez que se pinta.
//
// Las flechas de datos son la novedad, y son lo que convierte esto en un grafo
// de cálculo: una flecha de A a B significa «B nombra algo que define A», y sale
// de `usos` del evaluador, que a su vez sale de leer las hojas. Nadie las
// dibuja y nadie las puede dejar desfasadas — borrar la línea que usaba
// `A_planta` borra la flecha, porque la flecha ERA esa línea.
//
// LA VALIDACIÓN VIAJA COMO SEVERIDAD, NO COMO BLOQUEO
// ---------------------------------------------------
// Nombres repetidos entre nodos, ciclos, una partida sin variable elegida: nada
// de eso impide escribir. Pinta el nodo en rojo con su
// motivo. Bloquear el editor mientras se teclea obliga a pelear con él en cada
// letra; el color dice lo mismo y deja trabajar.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMathRegion } from '../../lib/worksheet';
import { peor, type AristaGrafo, type NodoGrafo, type Severidad } from '../contrato';
import { evaluarCarga, type EvaluacionCarga } from './calculo';
import { quedoAtras, type Genericas } from './biblioteca';
import { problemaDeGrafo, type EvaluacionObra } from './evaluacion';
import {
  ID_NODO_CARGAS,
  idNodoDeCalculo,
  idNodoDeCarga,
  idNodoDeSubcarga,
} from './ids';
import { problemaDeNombre, type NodoCalculo, type Obra } from './modelo';

export * from './ids';

export interface Proyeccion {
  nodos: NodoGrafo[];
  aristas: AristaGrafo[];
  /** El desglose ya resuelto, por id de carga. Se emite junto al grafo porque el
   *  panel lo necesita entero y calcularlo dos veces daría dos totales. */
  evaluaciones: Record<string, EvaluacionCarga>;
}

/** Un nodo de obra no sale de ningún archivo y siempre se puede editar; el resto
 *  del contrato se completa acá para no repetirlo en cada caso. */
function nodo(parcial: Partial<NodoGrafo> & Pick<NodoGrafo, 'id' | 'tipo' | 'etiqueta'>): NodoGrafo {
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

/**
 * Lo que hay que decir de la hoja libre de un nodo que ahora lleva planilla.
 *
 * Los bloques NO se borran al importar, a propósito: quitar la planilla
 * devuelve el tanteo del que salió la decisión de buscar una genérica. Pero
 * mientras tanto esa hoja no se evalúa, así que los nombres que definía dejaron
 * de existir para el resto de la obra — y los nodos que los usaban pasaban a
 * «variable indefinida» sin que nada dijera de dónde venía el apagón.
 */
function avisoDeHojaTapada(bloques: { tipo: string; src: string }[]): string[] {
  const nombres = bloques
    .filter((b) => b.tipo === 'math')
    .map((b) => parseMathRegion(b.src).varName)
    .filter((v): v is string => Boolean(v));
  if (nombres.length === 0) return [];
  return [
    `La hoja de este nodo no se evalúa mientras lo respalde una planilla: ` +
      `${[...new Set(nombres)].join(', ')} ya no existe para el resto de la obra. ` +
      'Publica lo que haga falta desde las salidas de la planilla.',
  ];
}

/** El nodo de un cálculo suelto: una hoja libre o una genérica instanciada. */
function nodoDeCalculo(k: NodoCalculo, genericas: Genericas, ev: EvaluacionObra): NodoGrafo {
  const id = idNodoDeCalculo(k.id);
  const base = { id, tipo: 'calculo', etiqueta: k.nombre || 'Cálculo' };

  if (!k.importada) {
    const define = ev.define.get(id) ?? [];
    const enGrafo = problemaDeGrafo(id, ev);
    const errores = k.bloques.filter((b) => ev.results[b.id]?.error).length;
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
          ? k.bloques.length === 0
            ? 'hoja vacía'
            : 'no define ninguna variable'
          : define.join(', '),
      campos: { define: define.length, bloques: k.bloques.length },
      severidad,
      motivos,
    });
  }

  const estado = genericas[k.importada.slug];
  if (!estado || estado.fase === 'cargando') {
    return nodo({ ...base, subtitulo: `${k.importada.slug} · cargando…` });
  }
  if (estado.fase === 'error') {
    return nodo({ ...base, subtitulo: k.importada.slug, severidad: 'error', motivos: [estado.motivo] });
  }

  const modulo = estado.modulo;
  // La evaluación es la que hizo `evaluarObra` en el sitio de este nodo dentro
  // del orden de lectura, con los campos atados ya resueltos contra el scope que
  // había ahí. Reevaluar acá sería una segunda autoridad sobre el mismo número.
  const instancia = ev.importadas.get(id);
  if (!instancia) return nodo({ ...base, subtitulo: `${k.importada.slug} · cargando…` });
  const evg = instancia.ev;
  const motivos: string[] = [];
  let severidad: Severidad = 'ok';

  // Un alias repetido o un ciclo le pasan a una planilla igual que a una hoja.
  const enGrafo = problemaDeGrafo(id, ev);
  if (enGrafo) {
    motivos.push(enGrafo);
    severidad = 'error';
  }
  motivos.push(...avisoDeHojaTapada(k.bloques));

  if (motivos.length && severidad === 'ok') severidad = 'aviso';

  if (quedoAtras(modulo, k.importada)) {
    motivos.push('La genérica cambió en la biblioteca desde que la importaste: revisa el resultado.');
    severidad = peor(severidad, 'aviso');
  }
  if (evg.errores.length) {
    motivos.push(`${evg.errores.length} región(es) con error: ${evg.errores[0].error}`);
    severidad = peor(severidad, 'error');
  }

  const global = evg.scope.v_global;
  const veredicto = global === true ? 'CUMPLE' : global === false ? 'NO CUMPLE' : '';
  if (global === false) severidad = peor(severidad, 'error');

  // Lo que publica va en el subtítulo, como en un nodo de hoja libre: es lo que
  // el resto de la obra puede nombrar, y no verlo obliga a abrir el panel para
  // saber si esta planilla alimenta a alguien.
  const publica = ev.define.get(id) ?? [];
  const veredictoTexto = veredicto ? `${modulo.norma || modulo.disciplina} · ${veredicto}` : modulo.norma;

  return nodo({
    ...base,
    subtitulo: publica.length ? `${veredictoTexto} · publica ${publica.join(', ')}` : veredictoTexto,
    campos: {
      planilla: k.importada.slug,
      entradas: Object.keys(k.importada.entradas).length,
      publica: publica.join(', '),
    },
    severidad,
    motivos,
  });
}

export function proyectar(obra: Obra, ev: EvaluacionObra, genericas: Genericas = {}): Proyeccion {
  const nodos: NodoGrafo[] = [];
  const aristas: AristaGrafo[] = [];
  const evaluaciones: Record<string, EvaluacionCarga> = {};

  for (const k of obra.calculos) nodos.push(nodoDeCalculo(k, genericas, ev));

  if (obra.modulos.includes('cargas')) {
    let peorDeLasCargas: Severidad = 'ok';
    let conProblema = 0;

    for (const c of obra.cargas) {
      const problemaNombre = problemaDeNombre(c, obra.cargas);
      const motivos = problemaNombre ? [problemaNombre] : [];
      let severidad: Severidad = problemaNombre ? 'error' : 'ok';
      // Toda carga se desglosa: una nieve y un viento se respaldan con partidas
      // igual que una permanente. El subtítulo es lo que hay dentro, no un total:
      // una carga agrupa sus partidas y no las suma (ver `calculo.ts`).
      const evc = evaluarCarga(c, ev, genericas);
      evaluaciones[c.id] = evc;
      const subtitulo = evc.resumen;

      if (c.subcargas.length === 0) {
        motivos.push('Sin partidas: agrega el desglose para respaldar la carga.');
        severidad = peor(severidad, 'aviso');
      } else {
        const rotas = evc.valores.filter((v) => v.problema).length;
        if (rotas > 0) {
          motivos.push(`${rotas} partida(s) sin valor.`);
          severidad = peor(severidad, 'error');
        }
      }

      for (const sub of c.subcargas) {
        const idSub = idNodoDeSubcarga(sub.id);
        const v = evc.valores.find((x) => x.id === sub.id);
        let sevSub: Severidad = v?.problema ? 'error' : 'ok';
        const motivosSub = v?.problema ? [v.problema] : [];

        // También para una partida con planilla: su alias puede chocar con el de
        // otro nodo, y puede quedar en un ciclo por un campo atado.
        const enGrafo = problemaDeGrafo(idSub, ev);
        if (enGrafo) {
          motivosSub.push(enGrafo);
          sevSub = peor(sevSub, 'error');
        }
        if (sub.importada) {
          const tapada = avisoDeHojaTapada(sub.bloques);
          motivosSub.push(...tapada);
          if (tapada.length) sevSub = peor(sevSub, 'aviso');
        }

        const estadoSub = sub.importada ? genericas[sub.importada.slug] : undefined;
        if (sub.importada && estadoSub?.fase === 'lista' && quedoAtras(estadoSub.modulo, sub.importada)) {
          motivosSub.push('La genérica cambió en la biblioteca desde que la importaste.');
          sevSub = peor(sevSub, 'aviso');
        }

        nodos.push(
          nodo({
            id: idSub,
            tipo: 'subcarga',
            etiqueta: sub.nombre.trim() || '(sin nombre)',
            // El valor y de qué variable sale, que ya no se deduce del nombre.
            subtitulo: v?.variable ? `${v.texto} · ${v.variable}` : (v?.texto ?? '—'),
            campos: sub.importada
              ? {
                  planilla: sub.importada.slug,
                  salida: sub.importada.salida ?? '',
                  publica: (ev.define.get(idSub) ?? []).join(', '),
                }
              : { bloques: sub.bloques.length, define: (ev.define.get(idSub) ?? []).join(', ') },
            severidad: sevSub,
            motivos: motivosSub,
          }),
        );
        aristas.push({
          desde: idNodoDeCarga(c.id),
          hasta: idSub,
          tipo: 'compone',
          etiqueta: '',
          severidad: sevSub,
        });
      }

      if (severidad !== 'ok') conProblema++;
      peorDeLasCargas = peor(peorDeLasCargas, severidad);

      nodos.push(
        nodo({
          id: idNodoDeCarga(c.id),
          tipo: 'carga',
          etiqueta: c.nombre.trim() || '(sin nombre)',
          subtitulo,
          campos: { nombre: c.nombre, partidas: c.subcargas.length },
          severidad,
          motivos,
        }),
      );
      aristas.push({
        desde: ID_NODO_CARGAS,
        hasta: idNodoDeCarga(c.id),
        tipo: 'define',
        etiqueta: '',
        severidad,
      });
    }

    nodos.unshift(
      nodo({
        id: ID_NODO_CARGAS,
        tipo: 'cargas',
        etiqueta: 'Cargas',
        subtitulo:
          obra.cargas.length === 0
            ? 'sin cargas todavía'
            : `${obra.cargas.length} definida${obra.cargas.length === 1 ? '' : 's'}`,
        campos: { definidas: obra.cargas.length },
        severidad: peorDeLasCargas,
        motivos:
          conProblema > 0
            ? [`${conProblema} carga${conProblema === 1 ? '' : 's'} con algo que mirar.`]
            : [],
      }),
    );
  }

  // Las flechas de datos van al final y solo entre nodos que existen: un uso
  // desde una hoja cuyo nodo no se pintó no puede dejar una arista colgando.
  const vivos = new Set(nodos.map((n) => n.id));
  for (const a of aristasDeDatos(ev)) {
    if (vivos.has(a.desde) && vivos.has(a.hasta)) aristas.push(a);
  }

  return { nodos, aristas, evaluaciones };
}
