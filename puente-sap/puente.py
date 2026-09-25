"""El puente de Struct_Flow con SAP2000: un servicio local, solo para esta máquina.

    npm run puente-sap          (o: python puente-sap/puente.py)

Escucha en 127.0.0.1:8789 y la aplicación le habla por `/sap-api` (el proxy de
Vite). Es de Flow y de nadie más: no importa nada de Struct_Harness, así la
aplicación funciona con SAP2000 sin que el asistente esté corriendo
(`docs/rumbo.md`, «Flow es la aplicación; el Harness, el asistente que la usa»).

SOLO LEE. Nunca escribe en el modelo, nunca lo guarda ni lo analiza, nunca
lanza SAP2000 ni abre una segunda instancia: se engancha al que el usuario ya
tiene abierto y le pregunta qué hay. Las cargas las aplica el ingeniero; Flow
declara lo que el modelo tiene que tener y verifica que lo tenga
(`docs/rumbo.md`, «Flow no escribe en el modelo»). Lo único que toca son las
unidades de pantalla, para leer en kN-m, y las devuelve al terminar.

Rutas:
    GET  /salud      -> {ok}
    POST /conectar   -> {modelo, ruta, version, modificado}   o 409 con {motivo}
    GET  /patrones   -> {modelo, ruta, patrones: [{nombre, tipo, pesoPropio}]}
    GET  /grupos     -> {modelo, ruta, grupos: [{nombre, barras, areas}]}
    GET  /cargas     -> {modelo, ruta, cargas: [{patron, clase, valor, dir, ..., n}]}
                     (las cargas asignadas, agrupadas por patrón y valor)
    GET  /espectro   -> {modelo, ruta, casos: [{nombre, cargas: [{dir, funcion, sf}], ...}],
                         funciones: [{nombre, puntos: [[T, Sa], ...]}]}
    GET  /casos      -> {modelo, ruta, casos: [{nombre, tipo, estado, cargas?, modal?, modos?}]}
    GET  /masa       -> {modelo, ruta, fuentes: [{nombre, porDefecto, deElementos, deMasas,
                         deCargas, cargas: [{patron, sf}]}]}
    GET  /resumen    -> {modelo, ruta, unidades, nudos, barras, areas, links, grupos,
                         materiales, seccionesBarra, seccionesArea, patrones, casos,
                         analizados, combinaciones}
    GET  /combinaciones -> {modelo, ruta, combinaciones: [{nombre, tipo,
                         terminos: [{clase: caso|combinacion, nombre, sf}]}]}
    GET  /modal?caso=MODAL -> {modelo, ruta, modificado, caso, modos: [{n, T, f, ux, uy,
                         uz, rz, sux, suy, suz}]}   o 409 si el caso no está analizado
    POST /aplicaciones/leer {aplicaciones} -> la carga de cada patrón sobre su grupo
                     (POST solo porque la lista viaja en el cuerpo: no modifica nada)

Una sola instancia viva, como en el harness: con dos SAP2000.exe, una colgada
mantiene bloqueados los archivos y no se sabe a cuál se engancharía.
"""

import json
import subprocess
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PUERTO = 8789
LOCALES = ("localhost", "127.0.0.1", "::1")
PROGID = "CSI.SAP2000.API.SapObject"


class ErrorPuente(Exception):
    def __init__(self, codigo, motivo):
        super().__init__(motivo)
        self.codigo = codigo
        self.motivo = motivo


def _procesos_sap():
    """Los SAP2000.exe vivos. Sin psutil: tasklist viene con Windows."""
    salida = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq SAP2000.exe", "/FO", "CSV", "/NH"],
        capture_output=True, text=True, check=False).stdout
    return [ln for ln in salida.splitlines() if ln.startswith('"SAP2000.exe"')]


def _modelo_abierto():
    """El `SapModel` del SAP2000 abierto, o un `ErrorPuente` que dice por qué no."""
    vivos = _procesos_sap()
    if not vivos:
        raise ErrorPuente(409, "No hay ningún SAP2000 abierto. Ábrelo con el modelo y vuelve a intentar.")
    if len(vivos) > 1:
        raise ErrorPuente(
            409,
            f"Hay {len(vivos)} instancias de SAP2000 abiertas. Deja una sola: con dos no se sabe "
            "a cuál conectarse, y una colgada bloquea los archivos del modelo.")

    import comtypes.client

    try:
        helper = comtypes.client.CreateObject("SAP2000v1.Helper")
        helper = helper.QueryInterface(comtypes.gen.SAP2000v1.cHelper)
        sap = helper.GetObject(PROGID)
    except Exception as e:  # noqa: BLE001 — cualquier fallo de COM se le dice al usuario
        raise ErrorPuente(502, f"SAP2000 está abierto pero no respondió a la conexión: {e}") from e
    if sap is None:
        raise ErrorPuente(502, "SAP2000 está abierto pero no aceptó la conexión (¿un diálogo abierto?).")
    return sap.SapModel


