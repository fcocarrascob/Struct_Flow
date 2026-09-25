// ─────────────────────────────────────────────────────────────────────────────
// Las obras en `localStorage`, y el saneo de toda obra que se lee.
//
// Con el servidor local, una obra vive en disco (`almacen-disco.ts`,
// `carpeta.ts`) y esto queda para las que no: sin servidor, o creadas antes de
// que lo hubiera. `sanearObra` es de las dos: se lee de donde se lea, una obra
// entra por aquí.
//
// UNA DIFERENCIA CON `../layout.ts` QUE IMPORTA
// --------------------------------------------
// Aquel guarda posiciones, que son una comodidad: si el almacenamiento está
// bloqueado se sigue trabajando y no pasa nada, y por eso su `catch` es mudo.
// Aquí el almacenamiento ES el dato. Un `catch` mudo se lleva el trabajo del
// usuario sin decir una palabra, así que `guardarObra` devuelve un resultado y
// quien lo llama tiene que mostrarlo.
//
// Todo el archivo entra y sale por `leerTodo`/`escribirTodo`: una obra no se
// escribe sola sino dentro del conjunto, que es como está guardado.
// ─────────────────────────────────────────────────────────────────────────────

import { newId } from '../../lib/hoja-json';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import { metaDe } from '../../lib/hoja-json';
import { migrarBloques, sanearHoja } from './hoja';
import {
  CLASES_JUSTIFICACION,
  SUBMODULOS_SAP,
  COLOR_RE,
  COLORES_GRUPO,
  LARGO_NOTA_REVISION,
  problemaDeAlias,
  slugificar,
  VERSION_OBRA,
  type ConexionSap,
  type Frontera,
  type CargaAsignada,
  type CargaEspectro,
  type CargaDeCaso,
  type CasoEspectro,
  type CasoLeido,
  type ClaseCarga,
  type Combinacion,
  type LecturaCombinaciones,
  type LecturaModal,
  type LecturaBasal,
  type FilaBasal,
  type LecturaApoyos,
  type ApoyoLeido,
  type ReaccionesDeCaso,
  type ModoLeido,
  type TerminoCombinacion,
  type FuenteMasa,
  type FuncionEspectro,
  type LecturaCasos,
  type LecturaMasa,
  type LecturaResumen,
  type LecturaEspectro,
  type Grupo,
  type Justificacion,
  type LecturaCargas,
  type LecturaPatrones,
  type Modulo,
  type PatronLeido,
  type NodoCalculo,
  type Obra,
  type Procedencia,
  type Revision,
} from './modelo';

export const CLAVE_OBRAS = 'structflow.obras.v1';

export type Resultado = { ok: true } | { ok: false; motivo: string };

// `cargas` ya no es un módulo: una obra que lo traiga lo pierde en silencio,
// porque su contenido se migra a cálculos (`migrarCargas`).
const MODULOS: ReadonlySet<string> = new Set<Modulo>(['sap', ...SUBMODULOS_SAP]);

/**
 * Los módulos conocidos, sin repetir. Un sub-nodo del SAP2000 sin el SAP2000 no
 * tiene de dónde leer y se descarta.
 */
function sanearModulos(crudo: unknown): Modulo[] {
  const lista = [...new Set(Array.isArray(crudo) ? crudo : [])].filter((m): m is Modulo => MODULOS.has(m as string));
  return lista.includes('sap') ? lista : lista.filter((m) => !SUBMODULOS_SAP.includes(m));
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Una lectura de Load Patterns. Un patrón sin nombre no se puede citar y se
 * descarta; un tipo ilegible queda vacío y un peso propio ilegible en 0, que es
 * lo que SAP asume.
 */
function sanearLectura(crudo: unknown): LecturaPatrones | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaPatrones>;
  if (!Array.isArray(l.lista)) return undefined;
  const lista: PatronLeido[] = [];
  for (const x of l.lista) {
    const p = (x ?? {}) as Partial<PatronLeido>;
    if (typeof p.nombre !== 'string' || !p.nombre) continue;
    const peso = typeof p.pesoPropio === 'number' && Number.isFinite(p.pesoPropio) ? p.pesoPropio : 0;
    lista.push({ nombre: p.nombre, tipo: texto(p.tipo), pesoPropio: peso });
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), lista };
}

const CLASES_CARGA: ReadonlySet<string> = new Set<ClaseCarga>([
  'barra-distribuida',
  'barra-puntual',
  'area-uniforme',
  'area-a-barras',
  'nudo',
  'barra-temperatura',
]);

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Una lectura de cargas asignadas. Una carga sin patrón, sin una clase conocida o
 * sin valor no dice nada que se pueda justificar y se descarta; de los campos
 * opcionales se conserva solo lo que tiene el tipo correcto.
 */
