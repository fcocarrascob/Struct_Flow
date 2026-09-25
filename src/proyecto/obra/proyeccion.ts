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

import { erroresDeResultado, parseMathRegion, simbolosDeFormula } from '../../lib/worksheet';
import { peor, type AristaGrafo, type NodoGrafo, type Severidad } from '../grafo';
import { quedoAtras, type Genericas } from './biblioteca';
import { mensajeDeMotor } from '../../components/canvas/mensajes-motor';
import { problemaDeGrafo, type EvaluacionObra } from './evaluacion';
import { ID_NODO_APOYOS, ID_NODO_BASAL, ID_NODO_COMBINACIONES, ID_NODO_MODAL, ID_NODO_SAP, idNodoDeCalculo } from './ids';
import { casosConTraccion, descuadresConBasal, estadoConjunto } from './sap-apoyos';
import { cortesSismicos, fuerza, gravitacionalesConHorizontal } from './sap-basal';
import { atrasoDe, MASA_MINIMA, porcentaje, resumenModal, segundos } from './sap-modal';
import { grupoPorId, type Grupo, type NodoCalculo, type Obra, type Revision } from './modelo';
import { resumirJustificaciones } from './sap-cargas';
import { resumenCombinaciones } from './sap-combinaciones';

export * from './ids';

/**
 * Qué ES el nodo, para dibujarlo: el ícono y el rótulo de la tarjeta.
 *
 * SE DERIVA, NO SE DECLARA. Una biblioteca lo es por su frontera, y un resumen
 * es la hoja libre que solo cita lo que publican los demás (no define nada y usa
 * algo). Declararlo sería un campo más que puede contradecir a la hoja.
 */
export type ClaseNodo = 'calculo' | 'biblioteca' | 'vista' | 'resumen' | 'modelo' | 'combinaciones' | 'resultado';

/**
 * El nodo de una obra: el de `grafo.ts`, que es el que coloca `layout.ts`, más
 * lo que solo este lienzo dibuja.
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

/**
 * Las flechas hacia el nodo SAP2000: de cada nodo que define un nombre que una
 * justificación usa. Mismo criterio que las de datos —una por par, con los
 * nombres que viajan—, así que el trazo de un cálculo llega hasta el modelo.
 */