def _nombre_modelo(modelo):
    ruta = str(modelo.GetModelFilename(True) or "")
    return ruta, (Path(ruta).name if ruta else "")


SIN_GUARDAR = "SAP2000 está abierto, pero el modelo no está guardado todavía. Guárdalo y vuelve a intentar."


def _modelo_guardado():
    """Como `_modelo_abierto`, pero exige un modelo con archivo.

    Lo que Flow lee lo guarda en la obra con el nombre y la ruta del modelo de
    donde salió: una verificación que no dice contra qué modelo se hizo no
    verifica nada, y un modelo sin guardar no tiene nombre.
    """
    modelo = _modelo_abierto()
    ruta, nombre = _nombre_modelo(modelo)
    if not ruta:
        raise ErrorPuente(409, SIN_GUARDAR)
    return modelo, ruta, nombre


def _modificado(ruta):
    """Cuándo se guardó el `.sdb` por última vez, en ISO: el sello de lo que se lee.

    Una lectura de resultados que tiene un `modificado` anterior al del modelo
    abierto está atrasada: el modelo cambió después de leerla.
    """
    from datetime import datetime, timezone

    try:
        return datetime.fromtimestamp(Path(ruta).stat().st_mtime, timezone.utc).isoformat()
    except OSError:
        return ""


def conectar():
    """Se engancha al SAP2000 abierto y devuelve lo que se sabe del modelo."""
    modelo, ruta, nombre = _modelo_guardado()
    version = ""
    try:
        # Devuelve (version, numero, ret); basta con el texto.
        version = str(modelo.GetVersion()[0])
    except Exception:  # noqa: BLE001 — la versión es un dato de cortesía
        pass
    return {"modelo": nombre, "ruta": ruta, "version": version, "modificado": _modificado(ruta)}


def _enum(prefijo):
    """Código de un enum de la API -> su nombre (`Dead`, `LinearStatic`…).

    Sale del enum que comtypes generó de la biblioteca de tipos de SAP2000, no
    de una tabla escrita a mano: una versión de SAP que agregue valores los trae
    sola.
    """
    import comtypes.gen.SAP2000v1 as api

    return {getattr(api, k): k[len(prefijo):] for k in dir(api) if k.startswith(prefijo)}


def _tipos_de_patron():
    """Código de `eLoadPatternType` -> su nombre en la API (`Dead`, `Wind`…)."""
    return _enum("eLoadPatternType_")


def patrones():
    """Los Load Patterns del modelo abierto: nombre, tipo y multiplicador de peso propio.

    Solo lee. Cada llamada de la API devuelve [valor, ret]; un ret distinto de 0
    es un fallo de SAP y se dice, en vez de devolver un 0 que parece un dato.
    """
    modelo, ruta, nombre = _modelo_guardado()
    tipos = _tipos_de_patron()
    _, nombres, ret = modelo.LoadPatterns.GetNameList()
    if ret != 0:
        raise ErrorPuente(502, "SAP2000 no entregó la lista de Load Patterns.")
    lista = []
    for p in nombres or []:
        codigo, r1 = modelo.LoadPatterns.GetLoadType(p)
        peso, r2 = modelo.LoadPatterns.GetSelfWTMultiplier(p)
        if r1 != 0 or r2 != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó el tipo o el peso propio de «{p}».")
        lista.append({"nombre": str(p), "tipo": tipos.get(codigo, f"código {codigo}"), "pesoPropio": float(peso)})
    return {"modelo": nombre, "ruta": ruta, "patrones": lista}


# ── Grupos y cargas sobre objetos ────────────────────────────────────────────

# Tipos de objeto de `GroupDef.GetAssignments`.
OBJ_BARRA, OBJ_AREA = 2, 5
KN_M_C = 6  # eUnits.kN_m_C


class _EnKnM:
    """Lee en kN-m, y devuelve al usuario las unidades que tenía.

    Los valores de la API salen en las unidades de PANTALLA: sin esto, 0,3 kN/m²
    se leería como 0,03 si el usuario estaba mirando en tonf. Y cambiarle las
    unidades sin devolverlas le cambiaría la vista del modelo.
    """

    def __init__(self, modelo):
        self.modelo = modelo

    def __enter__(self):
        self.antes = self.modelo.GetPresentUnits()
        if self.antes != KN_M_C:
            self.modelo.SetPresentUnits(KN_M_C)
        return self.modelo

    def __exit__(self, *_):
        if self.antes != KN_M_C:
            self.modelo.SetPresentUnits(self.antes)


