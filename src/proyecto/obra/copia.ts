// ─────────────────────────────────────────────────────────────────────────────
// Una obra a partir de otra: lo que ya se calculó no se vuelve a escribir.
//
// Dos gestos y una sola capa. «Nueva obra a partir de esta», en el índice, arma
// una obra nueva con parte de otra (`obraDesde`); «Traer de otra obra», dentro
// de una obra abierta, copia nodos a una obra que ya tiene los suyos
// (`traerNodos`). Una segunda estructura del mismo proyecto, o una con cargas
// parecidas, parte así de lo que ya cierra.
//
// QUÉ SE COPIA Y QUÉ NO
// ---------------------
// Se copian los cálculos tal cual —hoja, frontera con su slug y su sello,
// entradas, campos atados y alias publicados—, sus grupos y su marca «Revisar»:
// un supuesto que estaba por confirmar en el origen sigue estándolo en la copia.
//
// NO se copian la lectura de SAP2000 ni las justificaciones. Las dos hablan del
// MODELO de la estructura de origen, y la estructura nueva tiene otro: arrastrar
// la lectura haría que la obra nueva dijera haber leído un modelo que no es el
// suyo, y una justificación quedaría respaldando cargas que nadie aplicó. El
// nodo SAP2000 sí se conserva, vacío, y con él las unidades en que se muestran
// sus cargas, que son una convención del proyecto.
//
// Capa pura, sin React ni `localStorage`, por lo mismo que `modelo.ts`: lo
// comprueba `verify:obra`.
// ─────────────────────────────────────────────────────────────────────────────

import { newId } from '../../lib/hoja-json';
import { simbolosDeFormula } from '../../lib/worksheet';
import type { Posicion } from '../layout';
import { sanearObra } from './almacen';
import { defineDe, fuentesDeUso, nodosDeLaObra } from './evaluacion';
import { sanearHoja } from './hoja';
import { idNodoDeCalculo } from './ids';
import { nuevaObra, type Grupo, type NodoCalculo, type Obra } from './modelo';

/**
 * Todos los ids que la obra ya repartió, de cálculo y de región.
 *
 * Comparten espacio por lo mismo que en `sanearObra`: todos acaban siendo
 * claves de `results` en la hoja global que arma `evaluacion.ts`.
 */
export function idsDeLaObra(obra: Obra): Set<string> {
  const vistos = new Set<string>();
  for (const k of obra.calculos) {
    vistos.add(k.id);
    for (const r of k.hoja) vistos.add(r.id);
  }
  return vistos;
}

/** Lo que cada cálculo define y lo que usa, por id de DOCUMENTO. */
function nombresPorCalculo(obra: Obra): Map<string, { define: string[]; usa: Set<string> }> {
  const salida = new Map<string, { define: string[]; usa: Set<string> }>();
  // Los nodos que lee la evaluación, en el orden de los cálculos: con ellos,
  // `defineDe` y `fuentesDeUso` dicen lo mismo aquí que allá.
  const nodos = nodosDeLaObra(obra);
  obra.calculos.forEach((k, i) => {
    const nodo = nodos[i];
    const define = defineDe(nodo);
    const mios = new Set(define);
    const usa = new Set<string>();
    for (const src of fuentesDeUso(nodo)) {
      for (const id of simbolosDeFormula(src)) if (!mios.has(id)) usa.add(id);
    }
    salida.set(k.id, { define, usa });
  });
  return salida;
}

/**
 * Lo que una selección de cálculos necesita de la obra y no lleva: el cierre
 * aguas arriba.
 *
 * Devuelve `id → ids de quienes lo usan` (directamente), solo para los que
 * faltan en `ids`. Sin esto, traer la zapata sin la carga que la alimenta la
 * dejaría en rojo en el destino, con un «sin definir» que nadie entiende de
 * dónde salió.
 *
 * ES ESTÁTICO: no hace falta descargar ninguna genérica, porque lo que un nodo
 * con frontera publica y lee está en el documento (`publica` y `formulas`). Un
 * nombre definido en más de un nodo no tiene dueño —la evaluación lo marca como
 * repetido— y no arrastra a ninguno.
 *
 * `cubiertos` son los nombres que ya existen donde se va a copiar: traer la
 * grúa a una obra que ya tiene su geometría no puede arrastrar otra geometría,
 * que dejaría cada nombre definido dos veces.
 */
