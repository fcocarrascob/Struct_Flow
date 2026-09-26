// ─────────────────────────────────────────────────────────────────────────────
// Invariantes de cadena: lo que tiene que valer entre nodos, no dentro de uno.
//
// Cada genérica pasa sus casos; lo que se rompe en una obra es cómo se enchufan.
// En la revisión de las bases del Pachón (2026-09-25) los defectos serios fueron
// todos de este tipo: una base que no recibía lo que su plantilla nueva publicaba,
// un campo atado a un nombre que nadie define calculando con el valor de ejemplo,
// una genérica que estrenaba un campo que la obra nunca fijó. Por eso se comprueban
// aquí, para toda obra, y los usan el lienzo (`proyeccion.ts`) y el verificador de
// obras en disco.
//
// Los nombres usados sin dueño y los ciclos ya los dice `problemaDeGrafo`; aquí va
// lo que ese no ve.
// ─────────────────────────────────────────────────────────────────────────────

import { mensajeDeMotor } from '../../components/canvas/mensajes-motor';
import type { Severidad } from '../grafo';
import { camposActivos, configCompleta, VISTAS } from '../vistas/registro';
import { camposResueltos, type Genericas } from './biblioteca';
import { desfaseDePlantilla } from './ensamble';
import type { EvaluacionObra } from './evaluacion';
import { idNodoDeCalculo } from './ids';
import type { Obra } from './modelo';

export type TipoInvariante = 'campo-suelto' | 'atadura-rota' | 'plantilla-atras';

export interface Invariante {
  /** El id de nodo del grafo (`idNodoDeCalculo`). */
  idNodo: string;
  nodo: string;
  tipo: TipoInvariante;
  severidad: Severidad;
  motivo: string;
}

const lista = (xs: string[]) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? ` y ${xs.length - 5} más` : '');

export function invariantesDeObra(obra: Obra, ev: EvaluacionObra, genericas: Genericas): Invariante[] {
  const salida: Invariante[] = [];
  for (const k of obra.calculos) {
    const f = k.frontera;
    if (!f) continue;
    const idNodo = idNodoDeCalculo(k.id);
    const de = (tipo: TipoInvariante, severidad: Severidad, motivo: string) => salida.push({ idNodo, nodo: k.nombre, tipo, severidad, motivo });
    const fijados = new Set([...Object.keys(f.entradas ?? {}), ...Object.keys(f.formulas ?? {})]);

    // Todo campo de una genérica o de una vista está fijado o atado: el que no, toma
    // el valor de ejemplo sin que nadie lo haya elegido. Pasa cuando la genérica
    // estrena un campo después de que la obra se armó.
    const estado = f.procedencia === 'biblioteca' && f.slug ? genericas[f.slug] : undefined;
    const modulo = estado?.fase === 'lista' ? estado.modulo : undefined;
    const def = f.procedencia === 'vista' && f.vista ? VISTAS[f.vista] : undefined;
    const campos = modulo
      ? modulo.entradas.map((c) => c.nombre)
      : def
        ? camposActivos(def, configCompleta(def, f.config)).map((c) => c.nombre)
        : [];
    const sueltos = campos.filter((c) => !fijados.has(c));
    if (sueltos.length) {
      de('campo-suelto', 'aviso', `Sin fijar ni atar: ${lista(sueltos)}. Calcula con el valor de ejemplo de la ${modulo ? 'genérica' : 'vista'}.`);
    }

    // Un campo atado que no resuelve deja a la planilla con su último valor —el de
    // ejemplo, si nunca resolvió—: el número sale, pero no es el de la obra.
    const instancia = ev.importadas.get(idNodo);
    if (modulo && instancia) {
      for (const [campo, r] of Object.entries(camposResueltos(modulo, f, instancia.scope))) {
        if (!r.error) continue;
        const m = mensajeDeMotor(r.error).trim();
        de('atadura-rota', 'error', `Campo atado ${campo} = ${f.formulas?.[campo]}: ${m}${/[.!?]$/.test(m) ? '' : '.'} Calcula con el valor guardado.`);
      }
    }

    // Una base armada con una plantilla anterior: le falta lo que la de hoy trae.
    if (def?.plantilla && f.ensamble) {
      const desfase = desfaseDePlantilla(obra, def.plantilla, k.id);
      if (desfase.length) de('plantilla-atras', 'aviso', `La base quedó atrás de su plantilla: ${desfase.join('; ')}.`);
    }
  }
  return salida;
}
