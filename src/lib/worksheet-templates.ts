// Catálogo de plantillas cargables en el canvas (galería estilo SMath).
// Cada plantilla usa el mismo formato {version, regions} de export/import.
// Las planillas se disponen en UNA columna (orden de lectura arriba→abajo) para
// que el scope compartido se resuelva sin sorpresas (evita el cruce de columnas
// del orden por filas de evaluateSheet).

import type { Region } from './worksheet';
// Los constructores de regiones viven en worksheet-layout.ts, compartidos con
// el generador de memorias del verificador de secciones.
import { layout, m, p, t, type Item } from './worksheet-layout';

export interface Template {
  id: string;
  titulo: string;
  norma: string;
  descripcion: string;
  regions: Region[];
}

// --- Viga de hormigón armado: flexión + cortante (ACI 318-25, Cap. 9) ---------
// Planilla paramétrica y ordenada (entradas arriba, chequeos abajo): reproduce el
// ejemplo trabajado /hormigon/ejemplo-viga-flexion-corte, y al editar cualquier
// dato de entrada todos los resultados se recalculan.
//
// Usa las funciones del canvas `sqrtfc(fc)` (= √f'c como tensión en kgf/cm²),
// `beta1(fc)` y `phiFlexion(et, ety)` — ver src/lib/worksheet.ts. Los coeficientes
// empíricos (0.53, 0.8, 2.1, 14, …) están en la forma kgf/cm² de la práctica local.
const vigaItems: Item[] = [
  t('VIGA DE HORMIGÓN ARMADO — Flexión y cortante · ACI 318-25 (Cap. 9)'),
  t('Planilla interactiva: edita cualquier dato de entrada y todos los chequeos se recalculan.'),

  t('━━ DATOS · MATERIALES ━━'),
  m('fc := 250 kgf/cm^2'),
  m('fy := 4200 kgf/cm^2'),
  m('fyt := 4200 kgf/cm^2'),
  m('Es := 2.1e6 kgf/cm^2'),
  m('lambda := 1'),

  t('━━ DATOS · GEOMETRÍA (b: ancho · d: peralte efectivo, 1 capa → dt = d) ━━'),
  m('b := 30 cm'),
  m('h := 60 cm'),
  m('d := 54 cm'),

  t('━━ DATOS · CARGAS (vano simplemente apoyado, carga uniforme) ━━'),
  m('Dw := 3.0 tonf/m'),
  m('Lw := 1.5 tonf/m'),
  m('L := 6 m'),

  t('━━ DATOS · REFUERZO PROVISTO (3φ25 fondo · estribo Eφ10 @ 25, 2 ramas) ━━'),
  m('As := 14.73 cm^2'),
  m('Av := 1.571 cm^2'),
  m('s := 25 cm'),

  t('━━ SOLICITACIONES (Sec. 5.3) ━━'),
  m('wu := 1.2*Dw + 1.6*Lw = tonf/m'),
  m('Mu := wu*L^2/8 = tonf*m'),
  t('Corte de diseño a distancia d de la cara del apoyo (Sec. 9.4.3.2)'),
  m('Vu := wu*(L/2 - d) = tonf'),

  t('━━ FLEXIÓN (Cap. 22.2) ━━'),
  m('sfc := sqrtfc(fc) = kgf/cm^2'),
  m('b1 := beta1(fc) ='),
  m('ety := fy/Es ='),
  m('a := As*fy/(0.85*fc*b) = cm'),
  m('c := a/b1 = cm'),
  m('et := 0.003*(d - c)/c ='),
  m('phi := phiFlexion(et, ety) ='),
  m('Mn := As*fy*(d - a/2) = tonf*m'),
  m('phiMn := phi*Mn = tonf*m'),
  t('Resistencia a flexión:  φMn ≥ Mu'),
  m('phiMn >= Mu ='),
  m('Asmin := max(0.8*sfc, 14 kgf/cm^2)/fy*b*d = cm^2'),
  t('Refuerzo mínimo (Sec. 9.6.1.2):  As ≥ As,mín'),
  m('As >= Asmin ='),
  t('Ductilidad (Sec. 9.3.3.1):  εt ≥ εty + 0.003'),
  m('et >= ety + 0.003 ='),

  t('━━ CORTANTE (Cap. 22.5) ━━'),
  m('Vc := 0.53*lambda*sfc*b*d = tonf'),
  m('Vs := Av*fyt*d/s = tonf'),
  m('Vn := Vc + Vs = tonf'),
  m('phiVn := 0.75*Vn = tonf'),
  t('Resistencia a cortante:  φVn ≥ Vu'),
  m('phiVn >= Vu ='),
  m('Vsmax := 2.1*sfc*b*d = tonf'),
  t('Tope de Vs / biela (Sec. 22.5.10.5.3):  Vs ≤ Vs,máx'),
  m('Vs <= Vsmax ='),
  m('Avmin := max(0.2*sfc, 3.5 kgf/cm^2)*b*s/fyt = cm^2'),
  t('Estribo mínimo (Sec. 9.6.3.4):  Av ≥ Av,mín'),
  m('Av >= Avmin ='),
  p('smaxv :=\n    lim := 1.03*sfc*b*d\n    if Vs <= lim\n        return min(d/2, 600 mm)\n    return min(d/4, 300 mm)'),
  t('Espaciamiento máx (Tabla 9.7.6.2.2):  s ≤ s,máx'),
  m('s <= smaxv ='),
];