def _asignados(modelo, grupo):
    """Las barras y las áreas de un grupo."""
    _, tipos, nombres, ret = modelo.GroupDef.GetAssignments(grupo)
    if ret != 0:
        raise ErrorPuente(404, f"No hay un grupo «{grupo}» en el modelo.")
    barras = [str(n) for t, n in zip(tipos or [], nombres or []) if t == OBJ_BARRA]
    areas = [str(n) for t, n in zip(tipos or [], nombres or []) if t == OBJ_AREA]
    return barras, areas


def grupos():
    """Los grupos del modelo, con cuántas barras y áreas tiene cada uno."""
    modelo, ruta, nombre = _modelo_guardado()
    _, nombres, ret = modelo.GroupDef.GetNameList()
    if ret != 0:
        raise ErrorPuente(502, "SAP2000 no entregó la lista de grupos.")
    lista = []
    for g in nombres or []:
        barras, areas = _asignados(modelo, g)
        lista.append({"nombre": str(g), "barras": len(barras), "areas": len(areas)})
    return {"modelo": nombre, "ruta": ruta, "grupos": lista}


def _cargas_area_a_barras(modelo, area, patron):
    r = modelo.AreaObj.GetLoadUniformToFrame(area)
    n, _, pats, _, dirs, vals, dists = r[:7]
    return [
        {"valor": float(v), "dir": int(d), "dist": int(t)}
        for p, d, v, t in zip(pats or [], dirs or [], vals or [], dists or [])
        if p == patron
    ][: n or 0]


def _cargas_barra(modelo, barra, patron):
    r = modelo.FrameObj.GetLoadDistributed(barra)
    n, _, pats, tipos, _, dirs, rd1, rd2, _, _, v1, v2 = r[:12]
    salida = []
    for i in range(n or 0):
        if pats[i] != patron:
            continue
        uniforme = abs(v1[i] - v2[i]) < 1e-9 and abs(rd1[i]) < 1e-9 and abs(rd2[i] - 1) < 1e-9
        salida.append({"valor": float(v1[i]), "dir": int(dirs[i]), "uniforme": uniforme, "fuerza": tipos[i] == 1})
    return salida


def leer_aplicaciones(cuerpo):
    """Lo que cada patrón tiene HOY sobre los objetos de su grupo. Solo lee.

    `aplicaciones`: [{id, patron, tipo: 'area-a-barras' | 'barra-distribuida', grupo}].
    Por cada una devuelve cuántos objetos del tipo que corresponde tiene el
    grupo y la carga que ese patrón les pone, agrupada por valor.
    """
    pedidas = cuerpo.get("aplicaciones")
    if not isinstance(pedidas, list):
        raise ErrorPuente(400, "Faltan las aplicaciones.")
    modelo, ruta, nombre = _modelo_guardado()
    existentes = set(modelo.GroupDef.GetNameList()[1] or [])
    resultado = []
    with _EnKnM(modelo):
        for a in pedidas:
            ident, patron, tipo, grupo = a.get("id"), a.get("patron"), a.get("tipo"), a.get("grupo")
            if grupo not in existentes:
                resultado.append({"id": ident, "error": f"No hay un grupo «{grupo}» en el modelo."})
                continue
            barras, areas = _asignados(modelo, grupo)
            objetos = areas if tipo == "area-a-barras" else barras
            leer = _cargas_area_a_barras if tipo == "area-a-barras" else _cargas_barra
            conteo = {}
            firmas = {}
            sin_carga = 0
            for o in objetos:
                cargas = leer(modelo, o, patron)
                if not cargas:
                    sin_carga += 1
                claves = sorted(json.dumps(c, sort_keys=True) for c in cargas)
                for clave in claves:
                    conteo[clave] = conteo.get(clave, 0) + 1
                # La firma de un objeto: TODAS sus cargas de este patrón, juntas.
                # El conteo dice cuántas veces aparece cada carga en el grupo, no
                # quién la lleva; con la firma, un objeto con dos cargas de 2 y
                # otro con dos de 1 ya no se confunden con dos objetos de 2 + 1.
                firma = json.dumps(claves)
                firmas[firma] = firmas.get(firma, 0) + 1
            resultado.append({
                "id": ident,
                "objetos": len(objetos),
                "sinCarga": sin_carga,
                "cargas": [{**json.loads(k), "n": v} for k, v in conteo.items()],
                "firmas": [{"cargas": [json.loads(c) for c in json.loads(f)], "n": v} for f, v in firmas.items()],
            })
    return {"modelo": nombre, "ruta": ruta, "aplicaciones": resultado}