function sanearCargas(crudo: unknown): LecturaCargas | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaCargas>;
  if (!Array.isArray(l.lista)) return undefined;
  const lista: CargaAsignada[] = [];
  for (const x of l.lista) {
    const c = (x ?? {}) as Partial<CargaAsignada>;
    if (typeof c.patron !== 'string' || !c.patron) continue;
    if (typeof c.clase !== 'string' || !CLASES_CARGA.has(c.clase)) continue;
    if (!esNumero(c.valor) || !esNumero(c.n)) continue;
    const carga: CargaAsignada = { patron: c.patron, clase: c.clase, valor: c.valor, n: c.n };
    for (const k of ['dir', 'valor2', 'desde', 'hasta', 'en', 'dist', 'tipoTemperatura'] as const) {
      if (esNumero(c[k])) carga[k] = c[k];
    }
    if (typeof c.csys === 'string') carga.csys = c.csys;
    if (typeof c.componente === 'string') carga.componente = c.componente;
    if (typeof c.momento === 'boolean') carga.momento = c.momento;
    lista.push(carga);
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), lista };
}

/**
 * Las justificaciones. Una sin expresión no respalda nada y se descarta; un id
 * repetido también, porque es lo que las distingue al editarlas.
 */
function sanearJustificaciones(crudo: unknown): { justificaciones?: Justificacion[] } {
  const vistos = new Set<string>();
  const lista: Justificacion[] = [];
  for (const x of Array.isArray(crudo) ? crudo : []) {
    const j = (x ?? {}) as Partial<Justificacion>;
    if (typeof j.id !== 'string' || !j.id || vistos.has(j.id)) continue;
    if (typeof j.patron !== 'string' || typeof j.firma !== 'string' || !esNumero(j.valor)) continue;
    if (typeof j.expr !== 'string' || !j.expr.trim()) continue;
    vistos.add(j.id);
    const clase = j.clase && CLASES_JUSTIFICACION.includes(j.clase) ? { clase: j.clase } : {};
    lista.push({ id: j.id, ...clase, patron: j.patron, firma: j.firma, valor: j.valor, expr: j.expr.trim() });
  }
  return lista.length ? { justificaciones: lista } : {};
}

/**
 * Una lectura del espectro. Un caso sin nombre, una dirección sin función o sin
 * factor, y un punto que no son dos números se descartan: no hay nada que
 * comparar con ellos.
 */
function sanearEspectro(crudo: unknown): LecturaEspectro | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaEspectro>;
  if (!Array.isArray(l.casos) || !Array.isArray(l.funciones)) return undefined;
  const casos: CasoEspectro[] = [];
  for (const x of l.casos) {
    const c = (x ?? {}) as Partial<CasoEspectro>;
    if (typeof c.nombre !== 'string' || !c.nombre) continue;
    const cargas: CargaEspectro[] = [];
    for (const y of Array.isArray(c.cargas) ? c.cargas : []) {
      const k = (y ?? {}) as Partial<CargaEspectro>;
      if (typeof k.dir !== 'string' || typeof k.funcion !== 'string' || !esNumero(k.sf)) continue;
      cargas.push({ dir: k.dir, funcion: k.funcion, sf: k.sf, csys: texto(k.csys), angulo: esNumero(k.angulo) ? k.angulo : 0 });
    }
    casos.push({
      nombre: c.nombre,
      modal: texto(c.modal),
      combinacion: texto(c.combinacion),
      amortiguamiento: esNumero(c.amortiguamiento) ? c.amortiguamiento : 0,
      cargas,
    });
  }
  const funciones: FuncionEspectro[] = [];
  for (const x of l.funciones) {
    const f = (x ?? {}) as Partial<FuncionEspectro>;
    if (typeof f.nombre !== 'string' || !f.nombre || !Array.isArray(f.puntos)) continue;
    const puntos = f.puntos.filter(
      (p): p is [number, number] => Array.isArray(p) && p.length === 2 && esNumero(p[0]) && esNumero(p[1]),
    );
    funciones.push({ nombre: f.nombre, puntos });
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), casos, funciones };
}

/** Los factores de un caso o de una fuente de masa: sin nombre o sin número, fuera. */
function sanearFactores(crudo: unknown, clave: 'nombre' | 'patron'): { tipo: string; nombre: string; sf: number }[] {
  const lista: { tipo: string; nombre: string; sf: number }[] = [];
  for (const x of Array.isArray(crudo) ? crudo : []) {
    const f = (x ?? {}) as Record<string, unknown>;
    const nombre = f[clave];
    if (typeof nombre !== 'string' || !nombre || !esNumero(f.sf)) continue;
    lista.push({ tipo: texto(f.tipo), nombre, sf: f.sf });
  }
  return lista;
}

/** Una lectura de Load Cases. Un caso sin nombre no se puede citar y se descarta. */
function sanearCasos(crudo: unknown): LecturaCasos | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaCasos>;
  if (!Array.isArray(l.lista)) return undefined;
  const lista: CasoLeido[] = [];
  for (const x of l.lista) {
    const c = (x ?? {}) as Partial<CasoLeido>;
    if (typeof c.nombre !== 'string' || !c.nombre) continue;
    const caso: CasoLeido = { nombre: c.nombre, tipo: texto(c.tipo), estado: texto(c.estado) };
    if (Array.isArray(c.cargas)) caso.cargas = sanearFactores(c.cargas, 'nombre') satisfies CargaDeCaso[];
    if (typeof c.modal === 'string') caso.modal = c.modal;
    const m = c.modos;
    if (m && esNumero(m.max) && esNumero(m.min)) caso.modos = { max: m.max, min: m.min };
    lista.push(caso);
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), lista };
}

