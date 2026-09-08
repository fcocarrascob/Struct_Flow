import { useState } from 'react';
import type { RegionKind } from '../../lib/worksheet';

export interface SymbolEntry {
  /** Texto visible en el botón. */
  label: string;
  /** Texto que se inserta en el input activo. */
  insert: string;
  /** Posición del cursor tras insertar (por defecto, al final). */
  caret?: number;
  /** Descripción para el tooltip (qué hace el snippet). */
  desc?: string;
  /** Placeholder a seleccionar tras insertar (primera ocurrencia en `insert`). */
  select?: string;
}

interface Group {
  title: string;
  symbols: SymbolEntry[];
}

const fn = (name: string): SymbolEntry => ({ label: name, insert: `${name}()`, caret: name.length + 1 });
const greek = (glyph: string, name: string): SymbolEntry => ({ label: glyph, insert: name });

const GROUPS: Group[] = [
  {
    title: 'Aritmética',
    symbols: [
      { label: ':=', insert: ' := ' },
      { label: '=', insert: ' = ' },
      { label: '√', insert: 'sqrt()', caret: 5 },
      { label: 'xʸ', insert: '^' },
      { label: 'π', insert: 'pi' },
      { label: 'e', insert: 'e' },
      { label: '·', insert: '*' },
      { label: '÷', insert: '/' },
      { label: '( )', insert: '()', caret: 1 },
    ],
  },
  {
    title: 'Booleano',
    symbols: [
      { label: '<', insert: ' < ' },
      { label: '>', insert: ' > ' },
      { label: '≤', insert: ' <= ' },
      { label: '≥', insert: ' >= ' },
      { label: '=', insert: ' == ' },
      { label: '≠', insert: ' != ' },
      { label: '∧', insert: ' and ' },
      { label: '∨', insert: ' or ' },
      { label: '¬', insert: 'not ' },
    ],
  },
  {
    title: 'Programación',
    symbols: [
      { label: 'if', insert: 'if cond\n    expr', select: 'cond', desc: 'Condicional simple' },
      {
        label: 'if/else',
        insert: 'if cond\n    expr\nelse\n    expr',
        select: 'cond',
        desc: 'Condicional con alternativa',
      },
      { label: 'else if', insert: 'else if cond\n    expr', select: 'cond', desc: 'Rama adicional de un if' },
      {
        label: 'for',
        insert: 'for i in 1:n\n    expr',
        select: '1:n',
        desc: 'Bucle sobre un rango (1:n) o lista [..]',
      },
      { label: 'while', insert: 'while cond\n    expr', select: 'cond', desc: 'Bucle mientras se cumpla la condición' },
      { label: 'return', insert: 'return expr', select: 'expr', desc: 'Devuelve un valor del bloque' },
      { label: 'break', insert: 'break', desc: 'Sale del bucle' },
      { label: 'continue', insert: 'continue', desc: 'Salta a la siguiente iteración' },
    ],
  },
  {
    title: 'Funciones',
    symbols: [
      fn('sin'), fn('cos'), fn('tan'), fn('asin'), fn('acos'), fn('atan'),
      fn('log'), fn('log10'), fn('exp'), fn('abs'), fn('min'), fn('max'), fn('round'),
    ],
  },
  {
    title: 'Símbolos (α–ω)',
    symbols: [
      greek('α', 'alpha'), greek('β', 'beta'), greek('γ', 'gamma'), greek('δ', 'delta'),
      greek('ε', 'epsilon'), greek('ζ', 'zeta'), greek('η', 'eta'), greek('θ', 'theta'),
      greek('λ', 'lambda'), greek('μ', 'mu'), greek('ν', 'nu'), greek('ξ', 'xi'),
      greek('ρ', 'rho'), greek('σ', 'sigma'), greek('τ', 'tau'), greek('φ', 'phi'),
      greek('χ', 'chi'), greek('ψ', 'psi'), greek('ω', 'omega'),
    ],
  },
  {
    title: 'Símbolos (Α–Ω)',
    symbols: [
      greek('Γ', 'Gamma'), greek('Δ', 'Delta'), greek('Θ', 'Theta'), greek('Λ', 'Lambda'),
      greek('Ξ', 'Xi'), greek('Π', 'Pi'), greek('Σ', 'Sigma'), greek('Φ', 'Phi'),
      greek('Ψ', 'Psi'), greek('Ω', 'Omega'),
    ],
  },
  {
    title: 'Unidades',
    symbols: [
      { label: 'kN', insert: ' kN' },
      { label: 'kN·m', insert: ' kN*m' },
      { label: 'MPa', insert: ' MPa' },
      { label: 'mm', insert: ' mm' },
      { label: 'mm²', insert: ' mm^2' },
      { label: 'm', insert: ' m' },
      { label: 'kg', insert: ' kg' },
      { label: '°', insert: ' deg' },
      { label: 'tonf', insert: ' tonf' },
      { label: 'kgf', insert: ' kgf' },
      { label: 'kgf/cm²', insert: ' kgf/cm^2' },
      { label: 'tonf·m', insert: ' tonf*m' },
      { label: 'tonf/m', insert: ' tonf/m' },
    ],
  },
];

interface Props {
  /** Inserta el símbolo en el input de la región activa. */
  onInsert: (entry: SymbolEntry) => void;
  /** Tipo de la región en edición; habilita los snippets de programa. */
  activeKind?: RegionKind | null;
}

export default function SymbolPalette({ onInsert, activeKind }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="flex h-full w-44 flex-col gap-1 overflow-y-auto border-l border-border bg-surface/80 p-2 backdrop-blur">
      {GROUPS.map((group) => {
        const isCollapsed = collapsed[group.title];
        // Los bloques de programa solo tienen sentido en una región de programa:
        // se deshabilitan (con pista) mientras no se edita una.
        const disabled = group.title === 'Programación' && activeKind !== 'program';
        return (
          <div key={group.title}>
            <button
              className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-xs font-semibold text-ink hover:bg-ink/5"
              onClick={() => setCollapsed((c) => ({ ...c, [group.title]: !c[group.title] }))}
            >
              {group.title}
              <span className="text-muted">{isCollapsed ? '+' : '−'}</span>
            </button>
            {!isCollapsed && (
              <div className="mt-1 flex flex-wrap gap-1 pb-1">
                {disabled && (
                  <p className="w-full text-[10px] leading-tight text-muted">
                    Crea un bloque <span className="font-medium">ƒ Programa</span> para usar estos.
                  </p>
                )}
                {group.symbols.map((s) => (
                  <button
                    key={s.label}
                    disabled={disabled}
                    className="min-w-7 rounded border border-border bg-white px-1.5 py-0.5 text-xs text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink"
                    title={s.desc ?? s.insert.trim()}
                    // preventDefault para no robar el foco al input activo
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsert(s)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
