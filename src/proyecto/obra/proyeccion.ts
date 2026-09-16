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
// Nombres repetidos entre nodos, ciclos, unidades que no suman, una partida sin
// variable elegida: nada de eso impide escribir. Pinta el nodo en rojo con su
// motivo. Bloquear el editor mientras se teclea obliga a pelear con él en cada
// letra; el color dice lo mismo y deja trabajar.
// ─────────────────────────────────────────────────────────────────────────────

import { peor, type AristaGrafo, type NodoGrafo, type Severidad } from '../contrato';
import { evaluarCarga, type EvaluacionCarga } from './calculo';
import { evaluarImportada, quedoAtras, type Genericas } from './biblioteca';
import { problemaDeGrafo, type EvaluacionObra } from './evaluacion';
import {
  ID_NODO_CARGAS,
  idNodoDeCalculo,
  idNodoDeCarga,
  idNodoDeSubcarga,
} from './ids';
import { admiteSubcargas, problemaDeNombre, tipoCarga, type NodoCalculo, type Obra } from './modelo';

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
  // Con el scope de la obra: si algún campo está atado a una expresión, el
  // veredicto del nodo tiene que salir del valor que esa expresión produce, no
  // del número que quedó guardado.
  const evg = evaluarImportada(modulo, k.importada, ev.scope);
  const motivos: string[] = [];
  let severidad: Severidad = 'ok';

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

  return nodo({
    ...base,
    subtitulo: veredicto ? `${modulo.norma || modulo.disciplina} · ${veredicto}` : modulo.norma,
    campos: { planilla: k.importada.slug, entradas: Object.keys(k.importada.entradas).length },
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
      const t = tipoCarga(c.tipo);
      let subtitulo = t.simbolo ? `${t.simbolo} · ${t.nombre}` : t.nombre;

      if (admiteSubcargas(c.tipo)) {
        const evc = evaluarCarga(c, ev, genericas);
        evaluaciones[c.id] = evc;
        subtitulo = `${t.simbolo} · ${evc.totalTexto}`;

        if (c.subcargas.length === 0) {
          motivos.push('Sin partidas: agrega el desglose para que la carga tenga un valor.');
          severidad = peor(severidad, 'aviso');
        } else {
          const rotas = evc.valores.filter((v) => v.problema).length;
          if (rotas > 0) {
            motivos.push(`${rotas} partida(s) sin valor.`);
            severidad = peor(severidad, 'error');
          }
          if (evc.problemaTotal) {
            motivos.push(evc.problemaTotal);
            severidad = peor(severidad, 'error');
          }
        }

        for (const sub of c.subcargas) {
          const idSub = idNodoDeSubcarga(sub.id);
          const v = evc.valores.find((x) => x.id === sub.id);
          let sevSub: Severidad = v?.problema ? 'error' : 'ok';
          const motivosSub = v?.problema ? [v.problema] : [];

          const enGrafo = sub.importada ? '' : problemaDeGrafo(idSub, ev);
          if (enGrafo) {
            motivosSub.push(enGrafo);
            sevSub = peor(sevSub, 'error');
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
                ? { planilla: sub.importada.slug, salida: sub.importada.salida ?? '' }
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
      }

      if (severidad !== 'ok') conProblema++;
      peorDeLasCargas = peor(peorDeLasCargas, severidad);

      nodos.push(
        nodo({
          id: idNodoDeCarga(c.id),
          tipo: 'carga',
          etiqueta: c.nombre.trim() || '(sin nombre)',
          subtitulo,
          campos: { nombre: c.nombre, tipo: t.nombre, simbolo: t.simbolo },
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