export function dependenciasDe(
  obra: Obra,
  ids: Iterable<string>,
  cubiertos: ReadonlySet<string> = new Set(),
): Map<string, string[]> {
  const nombres = nombresPorCalculo(obra);
  const porNombre = new Map<string, string[]>();
  for (const [id, { define }] of nombres) {
    for (const n of define) porNombre.set(n, [...(porNombre.get(n) ?? []), id]);
  }
  const dentro = new Set(ids);
  const faltan = new Map<string, string[]>();
  const cola = [...dentro];
  while (cola.length) {
    const id = cola.shift()!;
    for (const n of nombres.get(id)?.usa ?? []) {
      if (cubiertos.has(n)) continue;
      const duenios = porNombre.get(n);
      if (!duenios || duenios.length !== 1) continue;
      const d = duenios[0];
      if (d === id || dentro.has(d)) continue;
      const por = faltan.get(d);
      if (por) {
        if (!por.includes(id)) por.push(id);
        continue;
      }
      faltan.set(d, [id]);
      cola.push(d);
    }
  }
  return faltan;
}

/** Todos los nombres que la obra pone a disposición de sus nodos. */
export function nombresDefinidos(obra: Obra): Set<string> {
  return new Set([...nombresPorCalculo(obra).values()].flatMap((x) => x.define));
}

/**
 * Los nombres que la selección definiría y el destino ya define.
 *
 * Traerlos igual es legítimo —la evaluación los marca «definida en 2 nodos» y
 * el usuario decide cuál sobra—, pero se tiene que saber ANTES de confirmar, no
 * descubrirlo con el canvas lleno de rojos.
 */
export function choquesCon(destino: Obra, origen: Obra, ids: Iterable<string>): string[] {
  const enDestino = nombresDefinidos(destino);
  const deOrigen = nombresPorCalculo(origen);
  const choques: string[] = [];
  for (const id of ids) {
    for (const n of deOrigen.get(id)?.define ?? []) {
      if (enDestino.has(n) && !choques.includes(n)) choques.push(n);
    }
  }
  return choques;
}

/** Una copia profunda de lo que es dato: una obra nueva no puede compartir
 *  objetos con la de origen, que sigue abierta en otra pestaña o en el estado. */
const clonar = <T>(x: T): T => structuredClone(x);

/**
 * Una obra nueva con los cálculos de `origen` (todos, o los de `ids`).
 *
 * Los ids de cálculo y de región SE CONSERVAN: en una obra nueva no chocan con
 * nada, y conservarlos es lo que permite copiar las posiciones del canvas tal
 * cual. Los grupos que se quedan sin miembros no viajan. Sale por `sanearObra`
 * como cualquier obra que se lee.
 */
export function obraDesde(
  origen: Obra,
  nombre: string,
  ocupados: readonly string[] = [],
  ids?: ReadonlySet<string>,
): Obra {
  const base = nuevaObra(nombre, ocupados);
  const calculos = origen.calculos.filter((k) => !ids || ids.has(k.id)).map(clonar);
  const enUso = new Set(calculos.map((k) => k.grupo).filter(Boolean));
  const grupos = (origen.grupos ?? []).filter((g) => enUso.has(g.id)).map(clonar);
  const obra: Obra = {
    ...base,
    modulos: [...origen.modulos],
    calculos,
    ...(grupos.length ? { grupos } : {}),
    ...(origen.unidadesSap ? { unidadesSap: origen.unidadesSap } : {}),
    // Los conjuntos de diseño sí viajan: nombran familias, que son una
    // convención de nombres y no el modelo de origen. Su lectura, no.
    ...(origen.conjuntosDiseno?.length ? { conjuntosDiseno: origen.conjuntosDiseno } : {}),
  };
  return sanearObra(obra) ?? obra;
}