/** Una lectura de las fuentes de masa. */
function sanearMasa(crudo: unknown): LecturaMasa | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaMasa>;
  if (!Array.isArray(l.fuentes)) return undefined;
  const fuentes: FuenteMasa[] = [];
  for (const x of l.fuentes) {
    const f = (x ?? {}) as Partial<FuenteMasa>;
    if (typeof f.nombre !== 'string' || !f.nombre) continue;
    fuentes.push({
      nombre: f.nombre,
      porDefecto: f.porDefecto === true,
      deElementos: f.deElementos === true,
      deMasas: f.deMasas === true,
      deCargas: f.deCargas === true,
      cargas: sanearFactores(f.cargas, 'patron').map(({ nombre, sf }) => ({ patron: nombre, sf })),
    });
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), fuentes };
}

/** Un resumen del modelo. Un conteo ilegible queda en 0; una lista, vacía. */
function sanearResumen(crudo: unknown): LecturaResumen | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const r = crudo as Partial<Record<keyof LecturaResumen, unknown>>;
  const n = (v: unknown) => (esNumero(v) ? v : 0);
  const nombres = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
  const objetos = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x ?? {}) as Record<string, unknown>) : []);
  return {
    modelo: texto(r.modelo),
    leido: texto(r.leido),
    unidades: texto(r.unidades),
    nudos: n(r.nudos),
    barras: n(r.barras),
    areas: n(r.areas),
    links: n(r.links),
    grupos: objetos(r.grupos)
      .filter((g) => typeof g.nombre === 'string' && g.nombre)
      .map((g) => ({ nombre: g.nombre as string, barras: n(g.barras), areas: n(g.areas) })),
    materiales: objetos(r.materiales)
      .filter((m) => typeof m.nombre === 'string' && m.nombre)
      .map((m) => ({ nombre: m.nombre as string, tipo: texto(m.tipo) })),
    seccionesBarra: nombres(r.seccionesBarra),
    seccionesArea: nombres(r.seccionesArea),
    patrones: n(r.patrones),
    casos: n(r.casos),
    analizados: n(r.analizados),
    combinaciones: n(r.combinaciones),
  };
}

/**
 * La última conexión a SAP2000. Una sin modelo no dice nada y se descarta. Los
 * grupos sueltos que traiga una obra anterior se descartan: eran para aplicar
 * cargas, que ya no existen. Los de ahora van dentro de `resumen`.
 */
function sanearSap(crudo: unknown): { sap?: ConexionSap } {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const s = crudo as Partial<ConexionSap>;
  if (typeof s.modelo !== 'string' || !s.modelo) return {};
  const patrones = sanearLectura(s.patrones);
  const cargas = sanearCargas(s.cargas);
  const espectro = sanearEspectro(s.espectro);
  const casos = sanearCasos(s.casos);
  const masa = sanearMasa(s.masa);
  const resumen = sanearResumen(s.resumen);
  const combinaciones = sanearCombinaciones(s.combinaciones);
  const modal = sanearModal(s.modal);
  const basal = sanearBasal(s.basal);
  const apoyos = sanearApoyos(s.apoyos);
  return {
    sap: {
      modelo: s.modelo,
      ruta: texto(s.ruta),
      version: texto(s.version),
      leido: texto(s.leido),
      ...(typeof s.modificado === 'string' && s.modificado ? { modificado: s.modificado } : {}),
      ...(patrones ? { patrones } : {}),
      ...(cargas ? { cargas } : {}),
      ...(espectro ? { espectro } : {}),
      ...(casos ? { casos } : {}),
      ...(masa ? { masa } : {}),
      ...(resumen ? { resumen } : {}),
      ...(combinaciones ? { combinaciones } : {}),
      ...(modal ? { modal } : {}),
      ...(basal ? { basal } : {}),
      ...(apoyos ? { apoyos } : {}),
    },
  };
}

/**
 * Una lectura de reacciones en apoyos. Sin sello se descarta entera. Un apoyo
 * sin nombre, o un caso sin nombre, también; una fila que no son seis números
 * queda en `null`, para no correr las demás de su apoyo.
 */