# ── Todas las cargas asignadas, por patrón ───────────────────────────────────

GRUPO = 1  # eItemType.Group: con el grupo "ALL", todos los objetos del modelo
TODO = "ALL"
COMPONENTES_NUDO = ("F1", "F2", "F3", "M1", "M2", "M3")


def _num(v):
    """Un float estable para agrupar: 0,3 y 0,30000000000000004 son la misma carga."""
    return float(f"{float(v):.9g}")


def _leer(llamada, que):
    r = llamada(TODO, ItemType=GRUPO)
    if r[-1] != 0:
        raise ErrorPuente(502, f"SAP2000 no entregó {que}.")
    return r


def _cargas_del_modelo(modelo):
    """Cada carga asignada, una por objeto, en kN-m-C.

    Cubre lo que un modelo de naves usa: distribuida y puntual en barras,
    uniforme en áreas, uniforme de área repartida a barras, fuerzas en nudos y
    temperatura en barras. Lo que no está aquí (presión de viento automática,
    gravedad, tensiones...) no se lee, y el panel lo dice.
    """
    salida = []

    # [n, barra, patrón, tipo, csys, dir, rd1, rd2, d1, d2, v1, v2, ret]
    n, objs, pats, tipos, csys, dirs, rd1, rd2, _, _, v1, v2, _ = _leer(
        modelo.FrameObj.GetLoadDistributed, "las cargas distribuidas en barras")
    for i in range(n):
        uniforme = abs(v1[i] - v2[i]) < 1e-9 and abs(rd1[i]) < 1e-9 and abs(rd2[i] - 1) < 1e-9
        salida.append({
            "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "barra-distribuida",
            "momento": tipos[i] == 2, "csys": str(csys[i]), "dir": int(dirs[i]),
            "valor": _num(v1[i]),
            **({} if uniforme else {"valor2": _num(v2[i]), "desde": _num(rd1[i]), "hasta": _num(rd2[i])}),
        })

    # [n, barra, patrón, tipo, csys, dir, rel, dist, valor, ret]
    n, objs, pats, tipos, csys, dirs, rel, _, val, _ = _leer(
        modelo.FrameObj.GetLoadPoint, "las cargas puntuales en barras")
    for i in range(n):
        salida.append({
            "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "barra-puntual",
            "momento": tipos[i] == 2, "csys": str(csys[i]), "dir": int(dirs[i]),
            "valor": _num(val[i]), "en": _num(rel[i]),
        })

    # [n, área, patrón, csys, dir, valor, ret]
    n, objs, pats, csys, dirs, val, _ = _leer(modelo.AreaObj.GetLoadUniform, "las cargas uniformes en áreas")
    for i in range(n):
        salida.append({
            "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "area-uniforme",
            "csys": str(csys[i]), "dir": int(dirs[i]), "valor": _num(val[i]),
        })

    # [n, área, patrón, csys, dir, valor, distribución, ret]
    n, objs, pats, csys, dirs, val, dist, _ = _leer(
        modelo.AreaObj.GetLoadUniformToFrame, "las cargas de área repartidas a barras")
    for i in range(n):
        salida.append({
            "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "area-a-barras",
            "csys": str(csys[i]), "dir": int(dirs[i]), "valor": _num(val[i]), "dist": int(dist[i]),
        })

    # [n, nudo, patrón, paso, csys, F1, F2, F3, M1, M2, M3, ret]: una entrada por
    # componente no nula, que es como se lee y como se justifica.
    r = _leer(modelo.PointObj.GetLoadForce, "las fuerzas en nudos")
    n, objs, pats, _, csys = r[:5]
    comps = r[5:11]
    for i in range(n):
        for nombre, c in zip(COMPONENTES_NUDO, comps):
            if abs(c[i]) > 0:
                salida.append({
                    "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "nudo",
                    "csys": str(csys[i]), "componente": nombre, "valor": _num(c[i]),
                })

    # [n, barra, patrón, tipo, valor, patrón de nudos, ret]
    n, objs, pats, tipos, val, _, _ = _leer(modelo.FrameObj.GetLoadTemperature, "las temperaturas en barras")
    for i in range(n):
        salida.append({
            "patron": str(pats[i]), "objeto": str(objs[i]), "clase": "barra-temperatura",
            "tipoTemperatura": int(tipos[i]), "valor": _num(val[i]),
        })
    return salida


