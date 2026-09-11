import Enlace from '../Enlace';

/** `/diseno/<id>` sin módulo TS ni genérica promovible con ese id. */
export default function NoEncontrado({ id, detalle }: { id: string; detalle?: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold text-ink">No hay ningún módulo «{id}»</h1>
      {detalle ? (
        <p className="mt-2 font-mono text-xs text-[#b91c1c]">{detalle}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">Puede que el enlace sea de una versión anterior.</p>
      )}
      <p className="mt-2 text-sm text-muted">
        <Enlace a={{ vista: 'diseno' }} className="text-accent hover:underline">
          Ver los módulos disponibles
        </Enlace>
        .
      </p>
    </main>
  );
}