function sanearApoyos(crudo: unknown): LecturaApoyos | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaApoyos>;
  if (!Array.isArray(l.apoyos) || !Array.isArray(l.casos)) return undefined;
  if (typeof l.modificado !== 'string' || !l.modificado) return undefined;
  // Un apoyo sin nombre se descarta, y con él su columna en cada caso.
  const quedan: number[] = [];
  const apoyos: ApoyoLeido[] = [];
  l.apoyos.forEach((x, i) => {
    const a = (x ?? {}) as Partial<ApoyoLeido>;
    if (typeof a.nombre !== 'string' || !a.nombre) return;
    quedan.push(i);
    const xyz = Array.isArray(a.xyz) && a.xyz.length === 3 && a.xyz.every(esNumero) ? { xyz: a.xyz as [number, number, number] } : {};
    apoyos.push({ nombre: a.nombre, ...xyz });
  });
  const casos: ReaccionesDeCaso[] = [];
  for (const x of l.casos) {
    const c = (x ?? {}) as Partial<ReaccionesDeCaso>;
    if (typeof c.caso !== 'string' || !c.caso || !Array.isArray(c.valores)) continue;
    const fuente = c.valores;
    const valores = quedan.map((i) => {
      const v = fuente[i];
      return Array.isArray(v) && v.length === 6 && v.every(esNumero) ? (v as ReaccionesDeCaso['valores'][number]) : null;
    });
    casos.push({ caso: c.caso, ...(typeof c.paso === 'string' && c.paso ? { paso: c.paso } : {}), valores });
  }
  const sinAnalizar = Array.isArray(l.sinAnalizar) ? l.sinAnalizar.filter((c): c is string => typeof c === 'string') : [];
  return { modelo: texto(l.modelo), leido: texto(l.leido), modificado: l.modificado, apoyos, casos, sinAnalizar };
}

/**
 * Una lectura de la reacción basal. Sin sello se descarta entera; una fila sin
 * caso o con alguna componente que no sea un número, sola.
 */
function sanearBasal(crudo: unknown): LecturaBasal | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaBasal>;
  if (!Array.isArray(l.filas) || typeof l.modificado !== 'string' || !l.modificado) return undefined;
  const filas: FilaBasal[] = [];
  for (const x of l.filas) {
    const f = (x ?? {}) as Partial<FilaBasal>;
    if (typeof f.caso !== 'string' || !f.caso) continue;
    const { fx, fy, fz, mx, my, mz } = f;
    if (![fx, fy, fz, mx, my, mz].every(esNumero)) continue;
    filas.push({
      caso: f.caso,
      ...(typeof f.paso === 'string' && f.paso ? { paso: f.paso } : {}),
      fx: fx!, fy: fy!, fz: fz!, mx: mx!, my: my!, mz: mz!,
    });
  }
  const sinAnalizar = Array.isArray(l.sinAnalizar) ? l.sinAnalizar.filter((c): c is string => typeof c === 'string') : [];
  return { modelo: texto(l.modelo), leido: texto(l.leido), modificado: l.modificado, filas, sinAnalizar };
}

/**
 * Una lectura modal. Sin caso o sin sello no dice de dónde salió y se descarta
 * entera; un modo sin número o sin periodo, solo. De las masas se conserva lo
 * que sea un número.
 */
function sanearModal(crudo: unknown): LecturaModal | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaModal>;
  if (!Array.isArray(l.modos) || typeof l.caso !== 'string' || !l.caso) return undefined;
  if (typeof l.modificado !== 'string' || !l.modificado) return undefined;
  const modos: ModoLeido[] = [];
  for (const x of l.modos) {
    const m = (x ?? {}) as Partial<ModoLeido>;
    if (!esNumero(m.n) || !esNumero(m.T)) continue;
    const modo: ModoLeido = { n: m.n, T: m.T, f: esNumero(m.f) ? m.f : 0 };
    for (const k of ['ux', 'uy', 'uz', 'rz', 'sux', 'suy', 'suz'] as const) if (esNumero(m[k])) modo[k] = m[k];
    modos.push(modo);
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), modificado: l.modificado, caso: l.caso, modos };
}

/**
 * Una lectura de combinaciones. Una combinación sin nombre no se puede citar, y
 * un término sin nombre o sin factor no dice nada: se descartan.
 */
function sanearCombinaciones(crudo: unknown): LecturaCombinaciones | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaCombinaciones>;
  if (!Array.isArray(l.lista)) return undefined;
  const lista: Combinacion[] = [];
  for (const x of l.lista) {
    const c = (x ?? {}) as Partial<Combinacion>;
    if (typeof c.nombre !== 'string' || !c.nombre) continue;
    const terminos: TerminoCombinacion[] = [];
    for (const y of Array.isArray(c.terminos) ? c.terminos : []) {
      const t = (y ?? {}) as Partial<TerminoCombinacion>;
      if (typeof t.nombre !== 'string' || !t.nombre || !esNumero(t.sf)) continue;
      terminos.push({ clase: t.clase === 'combinacion' ? 'combinacion' : 'caso', nombre: t.nombre, sf: t.sf });
    }
    lista.push({ nombre: c.nombre, tipo: texto(c.tipo), terminos });
  }
  return { modelo: texto(l.modelo), leido: texto(l.leido), lista };
}

