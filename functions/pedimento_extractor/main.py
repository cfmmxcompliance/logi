import base64
import os
import tempfile
import json
from firebase_functions import https_fn
from firebase_admin import initialize_app

import extractor

initialize_app()

@https_fn.on_call(memory=2048, timeout_sec=120)
def extract_pedimento_partidas(req: https_fn.CallableRequest) -> dict:
    """
    Cloud Function que recibe un PDF en base64, lo guarda en /tmp,
    extrae sus partidas usando el extractor determinista, y devuelve el resultado.
    """
    base64_data = req.data.get("pdf_base64")
    if not base64_data:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="No pdf_base64 provided in request."
        )

    # 1. Decodificar el PDF a un archivo temporal
    pdf_bytes = base64.b64decode(base64_data)
    fd, temp_path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, 'wb') as f:
        f.write(pdf_bytes)

    try:
        # 2. Llamar al extractor (que usa pdfplumber)
        partidas = extractor.extraer(temp_path)
        cabecera = extractor.encabezado(temp_path)
        conciliacion = extractor.conciliar(partidas, cabecera)

        # 3. Retornar el resultado estructurado
        return {
            "partidas": partidas,
            "conciliacion": conciliacion,
            "cabecera": cabecera
        }
    except Exception as e:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=str(e)
        )
    finally:
        # 4. Limpiar el archivo temporal
        if os.path.exists(temp_path):
            os.remove(temp_path)