/**
 * Copia los cálculos `ids` de `origen` al final de `destino`.
 *
 * - **Al final y en el orden del origen.** El orden de creación es con el que
 *   el orden topológico desempata, así que lo traído se lee después de lo que ya
 *   había, y entre sí como se leía allá.
 * - **Un id se renombra solo si choca** con uno del destino, sea de cálculo o de
 *   región: es el criterio de `sanearHoja` y de `desprender`. `mapa` dice cómo
 *   quedó cada cálculo, para llevarle sus posiciones.
 * - **Un grupo con el mismo nombre en el destino se reutiliza**: traer «Viento»
 *   a una obra que ya tiene un grupo «Viento» no puede dejar dos franjas con el
 *   mismo rótulo. Si no lo hay, se crea con el nombre y el color del origen.
 */
export function traerNodos(
  destino: Obra,
  origen: Obra,
  ids: Iterable<string>,
): { obra: Obra; mapa: Map<string, string> } {
  const elegidos = new Set(ids);
  const vistos = idsDeLaObra(destino);
  const grupos: Grupo[] = [...(destino.grupos ?? [])];
  const grupoDe = new Map<string, string>();
  const idsGrupo = new Set(grupos.map((g) => g.id));
  const mapa = new Map<string, string>();
  const nuevos: NodoCalculo[] = [];

  for (const k of origen.calculos) {
    if (!elegidos.has(k.id)) continue;
    const id = vistos.has(k.id) ? newId() : k.id;
    vistos.add(id);
    mapa.set(k.id, id);
    const { grupo: g, ...resto } = clonar(k);
    const copia: NodoCalculo = { ...resto, id, hoja: sanearHoja(resto.hoja, vistos, newId) };

    const suyo = g ? origen.grupos?.find((x) => x.id === g) : undefined;
    if (suyo) {
      let destinoG = grupoDe.get(suyo.id);
      if (!destinoG) {
        const igual = grupos.find((x) => x.nombre.trim() === suyo.nombre.trim());
        if (igual) {
          destinoG = igual.id;
        } else {
          destinoG = idsGrupo.has(suyo.id) ? newId() : suyo.id;
          idsGrupo.add(destinoG);
          grupos.push({ ...suyo, id: destinoG });
        }
        grupoDe.set(suyo.id, destinoG);
      }
      copia.grupo = destinoG;
    }
    nuevos.push(copia);
  }

  return {
    obra: {
      ...destino,
      calculos: [...destino.calculos, ...nuevos],
      ...(grupos.length ? { grupos } : {}),
    },
    mapa,
  };
}

/** Separación entre lo que había en el canvas y lo que se trae. */
const HUECO_TRAIDO = 160;

/**
 * Las posiciones del canvas de origen, llevadas a los nodos copiados.
 *
 * Solo viajan las de los cálculos que están en `mapa`, con su id nuevo. Si el
 * destino ya tiene nodos (`ocupadas`), el bloque traído se pone ENTERO por
 * debajo del más bajo, conservando la disposición relativa: los nodos que se
 * traen juntos suelen estar encadenados, y su forma es lo que deja leer las
 * flechas. Las `x` no se tocan.
 */
export function trasladarPosiciones(
  origen: Record<string, Posicion>,
  mapa: ReadonlyMap<string, string>,
  ocupadas: readonly Posicion[],
): Record<string, Posicion> {
  const salida: Record<string, Posicion> = {};
  for (const [viejo, nuevo] of mapa) {
    const p = origen[idNodoDeCalculo(viejo)];
    if (p) salida[idNodoDeCalculo(nuevo)] = { x: p.x, y: p.y };
  }
  const traidas = Object.values(salida);
  if (!ocupadas.length || !traidas.length) return salida;
  const fondo = Math.max(...ocupadas.map((p) => p.y));
  const techo = Math.min(...traidas.map((p) => p.y));
  const dy = fondo + HUECO_TRAIDO - techo;
  for (const p of traidas) p.y += dy;
  return salida;
}