/**
 * Los ids que ya se repartieron dentro de UNA obra.
 *
 * Es el `vistos` de `sanearRegiones` (`src/lib/hoja-json.ts:91`) y hace falta
 * por lo mismo: los ids de bloque son las claves de `results` en la hoja global
 * que arma `evaluacion.ts`, así que dos bloques con el mismo id comparten
 * resultado, comparten `key` de React y rompen el filtro por posición del
 * autocompletado, que busca la región activa por id y se queda con la primera.
 *
 * Antes los ids de rescate llevaban el índice **dentro de su padre**, así que
 * dos partidas sin id daban las dos `s-recuperada-0` y los bloques colisionaban
 * entre nodos a la primera. El `newId` compartido no puede repetir.
 */
type Vistos = Set<string>;

function idUnico(crudo: unknown, vistos: Vistos): string {
  const id = typeof crudo === 'string' && crudo && !vistos.has(crudo) ? crudo : newId();
  vistos.add(id);
  return id;
}

/**
 * Lo que se lee de `localStorage` es texto que escribió una versión anterior de
 * esta aplicación, no un `Obra`. Se sanea igual que `sanearRegiones` hace con
 * una hoja: lo que no cuadra se descarta en vez de reventar la pantalla.
 */
/**
 * La hoja de un nodo, venga como venga guardada.
 *
 * MIGRACIÓN. Hasta la versión 1 un nodo guardaba `bloques`: una lista sin `x` ni
 * `y`, cuyo ORDEN era el orden de lectura. `migrarBloques` les sintetiza
 * coordenadas **antes** de validar nada, y ese orden importa: `esRegion` exige
 * `x` e `y` finitos, así que validar primero descartaría las regiones de cada
 * nodo y la obra abriría VACÍA, sin avisar de nada.
 */
function sanearHojaDeNodo(crudo: { hoja?: unknown; bloques?: unknown }, vistos: Vistos) {
  const lista = Array.isArray(crudo.hoja) ? crudo.hoja : migrarBloques(crudo.bloques);
  return sanearHoja(lista, vistos, newId);
}

const PROCEDENCIAS: ReadonlySet<string> = new Set<Procedencia>([
  'biblioteca',
  'propia',
  'derivada',
]);

/** 64 hex, o nada. Un sello ilegible se trata como «sin sello»: no se avisa de
 *  un desfase que no se puede comprobar. */
const sello = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : undefined;

/**
 * La frontera de un nodo.
 *
 * MIGRACIÓN. Lo guardado hasta la versión 1 era una `importada`: sin
 * `procedencia`, pero con slug y sello, que es exactamente una referencia a la
 * biblioteca. Una sin `slug` sí se descarta entera: no hay nada que descargar, y
 * el nodo vuelve a ser una hoja libre con las regiones que sí están guardadas.
 */
function sanearFrontera(crudo: unknown): Frontera | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const i = crudo as Partial<Frontera>;
  const procedencia: Procedencia =
    typeof i.procedencia === 'string' && PROCEDENCIAS.has(i.procedencia)
      ? i.procedencia
      : 'biblioteca';
  const slug = typeof i.slug === 'string' && i.slug ? i.slug : undefined;
  if (procedencia === 'biblioteca' && !slug) return undefined;

  const entradas: Record<string, number> = {};
  if (typeof i.entradas === 'object' && i.entradas !== null) {
    for (const [k, v] of Object.entries(i.entradas)) {
      if (typeof v === 'number' && Number.isFinite(v)) entradas[k] = v;
    }
  }
  const formulas: Record<string, string> = {};
  if (typeof i.formulas === 'object' && i.formulas !== null) {
    for (const [k, v] of Object.entries(i.formulas)) {
      if (typeof v === 'string') formulas[k] = v;
    }
  }
  // Un alias que no es un nombre de variable no se puede escribir en ninguna
  // fórmula, así que publicarlo sería ofrecer algo inalcanzable. `problemaDeAlias`
  // decide, que es la misma autoridad que usa el selector.
  const publica: Record<string, string> = {};
  if (typeof i.publica === 'object' && i.publica !== null) {
    for (const [k, v] of Object.entries(i.publica)) {
      if (typeof v === 'string' && !problemaDeAlias(v)) publica[k] = v.trim();
    }
  }

  const org = i.origen;
  const origen =
    procedencia === 'derivada' &&
    typeof org === 'object' &&
    org !== null &&
    typeof org.slug === 'string' &&
    sello(org.sha256)
      ? {
          slug: org.slug,
          sha256: org.sha256,
          ...(Array.isArray(org.desvios) && org.desvios.some((d) => typeof d === 'string')
            ? { desvios: org.desvios.filter((d): d is string => typeof d === 'string') }
            : {}),
        }
      : undefined;

  return {
    procedencia,
    // El sello es de la instancia, así que solo tiene sentido en `biblioteca`;
    // una derivada ya no es una instancia de nada y lo lleva en `origen`.
    ...(procedencia === 'biblioteca' && slug ? { slug, sha256: sello(i.sha256) ?? '' } : {}),
    ...(origen ? { origen } : {}),
    ...(procedencia === 'biblioteca' ? { entradas } : {}),
    ...(Object.keys(formulas).length ? { formulas } : {}),
    ...(Object.keys(publica).length ? { publica } : {}),
  };
}

