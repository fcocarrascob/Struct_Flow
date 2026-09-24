// ─────────────────────────────────────────────────────────────────────────────
// La forma de un nodo y de una flecha del canvas de obra.
//
// Esta capa es pura: no importa React ni hace fetch. La comparten la proyección
// (`obra/proyeccion.ts`), que deriva el grafo de la obra, y el layout
// (`layout.ts`), que lo coloca.
//
// POR QUÉ `src/proyecto/` Y NO `src/lib/proyecto/`
// -----------------------------------------------
// Por convención le tocaría vivir junto a `lib/diseno/`. Está aparte por una
// razón mecánica: el harness sella el MOTOR de este repo como el hash de árbol
// de `src/lib` y `scripts`. Cualquier archivo nuevo dentro de `src/lib` mueve
// ese hash, y mover el hash del motor marca `eval_de_otro_motor` en TODAS las
// planillas de TODOS los proyectos del harness, que hay que reverificar una por
// una. Una obra no evalúa ninguna planilla publicada, así que su código no tiene
// por qué disparar esa cascada.
// ─────────────────────────────────────────────────────────────────────────────

export type Severidad = 'ok' | 'aviso' | 'error';

export interface NodoGrafo {
  id: string;
  tipo: string;
  etiqueta: string;
  subtitulo: string;
  campos: Record<string, unknown>;
  severidad: Severidad;
  archivo: string;
  linea: number;
  editable: boolean;
  /** Por qué el nodo está en amarillo o en rojo. Un nodo rojo sin motivo obliga
   *  a salir del canvas para averiguarlo, que es lo que el canvas viene a evitar. */
  motivos: string[];
}

export interface AristaGrafo {
  desde: string;
  hasta: string;
  tipo: string;
  etiqueta: string;
  severidad: Severidad;
}

/** El peor de dos severidades. El orden importa: un nodo con varios desfases
 *  toma el peor, nunca el último que se leyó. */
export const ORDEN_SEVERIDAD: Record<Severidad, number> = { ok: 0, aviso: 1, error: 2 };

export function peor(a: Severidad, b: Severidad): Severidad {
  return ORDEN_SEVERIDAD[a] >= ORDEN_SEVERIDAD[b] ? a : b;
}