def cargas():
    """Las cargas asignadas en el modelo, por patrón, agrupadas por valor. Solo lee.

    Dos objetos con la misma carga (clase, dirección, valor...) son UNA fila con
    `n` = cuántos la llevan: «SDL_CUB: 0,5 kN/m² en 33 áreas» es lo que se
    justifica, no cada área por separado. Las unidades son kN, m y °C.
    """
    modelo, ruta, nombre = _modelo_guardado()
    with _EnKnM(modelo):
        todas = _cargas_del_modelo(modelo)
    grupos = {}
    for c in todas:
        firma = json.dumps({k: v for k, v in c.items() if k != "objeto"}, sort_keys=True)
        grupos.setdefault(firma, []).append(c["objeto"])
    lista = [{**json.loads(f), "n": len(objs)} for f, objs in grupos.items()]
    lista.sort(key=lambda c: (c["patron"], c["clase"], -abs(c["valor"])))
    return {"modelo": nombre, "ruta": ruta, "cargas": lista}


# ── Espectro de respuesta ────────────────────────────────────────────────────

# eModalComb: cómo combina los modos cada caso.
COMBINACIONES = {1: "CQC", 2: "SRSS", 3: "Absoluta", 4: "GMC", 5: "NRC 10 %", 6: "Doble suma"}


def espectro():
    """Los casos de espectro de respuesta y las funciones que usan. Solo lee.

    Un caso es de espectro si `ResponseSpectrum.GetLoads` lo reconoce: la lista
    de casos no se filtra por tipo en todas las versiones de la API. Los factores
    de escala salen en las unidades de longitud de trabajo, así que se leen en
    kN-m: m/s².
    """
    modelo, ruta, nombre = _modelo_guardado()
    casos, usadas = [], []
    with _EnKnM(modelo):
        _, nombres, ret = modelo.LoadCases.GetNameList()
        if ret != 0:
            raise ErrorPuente(502, "SAP2000 no entregó la lista de casos de carga.")
        rs = modelo.LoadCases.ResponseSpectrum
        for c in nombres or []:
            n, dirs, funcs, sfs, csys, angs, ret = rs.GetLoads(c)
            if ret != 0:
                continue
            modal, _ = rs.GetModalCase(c)
            comb = rs.GetModalComb_1(c)
            amort, _ = rs.GetDampConstant(c)
            casos.append({
                "nombre": str(c),
                "modal": str(modal or ""),
                "combinacion": COMBINACIONES.get(int(comb[0]), f"código {comb[0]}"),
                "amortiguamiento": _num(amort),
                "cargas": [
                    {"dir": str(dirs[i]), "funcion": str(funcs[i]), "sf": _num(sfs[i]),
                     "csys": str(csys[i]), "angulo": _num(angs[i])}
                    for i in range(n)
                ],
            })
            for f in funcs or []:
                if str(f) not in usadas:
                    usadas.append(str(f))
        funciones = []
        for f in usadas:
            n, periodos, valores, ret = modelo.Func.GetValues(f)
            if ret != 0:
                raise ErrorPuente(502, f"SAP2000 no entregó los puntos de la función «{f}».")
            funciones.append({"nombre": f, "puntos": [[_num(t), _num(v)] for t, v in zip(periodos, valores)]})
    return {"modelo": nombre, "ruta": ruta, "casos": casos, "funciones": funciones}


# ── Load Cases, masa sísmica y resumen ───────────────────────────────────────

# eAnalysisCaseStatus: 1 sin analizar, 2 no pudo empezar, 3 no terminó, 4 terminado.
ESTADOS = {1: "sin-analizar", 2: "no-empezo", 3: "incompleto", 4: "analizado"}


def _estados(modelo):
    """Nombre de caso -> su estado de análisis. Un fallo no es un dato: se dice."""
    n, nombres, estados, ret = modelo.Analyze.GetCaseStatus()
    if ret != 0:
        raise ErrorPuente(502, "SAP2000 no entregó el estado del análisis.")
    return {str(c): ESTADOS.get(int(e), f"código {e}") for c, e in zip(nombres or [], estados or [])}