/**
 * El `meta` de la hoja de un nodo, con el mismo criterio que el del canvas.
 *
 * `metaDe` recibe la HOJA y mira su `.meta`; aquí lo que llega ya es el `meta`,
 * así que se envuelve. Pasárselo directo lo buscaba en `meta.meta`, y el `meta`
 * de cada nodo se perdía en silencio en cada relectura.
 */
function sanearMeta(crudo: unknown): MetaPlanilla | undefined {
  return metaDe({ meta: crudo }) ?? undefined;
}

/**
 * La marca de revisión. Una nota que no es texto queda vacía —la marca sigue: un
 * «revisar» sin razón legible también es algo que alguien tiene que mirar—, y
 * una larga se corta, porque es una línea y no un informe. Quien no se reconoce
 * es el usuario: marcar de asistente algo que no lo dice sería inventar un
 * origen.
 */
function sanearRevision(crudo: unknown): { revisar?: Revision } {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const r = crudo as Partial<Revision>;
  const nota = typeof r.nota === 'string' ? r.nota.trim().slice(0, LARGO_NOTA_REVISION) : '';
  return { revisar: { nota, por: r.por === 'asistente' ? 'asistente' : 'usuario' } };
}

/**
 * Los grupos de la obra. Uno sin color legible se descarta entero, en vez de
 * inventarle uno: un color distinto del que se eligió es un dato equivocado, y
 * sus miembros quedan sin grupo, que se ve y se corrige.
 */
function sanearGrupos(crudo: unknown): Grupo[] {
  const vistos = new Set<string>();
  const grupos: Grupo[] = [];
  for (const g of Array.isArray(crudo) ? crudo : []) {
    if (typeof g !== 'object' || g === null) continue;
    const { id, nombre, color } = g as Partial<Grupo>;
    if (typeof id !== 'string' || !id || vistos.has(id)) continue;
    if (typeof color !== 'string' || !COLOR_RE.test(color)) continue;
    vistos.add(id);
    grupos.push({ id, nombre: typeof nombre === 'string' ? nombre : 'Grupo', color });
  }
  return grupos;
}

/** El `grupo` de un nodo, solo si apunta a uno que existe. */
function grupoDe(crudo: unknown, grupos: ReadonlySet<string>): { grupo?: string } {
  return typeof crudo === 'string' && grupos.has(crudo) ? { grupo: crudo } : {};
}

function sanearCalculo(crudo: unknown, vistos: Vistos, grupos: ReadonlySet<string>): NodoCalculo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const k = crudo as Partial<NodoCalculo> & { bloques?: unknown; importada?: unknown };
  const frontera = sanearFrontera(k.frontera ?? k.importada);
  const meta = sanearMeta(k.meta);
  return {
    id: idUnico(k.id, vistos),
    nombre: typeof k.nombre === 'string' ? k.nombre : 'Cálculo',
    hoja: sanearHojaDeNodo(k, vistos),
    ...(meta ? { meta } : {}),
    ...(frontera ? { frontera } : {}),
    ...grupoDe(k.grupo, grupos),
    ...sanearRevision(k.revisar),
  };
}

/**
 * MIGRACIÓN. Las cargas de una obra anterior, convertidas en cálculos y grupos.
 *
 * Una carga era un nombre, un grupo opcional y un desglose de partidas; cada
 * partida ya era, para el motor, un nodo de cálculo con su hoja o su frontera
 * (`nodosDeLaObra` las ponía después de los cálculos). Aquí pasan a serlo de
 * verdad, sin perder un número:
 *
 *   - Cada partida es un cálculo con su mismo id, hoja, `meta`, frontera y marca.
 *     Lo que era solo de la partida —`variable`, `frontera.salida` y la
 *     aplicación en SAP— se descarta: decía cuál número mostrar, no cuál calcular.
 *   - Una carga de UNA partida se dibujaba plegada, como su partida con el nombre
 *     de la carga, así que el cálculo toma ese nombre.
 *   - Una de varias agrupaba sus partidas. Si ya tenía grupo, sus cálculos lo
 *     heredan; si no, se le crea uno con su nombre, porque esa agrupación es
 *     justo lo que el usuario veía y no se puede perder al abrir la obra.
 *
 * Los cálculos migrados van DESPUÉS de los que ya había, en el orden de las
 * cargas: es el orden de creación con que el orden topológico desempata, así
 * que el orden de lectura —y con él lo que cada nodo ve— no cambia.
 *
 * El id del grupo se deriva del de la carga para que releer la obra sin haberla
 * guardado dé el mismo grupo y no uno nuevo cada vez.
 */
