"""El puente de Struct_Flow con SAP2000: un servicio local, solo para esta máquina.

    npm run puente-sap          (o: python puente-sap/puente.py)

Escucha en 127.0.0.1:8789 y la aplicación le habla por `/sap-api` (el proxy de
Vite). Es de Flow y de nadie más: no importa nada de Struct_Harness, así la
aplicación funciona con SAP2000 sin que el asistente esté corriendo
(`docs/rumbo.md`, «Flow es la aplicación; el Harness, el asistente que la usa»).

POR AHORA SOLO SE ENGANCHA Y LEE. Nunca lanza SAP2000, nunca abre una segunda
instancia, nunca guarda ni analiza: se engancha al SAP2000 que el usuario ya
tiene abierto y le pregunta el nombre del modelo. Lo demás llega paso a paso.

Rutas:
    GET  /salud      -> {ok}
    POST /conectar   -> {modelo, ruta, version}   o 409 con {motivo}
    GET  /patrones   -> {modelo, ruta, patrones: [{nombre, tipo, pesoPropio}]}

Una sola instancia viva, como en el harness: con dos SAP2000.exe, una colgada
mantiene bloqueados los archivos y no se sabe a cuál se engancharía.
"""

import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PUERTO = 8789
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


def conectar():
    """Se engancha al SAP2000 abierto y devuelve lo que se sabe del modelo."""
    modelo = _modelo_abierto()
    ruta, nombre = _nombre_modelo(modelo)
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
    modelo = _modelo_abierto()
    ruta, nombre = _nombre_modelo(modelo)
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


class Manejador(BaseHTTPRequestHandler):
    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _atender(self, rutas):
        # Solo esta máquina: el modelo es de quien está sentado frente a ella.
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return self._responder(403, {"motivo": "El puente de SAP solo atiende a esta máquina."})
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
        self._atender({"/salud": lambda: {"ok": True}, "/patrones": patrones})

    def do_POST(self):  # noqa: N802
        self._atender({"/conectar": conectar})

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