def casos():
    """Los Load Cases: tipo, estado del análisis y lo que cada tipo detalla. Solo lee.

    Un estático lineal trae sus patrones con su factor (EV = 0,185 × DEAD); un
    modal, cuántos modos; un espectro, solo el tipo, porque su detalle lo trae
    `/espectro`. Los demás tipos se listan sin detalle, y el panel lo dice.
    """
    modelo, ruta, nombre = _modelo_guardado()
    tipos = _enum("eLoadCaseType_")
    _, nombres, ret = modelo.LoadCases.GetNameList()
    if ret != 0:
        raise ErrorPuente(502, "SAP2000 no entregó la lista de casos de carga.")
    estados = _estados(modelo)
    lista = []
    for c in nombres or []:
        r = modelo.LoadCases.GetTypeOAPI_1(c)
        if r[-1] != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó el tipo del caso «{c}».")
        tipo, subtipo = tipos.get(r[0], f"código {r[0]}"), int(r[1])
        caso = {"nombre": str(c), "tipo": tipo, "estado": estados.get(str(c), "sin-analizar")}
        if tipo == "LinearStatic":
            n, clases, pats, sfs, ret = modelo.LoadCases.StaticLinear.GetLoads(c)
            if ret != 0:
                raise ErrorPuente(502, f"SAP2000 no entregó las cargas del caso «{c}».")
            caso["cargas"] = [
                {"tipo": str(clases[i]), "nombre": str(pats[i]), "sf": _num(sfs[i])} for i in range(n)
            ]
        elif tipo == "Modal":
            # eModalSubType: 1 eigenvectores, 2 Ritz.
            api = modelo.LoadCases.ModalRitz if subtipo == 2 else modelo.LoadCases.ModalEigen
            maximo, minimo, ret = api.GetNumberModes(c)
            if ret == 0:
                caso["modal"] = "Ritz" if subtipo == 2 else "Eigen"
                caso["modos"] = {"max": int(maximo), "min": int(minimo)}
        lista.append(caso)
    return {"modelo": nombre, "ruta": ruta, "casos": lista}


def masa():
    """Las fuentes de masa: de dónde toma la masa el modelo y con qué factores. Solo lee."""
    modelo, ruta, nombre = _modelo_guardado()
    sm = modelo.SourceMass
    _, nombres, ret = sm.GetNameList()
    if ret != 0:
        raise ErrorPuente(502, "SAP2000 no entregó las fuentes de masa.")
    por_defecto, _ = sm.GetDefault()
    fuentes = []
    for f in nombres or []:
        elem, masas, cargas_, _, n, pats, sfs, ret = sm.GetMassSource(f)
        if ret != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó la fuente de masa «{f}».")
        fuentes.append({
            "nombre": str(f),
            "porDefecto": str(f) == str(por_defecto),
            "deElementos": bool(elem),
            "deMasas": bool(masas),
            "deCargas": bool(cargas_),
            "cargas": [{"patron": str(pats[i]), "sf": _num(sfs[i])} for i in range(n or 0)],
        })
    return {"modelo": nombre, "ruta": ruta, "fuentes": fuentes}


def _nombres(api, que):
    _, nombres, ret = api.GetNameList()
    if ret != 0:
        raise ErrorPuente(502, f"SAP2000 no entregó {que}.")
    return [str(n) for n in nombres or []]


def resumen():
    """Lo que hay en el modelo, en números: objetos, grupos, materiales, secciones. Solo lee."""
    modelo, ruta, nombre = _modelo_guardado()
    unidades = _enum("eUnits_").get(modelo.GetPresentUnits(), "")
    tipos_mat = _enum("eMatType_")
    materiales = []
    for m in _nombres(modelo.PropMaterial, "la lista de materiales"):
        r = modelo.PropMaterial.GetTypeOAPI(m)
        materiales.append({"nombre": m, "tipo": tipos_mat.get(r[0], "") if r[-1] == 0 else ""})
    estados = _estados(modelo)
    return {
        "modelo": nombre,
        "ruta": ruta,
        "unidades": unidades,
        "nudos": int(modelo.PointObj.Count()),
        "barras": int(modelo.FrameObj.Count()),
        "areas": int(modelo.AreaObj.Count()),
        "links": int(modelo.LinkObj.Count()),
        "grupos": grupos()["grupos"],
        "materiales": materiales,
        "seccionesBarra": _nombres(modelo.PropFrame, "las secciones de barra"),
        "seccionesArea": _nombres(modelo.PropArea, "las secciones de área"),
        "patrones": len(_nombres(modelo.LoadPatterns, "la lista de Load Patterns")),
        "casos": len(estados),
        "analizados": sum(1 for e in estados.values() if e == "analizado"),
        "combinaciones": len(_nombres(modelo.RespCombo, "la lista de combinaciones")),
    }


# ── Combinaciones ────────────────────────────────────────────────────────────

# RespCombo.GetTypeOAPI: 0 suma lineal, 1 envolvente, 2 suma absoluta, 3 SRSS, 4 rango.
TIPOS_COMBINACION = {0: "Lineal", 1: "Envolvente", 2: "Absoluta", 3: "SRSS", 4: "Rango"}