function migrarCargas(
  crudas: unknown,
  grupos: Grupo[],
): { calculos: unknown[]; grupos: Grupo[] } {
  const calculos: unknown[] = [];
  const nuevos: Grupo[] = [];
  const ids = new Set(grupos.map((g) => g.id));
  for (const c of Array.isArray(crudas) ? crudas : []) {
    if (typeof c !== 'object' || c === null) continue;
    const carga = c as { id?: unknown; nombre?: unknown; grupo?: unknown; subcargas?: unknown };
    const nombre = texto(carga.nombre);
    const partidas = (Array.isArray(carga.subcargas) ? carga.subcargas : []).filter(
      (s): s is Record<string, unknown> => typeof s === 'object' && s !== null,
    );
    if (partidas.length === 0) continue;

    let grupo = typeof carga.grupo === 'string' && ids.has(carga.grupo) ? carga.grupo : undefined;
    if (!grupo && partidas.length > 1) {
      const base = `g-${slugificar(texto(carga.id) || nombre) || 'carga'}`;
      let id = base;
      for (let i = 2; ids.has(id); i++) id = `${base}-${i}`;
      ids.add(id);
      const color = COLORES_GRUPO[(grupos.length + nuevos.length) % COLORES_GRUPO.length];
      nuevos.push({ id, nombre: nombre.trim() || 'Carga', color });
      grupo = id;
    }

    for (const p of partidas) {
      calculos.push({
        ...p,
        nombre: partidas.length === 1 && nombre.trim() ? nombre : p.nombre,
        ...(grupo ? { grupo } : {}),
      });
    }
  }
  return { calculos, grupos: [...grupos, ...nuevos] };
}

/**
 * El id con el que una obra guardada se identifica y se enlaza.
 *
 * Viaja en la URL (`/obra/<id>`), así que tiene que pasar el alfabeto cerrado de
 * `SLUG_PROYECTO_RE` (`src/lib/ruta.ts`): uno que no lo pase deja una obra que
 * está guardada y es **inalcanzable**, porque `parsearRuta` rechaza la ruta y
 * cae en el menú sin decir nada. Se slugifica en vez de descartar la obra.
 *
 * Es una función aparte porque la usan el saneo y `guardarObra`, que tiene que
 * encontrar la misma entrada en el archivo crudo.
 */
export function idDeObra(crudo: unknown): string | null {
  const id = (crudo as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) return null;
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : slugificar(id) || null;
}

export function sanearObra(crudo: unknown): Obra | null {
  const id = idDeObra(crudo);
  if (id === null) return null;
  const o = crudo as Partial<Obra>;
  // Un solo juego de ids por obra: cálculos y bloques comparten espacio porque
  // todos acaban siendo claves de `results`.
  const vistos: Vistos = new Set();
  // Los grupos van primero: los miembros solo conservan un `grupo` que exista.
  // Las cargas de una obra anterior pueden añadir grupos, así que se migran
  // antes de fijar la lista.
  const migradas = migrarCargas((crudo as { cargas?: unknown }).cargas, sanearGrupos(o.grupos));
  const grupos = migradas.grupos;
  const idsGrupo = new Set(grupos.map((g) => g.id));
  return {
    version: VERSION_OBRA,
    id,
    nombre: typeof o.nombre === 'string' ? o.nombre : id,
    creada: typeof o.creada === 'string' ? o.creada : new Date(0).toISOString(),
    modulos: sanearModulos(o.modulos),
    calculos: [...(Array.isArray(o.calculos) ? o.calculos : []), ...migradas.calculos]
      .map((k) => sanearCalculo(k, vistos, idsGrupo))
      .filter((k): k is NodoCalculo => k !== null),
    ...(grupos.length ? { grupos } : {}),
    ...sanearSap(o.sap),
    ...sanearJustificaciones(o.justificaciones),
    // `kN` es lo que se asume sin nada escrito: guardarlo sería un campo que no dice nada.
    ...(o.unidadesSap === 'tonf' ? { unidadesSap: 'tonf' as const } : {}),
  };
}

/**
 * Las obras **tal como están escritas**, sin sanear.
 *
 * Existe para que guardar una obra no toque a las demás. `guardarObra` leía las
 * saneadas y las volvía a volcar todas, y como eso ocurre cada 300 ms mientras
 * se teclea, editar una obra le aplicaba la migración a las otras sin que nadie
 * las abriera: un bloque con `src` que no es texto desaparecía, los ids de
 * rescate se materializaban y los campos desconocidos se perdían. El saneo es
 * defensivo **al leer**; al escribir era destructivo.
 */
function leerCrudo(): unknown[] {
  try {
    const texto = window.localStorage.getItem(CLAVE_OBRAS);
    if (!texto) return [];
    const datos = JSON.parse(texto) as { obras?: unknown };
    return Array.isArray(datos?.obras) ? datos.obras : [];
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto. Abrir con la lista
    // vacía es mejor que no abrir; el error real aparece al intentar guardar,
    // que es cuando hay algo que perder.
    return [];
  }
}

/**
 * Una obra del navegador tal como está escrita, en JSON, o `null`. Es lo que
 * descarga la pantalla de un fallo de render: sin pasar por `sanearObra`, que
 * puede ser justo lo que falló.
 */
