import { MODULOS } from '../../lib/diseno/registro';
import { TITULOS } from '../../lib/catalogo';
import Enlace from '../Enlace';

/**
 * El índice de módulos de diseño. Se puebla solo del registro, así que un
 * módulo nuevo aparece aquí por el hecho de estar registrado.
 */
export default function IndiceDiseno() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav className="mb-2 text-xs text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Inicio
        </Enlace>
        {' / Diseño de elementos'}
      </nav>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Diseño de elementos</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Ingresa los parámetros y mira cómo se redibuja el elemento y cómo se mueven los factores
          de utilización. Cuando el diseño cuadre, exporta la memoria: son las mismas expresiones
          que acabas de ver evaluarse, con el esquema dentro, listas para editar o imprimir.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {MODULOS.map((mod) => (
          <li key={mod.id}>
            <Enlace
              a={{ vista: 'modulo', id: mod.id }}
              className="group flex h-full flex-col rounded-lg border border-border bg-white p-4 no-underline hover:border-accent"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink group-hover:text-accent">
                  {mod.titulo}
                </h2>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {TITULOS[mod.disciplina] ?? mod.disciplina}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{mod.resumen}</p>
              <p className="mt-2 font-mono text-[10px] text-muted">{mod.norma}</p>
            </Enlace>
          </li>
        ))}
      </ul>
    </main>
  );
}