def combinaciones():
    """Las combinaciones del modelo: tipo y términos con su factor. Solo lee.

    Un término es un caso o una combinación (`eCNameType`: 0 caso, 1 combinación):
    en un modelo real se anidan —una envolvente de las posiciones del puente grúa
    entra entera en cada combinación sísmica—. Los factores no tienen unidades.
    """
    modelo, ruta, nombre = _modelo_guardado()
    lista = []
    for c in _nombres(modelo.RespCombo, "la lista de combinaciones"):
        tipo, ret = modelo.RespCombo.GetTypeOAPI(c)
        if ret != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó el tipo de la combinación «{c}».")
        n, clases, nombres, _, sfs, ret = modelo.RespCombo.GetCaseList_1(c)
        if ret != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó los términos de la combinación «{c}».")
        lista.append({
            "nombre": c,
            "tipo": TIPOS_COMBINACION.get(int(tipo), f"código {tipo}"),
            "terminos": [
                {"clase": "combinacion" if int(clases[i]) == 1 else "caso", "nombre": str(nombres[i]), "sf": _num(sfs[i])}
                for i in range(n or 0)
            ],
        })
    return {"modelo": nombre, "ruta": ruta, "combinaciones": lista}


# ── Resultados: el modal ─────────────────────────────────────────────────────


class _SalidaSolo:
    """Deja seleccionado para salida solo un caso, y devuelve la selección que había.

    Los resultados de la API salen de los casos y combinaciones SELECCIONADOS en
    la pantalla de SAP. Cambiarle la selección al usuario sin devolvérsela le
    cambiaría lo que ve en sus tablas, igual que las unidades (`_EnKnM`).
    """

    def __init__(self, modelo, caso):
        self.modelo = modelo
        self.caso = caso

    def __enter__(self):
        setup = self.modelo.Results.Setup
        self.casos = {c: bool(setup.GetCaseSelectedForOutput(c)[0])
                      for c in _nombres(self.modelo.LoadCases, "la lista de casos")}
        self.combos = {c: bool(setup.GetComboSelectedForOutput(c)[0])
                       for c in _nombres(self.modelo.RespCombo, "la lista de combinaciones")}
        setup.DeselectAllCasesAndCombosForOutput()
        if setup.SetCaseSelectedForOutput(self.caso) != 0:
            raise ErrorPuente(502, f"SAP2000 no dejó seleccionar «{self.caso}» para leer sus resultados.")
        return self.modelo

    def __exit__(self, *_):
        setup = self.modelo.Results.Setup
        setup.DeselectAllCasesAndCombosForOutput()
        for c, sel in self.casos.items():
            if sel:
                setup.SetCaseSelectedForOutput(c)
        for c, sel in self.combos.items():
            if sel:
                setup.SetComboSelectedForOutput(c)


def modal(caso):
    """Periodos y masas participantes de un caso modal. Solo lee.

    Exige el caso analizado: un modelo sin analizar devuelve ceros, no vacío, y
    un cero parece un dato (`docs/rumbo.md`, etapa 2). La respuesta lleva la
    fecha del `.sdb`, que es el sello de la lectura.
    """
    modelo, ruta, nombre = _modelo_guardado()
    if not caso:
        raise ErrorPuente(400, "Falta el caso modal (?caso=MODAL).")
    estado = _estados(modelo).get(caso)
    if estado is None:
        raise ErrorPuente(404, f"No hay un caso «{caso}» en el modelo.")
    if estado != "analizado":
        raise ErrorPuente(409, f"El caso {caso} no está analizado. Analízalo en SAP2000 y vuelve a leer.")
    with _SalidaSolo(modelo, caso):
        r = modelo.Results.ModalPeriod()
        if r[-1] != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó los periodos de {caso}.")
        n, casos, _, pasos, periodos, frecuencias = r[:6]
        m = modelo.Results.ModalParticipatingMassRatios()
        if m[-1] != 0:
            raise ErrorPuente(502, f"SAP2000 no entregó las masas participantes de {caso}.")
        _, _, _, pasos_m, _, ux, uy, uz, sux, suy, suz, _, _, rz = m[:14]
    masas = {int(pasos_m[i]): i for i in range(len(pasos_m or []))}
    modos = []
    for i in range(n or 0):
        if str(casos[i]) != caso:
            continue
        k = int(pasos[i])
        j = masas.get(k)
        modos.append({
            "n": k, "T": _num(periodos[i]), "f": _num(frecuencias[i]),
            **({
                "ux": _num(ux[j]), "uy": _num(uy[j]), "uz": _num(uz[j]), "rz": _num(rz[j]),
                "sux": _num(sux[j]), "suy": _num(suy[j]), "suz": _num(suz[j]),
            } if j is not None else {}),
        })
    return {"modelo": nombre, "ruta": ruta, "modificado": _modificado(ruta), "caso": caso, "modos": modos}


