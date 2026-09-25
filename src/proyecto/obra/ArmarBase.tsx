import { useState } from 'react';
import type { Parametros } from './ensamble';
import type { Recomendacion } from './recomendar-placa';
import { ALIAS_RE, aliasPorDefecto } from './sap-apoyos';
import { Dialogo } from './SeleccionNodos';
import { configCompleta, opcionApagada } from '../vistas/registro';
import type { Config, DefVista } from '../vistas/tipos';

/**
 * Armar la base de un tipo de apoyo: el grupo entero —datos, capacidad, placa,
 * anclaje, llave, silla, pedestal, resumen y vista— desde la plantilla de la vista
 * (`ensamble.ts`).
 *
 * Tiene dos puertas y es el mismo formulario. Desde el panel de apoyos el tipo
 * viene dado y los conjuntos se eligen entre los que publican; desde la paleta
 * se escriben, y la base trae además una hoja para escribir las solicitaciones a
 * mano, porque no hay nodo de apoyos que las publique.
 */
export default function ArmarBase({
  def,
  tipo,
  conjuntos,
  recomendacion,
  configInicial,
  error,
  onArmar,
  onCerrar,
}: {
  def: DefVista;
  /** Desde el panel de apoyos: el grupo de SAP y su alias, fijos. */
  tipo?: { grupoSap: string; alias: string };
  /** Los alias de los conjuntos que publica el nodo de apoyos; vacío desde la paleta. */
  conjuntos: readonly string[];
  /** La placa que sugieren las gobernantes del tipo; parte seleccionada, y decide el ingeniero. */
  recomendacion?: Recomendacion | null;
  /** La tipología elegida en «crear apoyo»: manda sobre la sugerida, y cada opción se sigue pudiendo cambiar. */
  configInicial?: Config;
  error: string;
  onArmar: (params: Parametros, config: Config, aMano: boolean) => void;
  onCerrar: () => void;
}) {
  const aMano = !tipo;
  const [grupoSap, setGrupoSap] = useState(tipo?.grupoSap ?? '');
  const [alias, setAlias] = useState(tipo?.alias ?? '');
  const [diseno, setDiseno] = useState(conjuntos[0] ?? 'LRFD');
  const [sobre, setSobre] = useState(conjuntos[1] ?? conjuntos[0] ?? 'O0');
  const [config, setConfig] = useState<Config>(() =>
    configCompleta(def, configInicial ?? (recomendacion ? { placa: recomendacion.variante } : undefined)),
  );

  const aliasEfectivo = alias.trim() || aliasPorDefecto(grupoSap.trim() || 'X');
  const problema = !grupoSap.trim()
    ? 'Falta el nombre del tipo de apoyo.'
    : !ALIAS_RE.test(aliasEfectivo)
      ? `El alias «${aliasEfectivo}» no sirve: letras y números, empezando por letra, sin «_».`
      : ![diseno, sobre].every((c) => ALIAS_RE.test(c))
        ? 'Los conjuntos se nombran por su alias: letras y números, sin «_».'
        : diseno === sobre
          ? 'El conjunto de diseño y el de sobrerresistencia tienen que ser distintos.'
          : '';

  const campo = 'mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm text-ink outline-none focus:border-accent';
  const conjunto = (valor: string, cambiar: (v: string) => void, etiqueta: string) => (
    <label className="block text-xs text-muted">
      {etiqueta}
      {conjuntos.length ? (
        <select value={valor} onChange={(e) => cambiar(e.target.value)} className={campo}>
          {conjuntos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input type="text" value={valor} onChange={(e) => cambiar(e.target.value.trim())} className={`${campo} font-mono`} />
      )}
    </label>
  );

  return (
    <Dialogo
      titulo={tipo ? `Base de columna de ${tipo.grupoSap}` : 'Base de columna'}
      onCerrar={onCerrar}
      pie={
        <div className="space-y-2">
          {(problema || error) && <p className="text-[11px] leading-snug text-error">{problema || error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] leading-snug text-muted">
              Los nombres del grupo llevan el sufijo <span className="font-mono">_{aliasEfectivo}</span>. Los valores de
              partida son supuestos, marcados para revisar. Ctrl+Z lo retira entero.
            </p>
            <button
              type="button"
              disabled={!!problema}
              onClick={() =>
                onArmar({ tipo: aliasEfectivo, grupoSap: grupoSap.trim(), diseno, sobrerresistencia: sobre }, config, aMano)
              }
              className="shrink-0 rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Armar la base
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {aMano ? (
          <>
            <p className="text-[11px] leading-snug text-muted">
              Sin nodo de apoyos, la base trae una hoja con las solicitaciones gobernantes en cero, para escribirlas a mano.
              Si la obra tiene el nodo de apoyos, arma la base desde su panel.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted">
                Tipo de apoyo
                <input type="text" value={grupoSap} onChange={(e) => setGrupoSap(e.target.value)} placeholder="COL_PPALES" className={campo} />
              </label>
              <label className="block text-xs text-muted">
                Alias
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value.trim())}
                  placeholder={aliasPorDefecto(grupoSap.trim() || 'X')}
                  className={`${campo} font-mono`}
                />
              </label>
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-muted">
            Las solicitaciones se atan a las gobernantes de <span className="font-mono">{tipo.alias}</span> que publica el
            nodo de apoyos.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {conjunto(diseno, setDiseno, 'Conjunto de diseño')}
          {conjunto(sobre, setSobre, 'Conjunto de sobrerresistencia')}
        </div>
        {def.opciones.map((o) => (
          <label key={o.clave} className="block text-xs text-muted">
            {o.titulo}
            {opcionApagada(o, config) && <span className="ml-1 text-[10px]">— no aplica: {o.soloSiTexto ?? o.soloSi}</span>}
            <select
              value={config[o.clave]}
              disabled={opcionApagada(o, config)}
              // Cada cambio pasa por la normalización: con la placa rotulada, la silla y la capacidad se apagan solas.
              onChange={(e) => setConfig(configCompleta(def, { ...config, [o.clave]: e.target.value }))}
              className={campo}
            >
              {o.variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}
                  {o.clave === 'placa' && recomendacion?.variante === v.id ? ' — sugerida' : ''}
                </option>
              ))}
            </select>
            {o.clave === 'placa' && recomendacion && (
              <span className="mt-1 block text-[10px] leading-snug">
                Sugerida: {o.variantes.find((v) => v.id === recomendacion.variante)?.titulo.toLowerCase()}, porque{' '}
                {recomendacion.motivo}.
              </span>
            )}
          </label>
        ))}
      </div>
    </Dialogo>
  );
}