export function obraCruda(id: string): string | null {
  const cruda = leerCrudo().find((o) => idDeObra(o) === id);
  return cruda === undefined ? null : JSON.stringify(cruda, null, 2);
}

function leerTodo(): Obra[] {
  return leerCrudo()
    .map(sanearObra)
    .filter((o): o is Obra => o !== null);
}

/** Escribe el archivo entero. Las entradas que no se tocaron viajan **crudas**,
 *  como estaban: ver la nota de `leerCrudo`. */
function escribirTodo(obras: unknown[]): Resultado {
  try {
    window.localStorage.setItem(CLAVE_OBRAS, JSON.stringify({ version: VERSION_OBRA, obras }));
    return { ok: true };
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? '';
    if (nombre === 'QuotaExceededError' || nombre === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return {
        ok: false,
        motivo:
          'No cabe en el almacenamiento del navegador. Borra alguna obra que ya no uses y ' +
          'vuelve a intentarlo.',
      };
    }
    return {
      ok: false,
      motivo:
        'El navegador no dejó guardar. Suele pasar en ventana privada o con el ' +
        'almacenamiento del sitio bloqueado: lo que escribas no se va a conservar.',
    };
  }
}

/** Las obras, la más reciente primero. */
export function listarObras(): Obra[] {
  return leerTodo().sort((a, b) => b.creada.localeCompare(a.creada));
}

export function leerObra(id: string): Obra | null {
  return leerTodo().find((o) => o.id === id) ?? null;
}

/**
 * Inserta o reemplaza **solo esta obra**, conservando su sitio en el archivo y
 * el texto crudo de todas las demás.
 *
 * Con `crear`, una obra que ya existe es un fallo en vez de un reemplazo. Sin
 * eso, dos pestañas abiertas en el índice proponían las dos el mismo id —cada
 * una ve su propia lista— y la segunda en guardar **borraba** la obra de la
 * primera sin decir una palabra.
 */
export function guardarObra(obra: Obra, { crear = false } = {}): Resultado {
  const obras = leerCrudo();
  const i = obras.findIndex((o) => idDeObra(o) === obra.id);
  if (i >= 0) {
    if (crear) {
      return {
        ok: false,
        motivo: `Ya hay una obra con el id «${obra.id}» en este navegador, quizá creada en otra pestaña.`,
      };
    }
    obras[i] = obra;
  } else {
    obras.push(obra);
  }
  return escribirTodo(obras);
}

export function borrarObra(id: string): Resultado {
  return escribirTodo(leerCrudo().filter((o) => idDeObra(o) !== id));
}

// ── Sacar una obra del navegador, y volver a meterla ─────────────────────────
//
// Una obra en el `localStorage` de UN navegador no viaja a otro equipo, no la ve
// nadie más, y desaparece al borrar los datos del sitio; para ella el archivo es
// la única forma de respaldarla. Una obra en disco (`almacen-disco.ts`) ya es
// una carpeta, pero el archivo sigue siendo la forma de pasársela a alguien en
// una sola pieza.
//
// No es el formato de una hoja del canvas y no se pretende que lo sea: una obra
// es un grafo de nodos con referencias a la biblioteca, no una lista de
// regiones. Lleva `tipo` para poder decirlo al leerlo.

export const TIPO_ARCHIVO_OBRA = 'structflow.obra';

export function archivoDeObra(obra: Obra): object {
  return { version: VERSION_OBRA, tipo: TIPO_ARCHIVO_OBRA, obra };
}

export function nombreDeArchivo(obra: Obra): string {
  return `obra-${obra.id}.json`;
}

export type Importacion = { ok: true; obra: Obra } | { ok: false; motivo: string };

/**
 * Una obra leída de un archivo, con un id libre.
 *
 * El id se renombra si ya está tomado en vez de reemplazar lo que hay: importar
 * es traer algo, nunca pisar. El nombre se conserva tal cual, así que las dos
 * se llaman igual en la lista — y eso es correcto, porque son la misma obra en
 * dos momentos distintos y quien la importó sabe cuál acaba de traer.
 */
export function importarObra(texto: string, ocupados?: Iterable<string>): Importacion {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'El archivo no es JSON válido.' };
  }
  // Se acepta el archivo entero o una obra suelta: quien edite esto a mano no
  // tiene por qué saberse el envoltorio.
  const dentro = (crudo as { obra?: unknown } | null)?.obra;
  const obra = sanearObra(dentro ?? crudo);
  if (!obra) {
    return {
      ok: false,
      motivo: 'El archivo no tiene una obra dentro: falta el `id`, o no es un archivo de obra.',
    };
  }
  // Los ids que ya hay donde va a entrar: el disco, si quien llama los da, o
  // este navegador.
  const tomados = new Set<string | null>(ocupados ?? leerCrudo().map((o) => idDeObra(o)));
  if (tomados.has(obra.id)) {
    let id = '';
    for (let i = 2; !id || tomados.has(id); i++) id = `${obra.id}-${i}`;
    return { ok: true, obra: { ...obra, id } };
  }
  return { ok: true, obra };
}