class Manejador(BaseHTTPRequestHandler):
    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _rechazo(self):
        """Por qué no se atiende esta petición, o `None`.

        La IP de origen no basta: cualquier página abierta en el navegador de esta
        máquina también llega desde 127.0.0.1. Tres filtros más:

        - `Host` local: una página que rebinde su dominio a 127.0.0.1 manda su
          propio nombre en `Host`. El proxy de Vite va con `changeOrigin: false`,
          así que lo legítimo es `localhost:<puerto de Vite>`.
        - `Origin`, si viene, local: es lo que el navegador pone en un POST de
          otra página.
        - POST solo con `application/json`: una página ajena no puede mandarlo sin
          una consulta previa (preflight) que el puente no contesta, así que el
          navegador ni siquiera envía la petición.
        """
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return "El puente de SAP solo atiende a esta máquina."
        host = urlsplit(f"//{self.headers.get('Host', '')}").hostname
        if host not in LOCALES:
            return "El puente de SAP solo atiende peticiones dirigidas a localhost."
        origen = self.headers.get("Origin")
        if origen and urlsplit(origen).hostname not in LOCALES:
            return "El puente de SAP no atiende a otras páginas."
        if self.command == "POST":
            tipo = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if tipo != "application/json":
                return "El puente de SAP solo acepta JSON."
        return None

    def _atender(self, rutas):
        motivo = self._rechazo()
        if motivo:
            # Se lee el cuerpo antes de responder: cerrar con bytes sin leer hace
            # que Windows corte la conexión, y el cliente ve un error de red en
            # vez del motivo.
            largo = int(self.headers.get("Content-Length") or 0)
            if 0 < largo <= 1 << 20:
                self.rfile.read(largo)
            return self._responder(403, {"motivo": motivo})
        ruta = self.path.split("?")[0].rstrip("/")
        accion = rutas.get(ruta)
        if accion is None:
            return self._responder(404, {"motivo": f"{self.command} {ruta} no existe."})
        try:
            return self._responder(200, accion())
        except ErrorPuente as e:
            return self._responder(e.codigo, {"motivo": e.motivo})
        except Exception as e:  # noqa: BLE001
            return self._responder(500, {"motivo": f"El puente falló: {e}"})

    def do_GET(self):  # noqa: N802
        self._atender({
            "/salud": lambda: {"ok": True},
            "/patrones": patrones,
            "/grupos": grupos,
            "/cargas": cargas,
            "/espectro": espectro,
            "/casos": casos,
            "/masa": masa,
            "/resumen": resumen,
            "/combinaciones": combinaciones,
            "/modal": lambda: modal(self._query().get("caso", "")),
        })

    def _query(self):
        """Los parámetros de la URL, uno por nombre: `?caso=MODAL` → {caso: MODAL}."""
        from urllib.parse import parse_qs

        return {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}

    def _cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if not largo:
            return {}
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except ValueError as e:
            raise ErrorPuente(400, "El cuerpo no es JSON.") from e

    def do_POST(self):  # noqa: N802
        # Ninguna de estas escribe en el modelo: ver la cabecera.
        self._atender({
            "/conectar": conectar,
            "/aplicaciones/leer": lambda: leer_aplicaciones(self._cuerpo()),
        })

    def log_message(self, formato, *args):
        print("[puente-sap]", formato % args)


class ServidorExclusivo(HTTPServer):
    """Un puerto, un puente.

    `HTTPServer` activa SO_REUSEADDR, y en Windows eso deja que un SEGUNDO puente
    escuche en el mismo puerto sin error: las peticiones siguen llegando al
    primero, que puede ser una versión vieja, y nadie se entera. Pasó en la
    primera prueba. Con SO_EXCLUSIVEADDRUSE el segundo arranque falla y lo dice.
    """

    allow_reuse_address = False

    def server_bind(self):
        import socket

        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    # Un solo hilo a propósito: COM se inicializa en el hilo principal y todas
    # las llamadas a SAP2000 salen de él, una detrás de otra.
    try:
        servidor = ServidorExclusivo(("127.0.0.1", PUERTO), Manejador)
    except OSError:
        raise SystemExit(
            f"El puerto {PUERTO} está ocupado: seguramente ya hay un puente corriendo. "
            "Ciérralo antes de arrancar otro.")
    print(f"Puente de SAP2000 en http://127.0.0.1:{PUERTO} (Ctrl+C para cerrar)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