const vigaFlexionCorte: Template = {
  id: 'viga-flexion-corte',
  titulo: 'Viga — Flexión y cortante (ACI 318-25)',
  norma: 'ACI 318-25 Cap. 9',
  descripcion: 'Diseño de viga de hormigón armado a flexión y cortante con todos los chequeos. Reproduce el ejemplo trabajado del blog.',
  regions: layout('viga', 40, 32, vigaItems),
};

// --- Pernos de anclaje: tracción, corte e interacción (ACI 318-25, Cap. 17) ---
// Solo resistencia del ACERO del perno (17.6.1.2 tracción, 17.7.1.2 corte) más la
// interacción tracción-corte (17.8.3). No incluye los modos de falla del hormigón
// (breakout, pullout, pryout, side-face blowout, splitting) — ver Note al final.
// Ase se aproxima como 0.75*Ag (rosca UNC estándar); reemplazar por el área neta
// real de catálogo cuando esté disponible.
const pernoAnclajeItems: Item[] = [
  t('PERNOS DE ANCLAJE — Tracción, corte e interacción · ACI 318-25 (Cap. 17)'),

  t('Materiales · perno de anclaje'),
  m('futa := 400 MPa'),
  m('phiN := 0.75'),
  m('phiV := 0.65'),

  t('Geometría del grupo de pernos'),
  m('n := 4'),
  m('db := 22 mm'),
  m('Ag := pi/4*db^2 = mm^2'),
  m('Ase := 0.75*Ag = mm^2'),

  t('Solicitaciones mayoradas (grupo completo)'),
  m('Nua := 12 tonf'),
  m('Vua := 8 tonf'),

  t('━━ RESISTENCIA DEL ACERO — TRACCIÓN (17.6.1.2) ━━'),
  m('Nsa := n*Ase*futa = tonf'),
  m('phiNsa := phiN*Nsa = tonf'),
  t('φNsa ≥ Nua'),
  m('phiNsa >= Nua ='),

  t('━━ RESISTENCIA DEL ACERO — CORTE (17.7.1.2) ━━'),
  m('Vsa := n*0.6*Ase*futa = tonf'),
  m('phiVsa := phiV*Vsa = tonf'),
  t('φVsa ≥ Vua'),
  m('phiVsa >= Vua ='),

  t('━━ INTERACCIÓN TRACCIÓN-CORTE (17.8.3) ━━'),
  m('rn := Nua/phiNsa ='),
  m('rv := Vua/phiVsa ='),
  p('cumple_interaccion :=\n    if rn <= 0.2\n        return true\n    else if rv <= 0.2\n        return true\n    return (rn + rv) <= 1.2'),
  t('Cumple si rn≤0.2, o rv≤0.2, o rn+rv≤1.2'),
  m('cumple_interaccion ='),

  t('⚠ Solo resistencia del acero. Falta verificar breakout, pullout, pryout,'),
  t('side-face blowout y splitting del hormigón (resto del Cap. 17).'),
];

const pernoAnclaje: Template = {
  id: 'perno-anclaje-traccion-corte',
  titulo: 'Pernos de anclaje — Tracción, corte e interacción (ACI 318-25)',
  norma: 'ACI 318-25 Cap. 17 (resistencia del acero)',
  descripcion: 'Resistencia del acero de un grupo de pernos de anclaje a tracción y corte, y chequeo de interacción, con valores de ejemplo.',
  regions: layout('perno', 40, 32, pernoAnclajeItems),
};

export const TEMPLATES: Template[] = [vigaFlexionCorte, pernoAnclaje];
