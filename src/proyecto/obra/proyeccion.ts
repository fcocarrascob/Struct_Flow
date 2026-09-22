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

/** El nodo de un cálculo suelto: una hoja libre o un cálculo con frontera. */
function nodoDeCalculo(k: NodoCalculo, genericas: Genericas, ev: EvaluacionObra): NodoGrafo {
  const id = idNodoDeCalculo(k.id);
  const base = { id, tipo: 'calculo', etiqueta: k.nombre || 'Cálculo' };
  const f = k.frontera;

  if (!f) {
    const define = ev.define.get(id) ?? [];
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
  // había ahí. Reevaluar acá sería una segunda autoridad sobre el mismo número.
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

      // UNA CARGA DE UNA SOLA PARTIDA SE PLIEGA SOBRE ELLA. Un patrón respaldado
      // por una hoja dibujaba dos tarjetas con el mismo número —en el taller de
      // soldadura, 16 de 21 nodos—, y la de la carga no agregaba nada: agrupar es
      // lo suyo, y con una sola partida no hay qué agrupar. Queda el nodo de la
      // PARTIDA, que es el que abre la hoja, con el nombre de la carga encima; su
      // panel sigue llevando a la carga para renombrarla o sumarle partidas. Se
      // despliega sola en cuanto tiene dos.
      const plegada = c.subcargas.length === 1;

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
        const fSub = sub.frontera;
        const estadoSub =
          fSub?.procedencia === 'biblioteca' && fSub.slug ? genericas[fSub.slug] : undefined;
        if (fSub && estadoSub?.fase === 'lista' && quedoAtras(estadoSub.modulo, fSub)) {
          motivosSub.push('La genérica cambió en la biblioteca desde que la importaste.');
          sevSub = peor(sevSub, 'aviso');
        }

        // El valor y de qué variable sale, que ya no se deduce del nombre.
        const valorSub = v?.variable ? `${v.texto} · ${v.variable}` : (v?.texto ?? '—');
        if (plegada && problemaNombre) {
          // La carga ya no se pinta, así que un nombre vacío o repetido tiene que
          // verse en esta tarjeta. Solo eso: el «1 partida sin valor» de la
          // carga repetiría el motivo que la partida ya da con más detalle.
          motivosSub.unshift(problemaNombre);
          sevSub = peor(sevSub, 'error');
        }

        nodos.push(
          nodo({
            id: idSub,
            tipo: plegada ? 'carga-plegada' : 'subcarga',
            etiqueta: plegada ? c.nombre.trim() || '(sin nombre)' : sub.nombre.trim() || '(sin nombre)',
            subtitulo: plegada ? `${sub.nombre.trim() || '(sin nombre)'} · ${valorSub}` : valorSub,
            campos: fSub
              ? {
                  planilla: fSub.slug ?? fSub.origen?.slug ?? 'hoja propia',
                  salida: fSub.salida ?? '',
                  publica: (ev.define.get(idSub) ?? []).join(', '),
                }
              : { bloques: sub.hoja.length, define: (ev.define.get(idSub) ?? []).join(', ') },
            severidad: sevSub,
            motivos: motivosSub,
          }),
        );
        aristas.push(
          plegada
            ? { desde: ID_NODO_CARGAS, hasta: idSub, tipo: 'define', etiqueta: '', severidad: sevSub }
            : { desde: idNodoDeCarga(c.id), hasta: idSub, tipo: 'compone', etiqueta: '', severidad: sevSub },
        );
      }

      if (severidad !== 'ok') conProblema++;
      peorDeLasCargas = peor(peorDeLasCargas, severidad);
      if (plegada) continue;

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
