import { useEffect, useState } from 'react';
import { cargarModuloDeBiblioteca } from '../../lib/diseno/biblioteca';
import type { Entradas, ModuloDiseno } from '../../lib/diseno/tipos';
import NoEncontrado from './NoEncontrado';
import PaginaDiseno from './PaginaDiseno';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; modulo: ModuloDiseno<Entradas> }
  | { fase: 'ausente' }
  | { fase: 'error'; mensaje: string };

/**
 * `/diseno/<slug>` de una genérica de la biblioteca: descarga la hoja, arma el
 * módulo declarativo y lo monta en el mismo armazón que los módulos TS.
 */
export default function ModuloBiblioteca({ id }: { id: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'cargando' });
    cargarModuloDeBiblioteca(id)
      .then((modulo) => vivo && setEstado(modulo ? { fase: 'listo', modulo } : { fase: 'ausente' }))
      .catch((err: unknown) =>
        vivo && setEstado({ fase: 'error', mensaje: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      vivo = false;
    };
  }, [id]);

  switch (estado.fase) {
    case 'cargando':
      return (
        <main className="mx-auto w-full max-w-2xl px-4 py-16">
          <p className="text-sm text-muted">Cargando «{id}» desde la biblioteca…</p>
        </main>
      );
    case 'listo':
      return <PaginaDiseno modulo={estado.modulo} />;
    case 'ausente':
      return <NoEncontrado id={id} />;
    case 'error':
      return <NoEncontrado id={id} detalle={estado.mensaje} />;
  }
}