function aristasDeJustificaciones(obra: Obra, ev: EvaluacionObra): AristaGrafo[] {
  const porNodo = new Map<string, Set<string>>();
  for (const j of obra.justificaciones ?? []) {
    for (const n of simbolosDeFormula(j.expr)) {
      const d = ev.duenio.get(n);
      if (!d) continue;
      const s = porNodo.get(d) ?? new Set<string>();
      s.add(n);
      porNodo.set(d, s);
    }
  }
  return [...porNodo].map(([desde, nombres]) => {
    const lista = [...nombres].sort();
    const visibles = lista.slice(0, NOMBRES_EN_FLECHA).join(', ');
    return {
      desde,
      hasta: ID_NODO_SAP,
      tipo: 'dato',
      etiqueta: lista.length > NOMBRES_EN_FLECHA ? `${visibles} +${lista.length - NOMBRES_EN_FLECHA}` : visibles,
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
    f?.procedencia === 'biblioteca'
      ? 'biblioteca'
      : f?.procedencia === 'vista'
        ? 'vista'
        : !f && define.length === 0 && usa.length > 0
          ? 'resumen'
          : 'calculo';
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
    const errores = k.hoja.filter((r) => erroresDeResultado(ev.results[r.id]).length > 0).length;
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
  if (!instancia && f.procedencia === 'vista') {
    return nodo({ ...base, subtitulo: `vista «${f.vista}»`, severidad: 'error', motivos: [`Esta versión de Flow no conoce la vista «${f.vista}».`] });
  }
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
  const vista = instancia.vista;
  if (vista && f.version !== undefined && f.version !== vista.def.version) {
    motivos.push('La vista cambió en Flow desde que la agregaste: revisa el resultado.');
    severidad = peor(severidad, 'aviso');
  }
  const errores = modulo
    ? (instancia.ev?.errores ?? [])
    : vista
      ? [
          ...vista.errores.map((e) => ({ error: `${e.campo}: ${e.error}` })),
          ...vista.hoja.flatMap((r) => erroresDeResultado(ev.results[r.id]).map((error) => ({ error }))),
        ]
      : k.hoja.flatMap((r) => erroresDeResultado(ev.results[r.id]).map((error) => ({ error })));
  if (errores.length) {
    // El mensaje crudo del motor, SOLO si no hay uno del grafo que ya lo
    // explique. Con los dos, el nodo repetía en inglés —«Undefined symbol
    // A_planta»— lo que la línea de arriba acababa de decir en español, y en la
    // tarjeta del lienzo solo se ve el primer motivo.
    motivos.push(
      enGrafo
        ? `${errores.length} región(es) con error.`
        : `${errores.length} región(es) con error: ${mensajeDeMotor(errores[0].error)}`,
    );
    severidad = peor(severidad, 'error');
  }

  const global = instancia.salidas.v_global;
  const veredicto = global === true ? 'CUMPLE' : global === false ? 'NO CUMPLE' : '';
  if (global === false) severidad = peor(severidad, 'error');
  // Un aviso de la vista no vota en v_global: el nodo sale en ámbar y dice cuál.
  for (const c of vista?.modelo.chequeos ?? []) {
    if (!c.aviso || c.cumple) continue;
    motivos.push(`Aviso: ${c.texto} (${c.valor} ${c.sentido === '<=' ? '>' : '<'} ${c.limite} ${c.unidad}).`);
    severidad = peor(severidad, 'aviso');
  }

  // Lo que publica va en el subtítulo, como en un nodo de hoja libre: es lo que
  // el resto de la obra puede nombrar, y no verlo obliga a abrir el panel para
  // saber si este cálculo alimenta a alguien.
  const publica = ev.define.get(id) ?? [];
  const procedencia = modulo
    ? modulo.norma || modulo.disciplina
    : vista
      ? (() => {
          const n = vista.modelo.chequeos.filter((c) => !c.cumple).length;
          return `vista geométrica · ${n ? `${n} de ${vista.modelo.chequeos.length} verificaciones en falso` : 'sin choques'}`;
        })()
      : f.procedencia === 'derivada'
      ? `derivada de ${f.origen?.slug ?? '?'}`
      : 'hoja propia';
  const veredictoTexto = veredicto ? `${procedencia} · ${veredicto}` : procedencia;

  return nodo({
    ...base,
    subtitulo: publica.length ? `${veredictoTexto} · publica ${publica.join(', ')}` : veredictoTexto,
    campos: {
      planilla: f.slug ?? f.origen?.slug ?? f.vista ?? '',
      entradas: modulo || vista ? Object.keys(f.entradas ?? {}).length : k.hoja.length,
      publica: publica.join(', '),
    },
    severidad,
    motivos,
  });
}

/** El sub-nodo Combinaciones: cuántas hay, y si alguna nombra algo que no está. */
function nodoCombinaciones(obra: Obra): NodoDeObra {
  const lectura = obra.sap?.combinaciones;
  const base = { id: ID_NODO_COMBINACIONES, tipo: 'modelo', clase: 'combinaciones' as const, etiqueta: 'Combinaciones' };
  if (!lectura) return nodo({ ...base, subtitulo: 'sin leer' });
  const r = resumenCombinaciones(lectura, obra.sap?.casos?.lista);
  const envolventes = r.porTipo.find((t) => t.tipo === 'Envolvente')?.n ?? 0;
  const motivos: string[] = [];
  if (r.inexistentes.length) {
    motivos.push(`${r.inexistentes.length} término(s) nombran un caso o una combinación que no está en el modelo leído.`);
  }
  return nodo({
    ...base,
    subtitulo:
      `${r.total} combinaciones` + (envolventes ? ` · ${envolventes} envolvente${envolventes === 1 ? '' : 's'}` : ''),
    severidad: motivos.length ? 'aviso' : 'ok',
    motivos,
  });
}

/**
 * El sub-nodo Modal, el primero de resultados: el periodo fundamental y la masa
 * juntada en X e Y. En aviso si la lectura quedó atrasada o si alguna dirección
 * horizontal no llega al 90 %.
 */
function nodoModal(obra: Obra): NodoDeObra {
  const lectura = obra.sap?.modal;
  const base = { id: ID_NODO_MODAL, tipo: 'modelo', clase: 'resultado' as const, etiqueta: 'Modal' };
  if (!lectura) return nodo({ ...base, subtitulo: 'sin leer' });
  const r = resumenModal(lectura);
  const motivos: string[] = [];
  const atraso = atrasoDe(lectura, obra.sap);
  if (atraso) motivos.push(`Lectura atrasada: ${atraso}. Vuelve a leer.`);
  if (r.conMasas) {
    for (const d of ['X', 'Y'] as const) {
      const a = r.porDireccion[d].acumulada;
      if (a < MASA_MINIMA) motivos.push(`La masa acumulada en ${d} es ${porcentaje(a)}, menos del 90 %.`);
    }
  }
  // Lo que se revisa es el periodo de cada dirección —el del modo que más masa
  // mueve en ella—, no el fundamental: Tx y Ty son los que entran al espectro.
  // Una línea por dirección. Sin masas no se sabe cuál domina, y queda T₁.
  const { X, Y } = r.porDireccion;
  const linea = (d: 'x' | 'y', dom: { n: number; T: number; masa: number }) =>
    `T${d} = ${segundos(dom.T)} · modo ${dom.n} · ${porcentaje(dom.masa)}`;
  const subtitulo =
    r.T1 === undefined
      ? `${lectura.caso} sin modos`
      : X.dominante && Y.dominante
        ? `${linea('x', X.dominante)}\n${linea('y', Y.dominante)}`
        : `T₁ = ${segundos(r.T1)}`;
  return nodo({
    ...base,
    subtitulo,
    severidad: motivos.length ? 'aviso' : 'ok',
    motivos,
  });
}

/**
 * El sub-nodo Reacción basal: el corte basal sísmico de cada dirección, una
 * línea por dirección como el modal. En aviso si la lectura quedó atrasada o si
 * un caso gravitacional tiene reacción horizontal.
 */
function nodoBasal(obra: Obra): NodoDeObra {
  const lectura = obra.sap?.basal;
  const base = { id: ID_NODO_BASAL, tipo: 'modelo', clase: 'resultado' as const, etiqueta: 'Reacción basal' };
  if (!lectura) return nodo({ ...base, subtitulo: 'sin leer' });
  const sis = obra.unidadesSap ?? 'kN';
  const motivos: string[] = [];
  const atraso = atrasoDe(lectura, obra.sap);
  if (atraso) motivos.push(`Lectura atrasada: ${atraso}. Vuelve a leer.`);
  const empujan = gravitacionalesConHorizontal(lectura, obra.sap);
  if (empujan.length) {
    motivos.push(`${empujan.map((e) => e.caso).join(', ')}: solo cargas gravitacionales, pero con reacción horizontal.`);
  }
  // Por dirección, el mayor de sus casos de espectro.
  const lineas: string[] = [];
  for (const d of ['X', 'Y'] as const) {
    const c = cortesSismicos(lectura, obra.sap)
      .filter((x) => x.dir === d)
      .sort((a, b) => b.V - a.V)[0];
    if (c) lineas.push(`V${d.toLowerCase()} = ${fuerza(c.V, sis)} · ${c.caso}`);
  }
  return nodo({
    ...base,
    subtitulo: lineas.length ? lineas.join('\n') : `${lectura.filas.length} casos · sin espectro`,
    severidad: motivos.length ? 'aviso' : 'ok',
    motivos,
  });
}

/**
 * El sub-nodo Apoyos: cuántos apoyos y casos hay, y en cuántos casos algún apoyo
 * tracciona. En aviso si la lectura quedó atrasada o si la suma de F3 de un caso
 * no es la FZ de su reacción basal: falta algún apoyo.
 */
function nodoApoyos(obra: Obra): NodoDeObra {
  const lectura = obra.sap?.apoyos;
  const base = { id: ID_NODO_APOYOS, tipo: 'modelo', clase: 'resultado' as const, etiqueta: 'Reacciones en apoyos' };
  if (!lectura) return nodo({ ...base, subtitulo: 'sin leer' });
  const motivos: string[] = [];
  const atraso = atrasoDe(lectura, obra.sap);
  if (atraso) motivos.push(`Lectura atrasada: ${atraso}. Vuelve a leer.`);
  const noCuadran = descuadresConBasal(lectura, obra.sap?.basal);
  if (noCuadran.length) {
    motivos.push(`${noCuadran.join(', ')}: la suma de F3 en los apoyos no es la FZ de la reacción basal.`);
  }
  const conjuntos = obra.conjuntosDiseno ?? [];
  const viejos = conjuntos.filter((c) => estadoConjunto(c, obra.sap?.conjuntos?.[c.id], obra.sap).estado === 'desactualizado');
  if (viejos.length) {
    motivos.push(`Conjuntos desactualizados: ${viejos.map((c) => c.nombre).join(', ')}. Vuelve a leerlos.`);
  }
  const traccionan = casosConTraccion(lectura).length;
  return nodo({
    ...base,
    subtitulo:
      `${lectura.apoyos.length} apoyos · ${lectura.casos.length} casos` +
      (conjuntos.length ? ` · ${conjuntos.length} conjunto${conjuntos.length === 1 ? '' : 's'}` : '') +
      '\n' +
      (traccionan ? `tracción en ${traccionan} caso${traccionan === 1 ? '' : 's'}` : 'sin tracción en ningún caso'),
    severidad: motivos.length ? 'aviso' : 'ok',
    motivos,
  });
}

export function proyectar(obra: Obra, ev: EvaluacionObra, genericas: Genericas = {}): Proyeccion {
  const nodos: NodoDeObra[] = [];
  const aristas: AristaGrafo[] = [];

  for (const k of obra.calculos) nodos.push(nodoDeCalculo(k, genericas, ev, obra));

  // El modelo de SAP2000: con qué modelo se conectó y cuánto de lo que tiene
  // —cargas, factores, espectro— respalda la obra. No publica nada; RECIBE las flechas de los nodos que
  // definen lo que nombran sus justificaciones, como cualquier nodo que usa.
  if (obra.modulos.includes('sap')) {
    const r = resumirJustificaciones(obra, ev.scope);
    const motivos: string[] = [];
    let severidad: Severidad = 'ok';
    if (r.difieren) {
      motivos.push(`${r.difieren} dato(s) del modelo no coinciden con lo que calcula la obra.`);
      severidad = 'error';
    }
    if (r.errores) {
      motivos.push(`${r.errores} justificación(es) no se pudieron evaluar.`);
      severidad = 'error';
    }
    if (r.huerfanas.length) {
      motivos.push(`${r.huerfanas.length} justificación(es) sin su dato en el modelo leído.`);
      severidad = peor(severidad, 'aviso');
    }
    const modelo = obra.sap ? obra.sap.modelo : 'sin conectar';
    nodos.push(
      nodo({
        id: ID_NODO_SAP,
        tipo: 'modelo',
        clase: 'modelo',
        etiqueta: 'SAP2000',
        subtitulo: r.total ? `${modelo} · ${r.justificadas} de ${r.total} justificados` : modelo,
        campos: obra.sap ? { modelo: obra.sap.modelo, version: obra.sap.version } : {},
        severidad,
        motivos,
      }),
    );
    aristas.push(...aristasDeJustificaciones(obra, ev));

    // Los sub-nodos cuelgan del SAP2000 con una arista estructural: leen del
    // mismo modelo, y así el layout los pone a su derecha.
    if (obra.modulos.includes('sap-combinaciones')) {
      nodos.push(nodoCombinaciones(obra));
      aristas.push({ desde: ID_NODO_SAP, hasta: ID_NODO_COMBINACIONES, tipo: 'deriva', etiqueta: '', severidad: 'ok' });
    }
    if (obra.modulos.includes('sap-basal')) {
      nodos.push(nodoBasal(obra));
      aristas.push({ desde: ID_NODO_SAP, hasta: ID_NODO_BASAL, tipo: 'deriva', etiqueta: '', severidad: 'ok' });
    }
    if (obra.modulos.includes('sap-apoyos')) {
      nodos.push(nodoApoyos(obra));
      aristas.push({ desde: ID_NODO_SAP, hasta: ID_NODO_APOYOS, tipo: 'deriva', etiqueta: '', severidad: 'ok' });
    }
    if (obra.modulos.includes('sap-modal')) {
      nodos.push(nodoModal(obra));
      aristas.push({ desde: ID_NODO_SAP, hasta: ID_NODO_MODAL, tipo: 'deriva', etiqueta: '', severidad: 'ok' });
    }
  }

  // Las flechas de datos van al final y solo entre nodos que existen: un uso
  // desde una hoja cuyo nodo no se pintó no puede dejar una arista colgando.
  const vivos = new Set(nodos.map((n) => n.id));
  for (const a of aristasDeDatos(ev)) {
    if (vivos.has(a.desde) && vivos.has(a.hasta)) aristas.push(a);
  }

  return { nodos, aristas };
}
