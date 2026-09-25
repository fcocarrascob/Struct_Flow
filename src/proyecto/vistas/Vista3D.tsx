// La vista 3D de un modelo geométrico. Solo de pantalla: el papel lleva el
// dibujo 2D, que sale del mismo modelo.
//
// Se carga con `React.lazy` desde la pestaña de la vista, así que three.js no
// entra en el bundle principal: quien nunca abre un 3D no lo descarga.
//
// Z hacia arriba, como en el modelo: la cámara se orienta con `up = (0, 0, 1)` y
// las piezas se construyen en sus propias coordenadas, en milímetros.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ModeloGeometrico, Pieza, Rol } from './tipos';

const COLOR: Record<Rol, number> = {
  pedestal: 0xd1d5db,
  mortero: 0xe5e7eb,
  placa: 0x6b7280,
  chapa: 0x9ca3af,
  nervio: 0x9ca3af,
  columna: 0x4b5563,
  perno: 0x1f2937,
  golilla: 0x374151,
  llave: 0x6b7280,
  barra: 0xb45309,
  estribo: 0xd97706,
};
const ROJO = 0xdc2626;

const ROTULO: Record<Rol, string> = {
  pedestal: 'pedestal',
  mortero: 'mortero',
  placa: 'placa',
  chapa: 'chapas',
  nervio: 'nervios',
  columna: 'columna',
  perno: 'pernos',
  golilla: 'placas de apoyo',
  llave: 'llave',
  barra: 'barras',
  estribo: 'estribos',
};

/** Las mallas de una pieza, en coordenadas del modelo. */
function mallas(p: Pieza, material: THREE.Material): THREE.Mesh[] {
  if (p.tipo === 'caja') {
    const g = new THREE.BoxGeometry(p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0);
    const m = new THREE.Mesh(g, material);
    m.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
    return [m];
  }
  if (p.tipo === 'cilindro') {
    const g = new THREE.CylinderGeometry(p.r, p.r, p.z1 - p.z0, 16);
    const m = new THREE.Mesh(g, material);
    m.rotation.x = Math.PI / 2; // el eje del cilindro de three es Y; el del modelo, Z
    m.position.set(p.x, p.y, (p.z0 + p.z1) / 2);
    return [m];
  }
  if (p.tipo === 'prisma') {
    const forma = new THREE.Shape(p.contorno.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(forma, { depth: p.z1 - p.z0, bevelEnabled: false });
    const m = new THREE.Mesh(g, material);
    m.position.z = p.z0;
    return [m];
  }
  // Un lazo: un tramo de barra por lado.
  return p.puntos.map(([x0, y0], i) => {
    const [x1, y1] = p.puntos[(i + 1) % p.puntos.length];
    const largo = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.CylinderGeometry(p.r, p.r, largo, 8);
    const m = new THREE.Mesh(g, material);
    // El cilindro nace en Y: se gira al plano horizontal y a la dirección del tramo.
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, p.z);
    return m;
  });
}

export default function Vista3D({ modelo }: { modelo: ModeloGeometrico }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const roles = useMemo(() => [...new Set(modelo.piezas.map((p) => p.rol))], [modelo]);
  const [ocultos, setOcultos] = useState<ReadonlySet<Rol>>(new Set());
  const grupos = useRef(new Map<Rol, THREE.Group>());

  useEffect(() => {
    const div = contenedor.current;
    if (!div) return;
    const escena = new THREE.Scene();
    escena.background = new THREE.Color(0xf8fafc);
    const culpables = new Set(modelo.chequeos.filter((c) => !c.cumple && !c.aviso).map((c) => c.piezas[0]));

    // Un material por rol (y uno rojo), compartido por todas sus piezas.
    const materiales = new Map<string, THREE.Material>();
    const material = (rol: Rol, rojo: boolean) => {
      const clave = rojo ? 'rojo' : rol;
      let m = materiales.get(clave);
      if (!m) {
        const transparente = rol === 'pedestal' || rol === 'mortero';
        m = new THREE.MeshStandardMaterial({
          color: rojo ? ROJO : COLOR[rol],
          transparent: transparente,
          opacity: transparente ? 0.18 : 1,
          depthWrite: !transparente,
          metalness: rol === 'barra' || rol === 'estribo' ? 0.1 : 0.3,
          roughness: 0.7,
        });
        materiales.set(clave, m);
      }
      return m;
    };

    grupos.current = new Map();
    for (const p of modelo.piezas) {
      let g = grupos.current.get(p.rol);
      if (!g) {
        g = new THREE.Group();
        grupos.current.set(p.rol, g);
        escena.add(g);
      }
      for (const m of mallas(p, material(p.rol, culpables.has(p.id)))) g.add(m);
    }

    escena.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sol = new THREE.DirectionalLight(0xffffff, 1.1);
    sol.position.set(3000, -4000, 6000);
    escena.add(sol);

    // Encuadre: la caja de todo el modelo.
    const caja = new THREE.Box3().setFromObject(escena);
    const centro = caja.getCenter(new THREE.Vector3());
    const tam = caja.getSize(new THREE.Vector3()).length();
    const camara = new THREE.PerspectiveCamera(35, div.clientWidth / Math.max(div.clientHeight, 1), tam / 100, tam * 10);
    camara.up.set(0, 0, 1);
    camara.position.set(centro.x + tam * 0.9, centro.y - tam * 1.1, centro.z + tam * 0.6);

    const render = new THREE.WebGLRenderer({ antialias: true });
    render.setPixelRatio(window.devicePixelRatio);
    render.setSize(div.clientWidth, div.clientHeight);
    div.appendChild(render.domElement);

    const control = new OrbitControls(camara, render.domElement);
    control.target.copy(centro);
    control.update();

    let cuadro = 0;
    const dibujar = () => {
      cuadro = requestAnimationFrame(dibujar);
      control.update();
      render.render(escena, camara);
    };
    dibujar();

    const alCambiarTamano = new ResizeObserver(() => {
      const w = div.clientWidth;
      const h = Math.max(div.clientHeight, 1);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      render.setSize(w, h);
    });
    alCambiarTamano.observe(div);

    return () => {
      cancelAnimationFrame(cuadro);
      alCambiarTamano.disconnect();
      control.dispose();
      escena.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of materiales.values()) m.dispose();
      render.dispose();
      render.domElement.remove();
    };
  }, [modelo]);

  useEffect(() => {
    for (const [rol, g] of grupos.current) g.visible = !ocultos.has(rol);
  }, [ocultos, modelo]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-white px-4 py-1.5">
        {roles.map((rol) => (
          <label key={rol} className="flex items-center gap-1 text-[10px] text-muted">
            <input
              type="checkbox"
              checked={!ocultos.has(rol)}
              onChange={(e) =>
                setOcultos((prev) => {
                  const s = new Set(prev);
                  if (e.target.checked) s.delete(rol);
                  else s.add(rol);
                  return s;
                })
              }
            />
            {ROTULO[rol]}
          </label>
        ))}
        <span className="ml-auto text-[10px] text-muted">arrastrar gira · rueda acerca · botón derecho desplaza</span>
      </div>
      <div ref={contenedor} className="min-h-0 flex-1" />
    </div>
  );
}
