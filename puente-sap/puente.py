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
    POST /conectar   -> {modelo, ruta, version}   o 409 con {motivo}
    GET  /patrones   -> {modelo, ruta, patrones: [{nombre, tipo, pesoPropio}]}
    GET  /grupos     -> {modelo, ruta, grupos: [{nombre, barras, areas}]}
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


def conectar():
    """Se engancha al SAP2000 abierto y devuelve lo que se sabe del modelo."""
    modelo, ruta, nombre = _modelo_guardado()
    version = ""
    try:
        # Devuelve (version, numero, ret); basta con el texto.
        version = str(modelo.GetVersion()[0])
    except Exception:  # noqa: BLE001 — la versión es un dato de cortesía
        pass
    return {"modelo": nombre, "ruta": ruta, "version": version}


def _tipos_de_patron():
    """Código de `eLoadPatternType` -> su nombre en la API (`Dead`, `Wind`…).

    Sale del enum que comtypes generó de la biblioteca de tipos de SAP2000, no
    de una tabla escrita a mano: una versión de SAP que agregue tipos los trae
    sola.
    """
    import comtypes.gen.SAP2000v1 as api

    prefijo = "eLoadPatternType_"
    return {getattr(api, k): k[len(prefijo):] for k in dir(api) if k.startswith(prefijo)}


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
        self._atender({"/salud": lambda: {"ok": True}, "/patrones": patrones, "/grupos": grupos})

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
