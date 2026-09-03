#!/usr/bin/env python3
"""
Extractor determinista de partidas de pedimento (capa A).

No usa regex sobre texto plano: asigna cada palabra a una columna segun su
coordenada x, usando como referencia la fila de encabezado del propio PDF.
Esto lo hace independiente del orden de lectura, que es lo que se rompe en
pedimentos largos.

Probado sobre 3 formatos de impresion distintos:
  - Crystal Reports        (patente 1925)
  - Microsoft Print To PDF (Grupo Border, proforma)
  - PDF24 / Ghostscript    (Grupo Border, normal)

Uso:  python3 extractor_pedimentos.py archivo1.pdf archivo2.pdf ...
      python3 extractor_pedimentos.py --json archivo.pdf > partidas.json
"""

import json
import re
import sys

import pdfplumber

FRACCION_8 = re.compile(r"^\d{8}$")
DEC_5      = re.compile(r"^\d[\d,]*\.\d{5}$")
DEC_3      = re.compile(r"^\d[\d,]*\.\d{3}$")
NUMERICO   = re.compile(r"^\d[\d,]*(\.\d+)?$")
FACTURA    = re.compile(r"^\d{2}CFTT")

TOL_LINEA = 3          # puntos: agrupacion vertical de palabras en una fila
TOL_BANDA = 35         # puntos: holgura lateral al asignar columna


# --------------------------------------------------------------------------
# Lectura
# --------------------------------------------------------------------------

def cargar(path):
    """Devuelve (palabras, filas). Cada fila es una lista de palabras
    ordenadas por x, agrupadas por su coordenada vertical."""
    palabras = []
    with pdfplumber.open(path) as pdf:
        for i, pagina in enumerate(pdf.pages):
            for w in pagina.extract_words():
                w["page"] = i + 1
                palabras.append(w)

    agrupadas = {}
    for w in palabras:
        clave = (w["page"], round(w["top"] / TOL_LINEA))
        agrupadas.setdefault(clave, []).append(w)

    filas = [
        (clave, sorted(ws, key=lambda w: w["x0"]))
        for clave, ws in sorted(agrupadas.items())
    ]
    return palabras, filas


def bandas_de_columna(filas):
    """Deriva las bandas x de cada columna leyendo el encabezado del PDF.
    No hay coordenadas hardcodeadas: cada agencia aduanal imprime distinto
    y el encabezado es la referencia que siempre viaja con el documento."""
    b = {}
    for _, fila in filas:
        textos = [w["text"] for w in fila]

        if textos and textos[0] == "FRACCION" and "SUBD/" in textos and "FRACCION" not in b:
            b["FRACCION"] = (fila[0]["x0"], fila[0]["x1"])
            for w in fila:
                if w["text"] == "SUBD/":
                    b["SUBD"] = (w["x0"], w["x1"])
                elif w["text"] in ("VINC.", "VINC"):
                    b["VINC"] = (w["x0"], w["x1"])
                elif w["text"] in ("MET.", "MET.VAL", "MET. VAL"):
                    b["MET_VAL"] = (w["x0"], w["x1"])
                elif w["text"] == "UMC":
                    b["UMC_CLAVE"] = (w["x0"], w["x1"])
                elif w["text"] == "UMT":
                    b["UMT_CLAVE"] = (w["x0"], w["x1"])
                elif w["text"] == "P.V/C":
                    b["PVC"] = (w["x0"], w["x1"])
                elif w["text"] == "P.O/D":
                    b["POD"] = (w["x0"], w["x1"])

        unido = " ".join(textos)
        if "DESCRIPCIÓN" in unido and "RENGLONES" in unido:
            for w in fila:
                if w["text"] in ("CON.", "CON"):
                    b["CON"] = (w["x0"], w["x1"])
                elif w["text"] == "TASA":
                    b["TASA"] = (w["x0"], w["x1"])
                elif w["text"] in ("T.T.", "T.T"):
                    b["TT"] = (w["x0"], w["x1"])
                elif w["text"] in ("F.P.", "F.P"):
                    b["FP"] = (w["x0"], w["x1"])
                elif w["text"] == "IMPORTE":
                    b["IMPORTE_COL"] = (w["x0"], w["x1"])

        if "ADU/USD" in unido:
            for w in fila:
                if w["text"] in ("VAL.ADU/USD", "ADU/USD"):
                    b["VAL_ADU"] = (w["x0"], w["x1"])
                elif w["text"] == "IMP.PRECIO":
                    b["PRECIO_PAG"] = (w["x0"], w["x1"])
                elif w["text"] == "PRECIO":
                    b.setdefault("PRECIO_UNIT", (w["x0"], w["x1"]))
                elif w["text"] == "VAL." and "AGREG." in unido:
                    b["VAL_AGREG"] = (w["x0"], w["x1"])
                elif w["text"] == "AGREG.":
                    b["VAL_AGREG"] = (w["x0"], w["x1"])

        if "FRACCION" in b and "VAL_ADU" in b and "CON" in b:
            break
    return b


def en_banda(w, banda, tol=TOL_BANDA):
    return banda is not None and (banda[0] - tol) <= w["x0"] <= (banda[1] + tol)


# --------------------------------------------------------------------------
# Segmentacion en partidas
# --------------------------------------------------------------------------

def extraer(path):
    _, filas = cargar(path)
    b = bandas_de_columna(filas)
    if "FRACCION" not in b:
        return []

    fx0 = b["FRACCION"][0]
    partidas, actual = [], None

    for clave, fila in filas:
        # ancla: fraccion de 8 digitos DENTRO de la banda de la columna FRACCION.
        # Un numero de parte de 8 digitos en otra posicion no dispara el ancla.
        ancla = next(
            (w for w in fila
             if FRACCION_8.match(w["text"]) and fx0 - 6 <= w["x0"] <= fx0 + 10),
            None,
        )
        if ancla:
            if actual:
                partidas.append(actual)
            secuencia = next(
                (w["text"] for w in fila
                 if w["x1"] <= ancla["x0"] - 2 and re.match(r"^\d{1,4}$", w["text"])),
                None,
            )
            actual = {
                "pagina": clave[0],
                "fraccion": ancla["text"],
                "secuencia": secuencia,
                "_filas": [fila],
            }
        elif actual is not None:
            actual["_filas"].append(fila)

    if actual:
        partidas.append(actual)

    for p in partidas:
        _completar(p, b, fx0)
        del p["_filas"]

    return partidas


APENDICE_7 = {
    "1": "KILO", "2": "GRAMO", "3": "METRO LINEAL", "4": "METRO CUADRADO",
    "5": "METRO CUBICO", "6": "PIEZA", "7": "CABEZA", "8": "LITRO",
    "9": "PAR", "10": "KILOWATT", "11": "MILLAR", "12": "JUEGO",
    "13": "KILOWATT/HORA", "14": "TONELADA", "15": "BARRIL", "16": "GRAMO NETO",
    "17": "DECENAS", "18": "CIENTOS", "19": "DOCENAS", "20": "CAJA",
    "21": "BOTELLA", "22": "CARGA"
}

CONTRIBUCIONES_VALIDAS = {"IGI", "IGE", "IVA", "IEPS", "DTA", "PRV", "CNT", "ECI", "ISAN", "ITV", "IGIE"}

def _completar(p, b, fx0):
    filas = p["_filas"]
    tokens = [w["text"] for fila in filas for w in fila]

    # Crystal Reports imprime la secuencia en la linea de la descripcion,
    # no en la linea de la fraccion.
    if p["secuencia"] is None:
        for fila in filas[1:3]:
            s = next(
                (w["text"] for w in fila
                 if w["x0"] < fx0 - 8 and re.match(r"^\d{1,4}$", w["text"])),
                None,
            )
            if s:
                p["secuencia"] = s
                break

    ancla = filas[0]
    p["subdivision"] = next(
        (w["text"] for w in ancla if en_banda(w, b.get("SUBD"), 12)), None
    )
    p["vinc"] = next(
        (w["text"] for w in ancla if en_banda(w, b.get("VINC"), 8)), None
    )
    p["metodo_val"] = next(
        (w["text"] for w in ancla if en_banda(w, b.get("MET_VAL"), 8)), None
    )
    
    clave_umc_raw = next(
        (w["text"] for w in ancla if en_banda(w, b.get("UMC_CLAVE"), 8) and re.match(r"^\d{1,2}$", w["text"])), None
    )
    p["clave_umc"] = clave_umc_raw
    p["umc_desc"] = APENDICE_7.get(clave_umc_raw) if clave_umc_raw else None
    
    clave_umt_raw = next(
        (w["text"] for w in ancla if en_banda(w, b.get("UMT_CLAVE"), 8) and re.match(r"^\d{1,2}$", w["text"])), None
    )
    p["clave_umt"] = clave_umt_raw
    p["umt_desc"] = APENDICE_7.get(clave_umt_raw) if clave_umt_raw else None
    p["cantidad_umc"] = next(
        (w["text"] for w in ancla if DEC_3.match(w["text"])), None
    )
    p["cantidad_umt"] = next(
        (w["text"] for w in ancla if DEC_5.match(w["text"])), None
    )
    p["pais_vc"] = next(
        (w["text"] for w in ancla if en_banda(w, b.get("PVC"), 12)), None
    )
    p["pais_od"] = next(
        (w["text"] for w in ancla if en_banda(w, b.get("POD"), 12)), None
    )

    # Linea de valores: enteramente numerica y con un precio unitario (5 dec).
    # Se excluye la linea ancla, que tambien puede ser toda numerica.
    p["val_adu_usd"] = p["precio_pagado"] = p["precio_unitario"] = p["val_agregado"] = None
    linea_valores = next(
        (fila for fila in filas[1:]
         if any(DEC_5.match(w["text"]) for w in fila)
         and len(fila) >= 2
         and all(NUMERICO.match(w["text"]) for w in fila)),
        None,
    )
    if linea_valores:
        for w in linea_valores:
            if en_banda(w, b.get("VAL_ADU")):
                p["val_adu_usd"] = w["text"]
            elif en_banda(w, b.get("PRECIO_PAG")):
                p["precio_pagado"] = w["text"]
            elif en_banda(w, b.get("VAL_AGREG"), 15) and DEC_5.match(w["text"]):
                p["val_agregado"] = w["text"]
            elif DEC_5.match(w["text"]):
                # If we already got PRECIO_UNIT, and we get another one, it's probably VAL_AGREG 
                if b.get("PRECIO_UNIT") and en_banda(w, b.get("PRECIO_UNIT")):
                    p["precio_unitario"] = w["text"]
                elif not b.get("PRECIO_UNIT"):
                    p["precio_unitario"] = w["text"]

    p["contribuciones"] = []
    for fila in filas:
        con_tok = next((w["text"] for w in fila if w["text"] in CONTRIBUCIONES_VALIDAS), None)
        if con_tok:
            importe = next((w["text"] for w in fila if en_banda(w, b.get("IMPORTE_COL"), 15) and NUMERICO.match(w["text"])), None)
            p["contribuciones"].append({
                "con": con_tok,
                "tasa": next((w["text"] for w in fila if en_banda(w, b.get("TASA"), 10)), None),
                "tipo_tasa": next((w["text"] for w in fila if en_banda(w, b.get("TT"), 8)), None),
                "forma_pago": next((w["text"] for w in fila if en_banda(w, b.get("FP"), 8)), None),
                "importe": importe,
            })
            
    p["importe"] = None
    if p["contribuciones"]:
        p["importe"] = str(sum(float(c["importe"].replace(",","")) for c in p["contribuciones"] if c["importe"]))

    # OBSERVACIONES estructuradas
    p["numero_parte"] = None
    p["factura"] = None

    obs_idx = None
    for i, fila in enumerate(filas):
        if any(w["text"] == "OBSERVACIONES" for w in fila):
            obs_idx = i
            break

    if obs_idx is not None:
        lineas_obs = filas[obs_idx + 1:]  # filas DESPUÉS de la cabecera OBSERVACIONES
        for fila_obs in lineas_obs:
            tokens_obs = [w["text"] for w in fila_obs]
            if not tokens_obs:
                continue
            tok = " ".join(tokens_obs)
            if re.match(r"^F[\.\s]?A[\.\s:]+ORIGINAL", tok, re.IGNORECASE) or "C1" in tokens_obs or "IDENTIF." in tokens_obs:
                continue
            elif FACTURA.match(tokens_obs[0]) or re.match(r"^\d{2}CFTT", tokens_obs[0]) or tokens_obs[0].startswith("COVE"):
                p["factura"] = tokens_obs[0]
            elif p["numero_parte"] is None:
                p["numero_parte"] = tokens_obs[0]

    # Descripcion multi-linea
    p["descripcion"] = None
    desc_lines = []
    for fila in filas:
        if fila == ancla: continue
        desc_tokens = [w["text"] for w in fila if not NUMERICO.match(w["text"]) and w["x0"] < fx0]
        if desc_tokens:
            if "IDENTIF." in desc_tokens or "OBSERVACIONES" in desc_tokens:
                break
            desc_lines.append(" ".join(desc_tokens))
    if desc_lines:
        p["descripcion"] = " ".join(desc_lines)
            
    # NOM
    noms = []
    for i, t in enumerate(tokens):
        if t.startswith("NOM-") and t not in noms:
            noms.append(t)
        elif t == "EN" and i + 2 < len(tokens) and tokens[i+2].startswith("NOM") and tokens[i+2] not in noms:
            noms.append(tokens[i+2])
    p["nom_aplicable"] = ", ".join(noms) if noms else None

    # Regla 8: la fraccion real va en el campo F.A. ORIGINAL
    fa = re.search(r"F\.?A:?\s*(?:ORIGINAL\s*)?(\d{8,10})", " ".join(tokens))
    p["fa_original"] = fa.group(1) if fa else None
    
    # Permiso de Regla Octava (C1)
    p["c1"] = None
    p["permiso_r8"] = None
    for i, fila in enumerate(filas):
        tokens_fila = [w["text"] for w in fila]
        if "C1" in tokens_fila:
            idx_c1 = tokens_fila.index("C1")
            permiso = tokens_fila[idx_c1 + 1] if idx_c1 + 1 < len(tokens_fila) else None
            val_com = next((w["text"] for w in fila if NUMERICO.match(w["text"]) and "." in w["text"] and w["text"] != permiso), None)
            cant_c = next((w["text"] for w in fila if DEC_5.match(w["text"])), None)
            p["c1"] = {
                "permiso": permiso,
                "val_com_dls": val_com,
                "cantidad_umt_c": cant_c
            }
            p["permiso_r8"] = permiso
            break

    IDENTIF_VALIDOS = {
        "EC","IN","A1","TS","EU","CA","VA","CT","OM","SC","EP","PR","PP",
        "DS","RG","MX","CN","IM","CR","PO","EN","IA","MA","RO","SP","TE","TL"
    }

    p["identificadores"] = []
    capturando_identif = False
    for fila in filas:
        textos_fila = [w["text"] for w in fila]
        if "IDENTIF." in textos_fila:
            capturando_identif = True
            continue
        if capturando_identif:
            clave = next((t for t in textos_fila if t in IDENTIF_VALIDOS), None)
            if clave:
                complementos = [t for t in textos_fila if t != clave]
                p["identificadores"].append({
                    "clave": clave,
                    "complemento1": complementos[0] if len(complementos) > 0 else None,
                    "complemento2": complementos[1] if len(complementos) > 1 else None,
                    "complemento3": complementos[2] if len(complementos) > 2 else None,
                })
            else:
                capturando_identif = False


# --------------------------------------------------------------------------
# Conciliacion (capa C): lo que hace defendible el resultado
# --------------------------------------------------------------------------

MEDIOS_MAP = {
    "1": "Ferroviario", "2": "Marítimo", "3": "Aéreo", "4": "Aéreo", 
    "5": "Postal", "6": "Ferroviario", "7": "Carretera", "8": "Ducto", "9": "No aplica"
}

def encabezado(path):
    palabras, _ = cargar(path)
    texto = " ".join(w["text"] for w in palabras)
    
    cab = {}
    
    # A. Identificación del Pedimento
    m_ped = re.search(r"NUM\.?[\s]*PEDIMENTO:\s*([\d\s]{14,20})", texto)
    if m_ped: cab["pedimento"] = m_ped.group(1).replace(" ", "")
        
    m_oper = re.search(r"T\.?\s*OPER\s+(\w+)", texto)
    if m_oper: cab["tipo_operacion"] = m_oper.group(1)
        
    m_cve = re.search(r"CVE\.?[\s]*PEDIMENTO:\s+(\w+)", texto)
    if m_cve: cab["cve_pedimento"] = m_cve.group(1)
        
    m_reg = re.search(r"REGIMEN:\s+(\w+)", texto)
    if m_reg: cab["regimen"] = m_reg.group(1)
        
    m_adu = re.search(r"ADUANA E/S:\s+(\d+)", texto)
    if m_adu: cab["aduana_es"] = m_adu.group(1)
        
    m_ref = re.search(r"(?:REF|Referencia):\s+([\w\-]+)", texto)
    if m_ref: cab["referencia"] = m_ref.group(1)
        
    if cab.get("tipo_operacion") == "IMP":
        m_dest = re.search(r"DESTINO:\s+(\d+)", texto)
        if m_dest:
            cab["destino_origen"] = m_dest.group(1)
            cab["destino_origen_tipo"] = "destino"
    else:
        m_orig = re.search(r"ORIGEN:\s+(\d+)", texto)
        if m_orig:
            cab["destino_origen"] = m_orig.group(1)
            cab["destino_origen_tipo"] = "origen"
        
    m_tc = re.search(r"TIPO CAMBIO:\s*([\d\.]+)", texto)
    if m_tc: cab["tipo_cambio"] = float(m_tc.group(1))
        
    m_pb = re.search(r"PESO BRUTO:\s*([\d\.]+)", texto)
    if m_pb: cab["peso_bruto"] = float(m_pb.group(1))

    m_trans = re.search(r"ENTRADA/SALIDA:\s+ARRIBO:\s+SALIDA:\s+(\d+)\s+(\d+)\s+(\d+)", texto)
    if not m_trans:
        m_trans = re.search(r"ENTRADA/SALIDA:\s*(\d+)\s+ARRIBO:\s*(\d+)\s+SALIDA:\s*(\d+)", texto)
    if m_trans:
        cab["transporte_entrada"] = m_trans.group(1)
        cab["transporte_arribo"] = m_trans.group(2)
        cab["transporte_salida"] = m_trans.group(3)
        cab["transporte_entrada_desc"] = MEDIOS_MAP.get(cab["transporte_entrada"], cab["transporte_entrada"])
        cab["transporte_arribo_desc"] = MEDIOS_MAP.get(cab["transporte_arribo"], cab["transporte_arribo"])
        cab["transporte_salida_desc"] = MEDIOS_MAP.get(cab["transporte_salida"], cab["transporte_salida"])

    m_vd = re.search(r"VALOR DOLARES:\s*([\d,]+(?:\.\d+)?)", texto)
    if m_vd: cab["valor_dolares"] = float(m_vd.group(1).replace(",", ""))
        
    m_va = re.search(r"VALOR ADUANA:?\s*([\d,]+(?:\.\d+)?)", texto)
    if m_va: cab["valor_aduana"] = float(m_va.group(1).replace(",", ""))
        
    m_pp = re.search(r"PRECIO PAGADO/VALOR COMERCIAL:\s*([\d,]+(?:\.\d+)?)", texto)
    if m_pp: cab["precio_pagado"] = float(m_pp.group(1).replace(",", ""))

    # B. Datos del Importador/Exportador
    m_rfc = re.search(r"RFC:\s*([A-Z0-9]{12,13})", texto)
    if m_rfc: cab["rfc_importador"] = m_rfc.group(1)
    
    m_rs = re.search(r"NOMBRE, DENOMINACION O RAZON SOCIAL:\s*(.*?)\s*(?:DOMICILIO:|VAL\. SEGUROS)", texto)
    if m_rs:
        rs_str = m_rs.group(1).strip()
        cab["razon_social_importador"] = re.sub(r"^CURP:\s*", "", rs_str)
    
    m_cace = re.search(r"CÓDIGO DE(?: BARRAS|\s+ACEPTACIÓN)?\s+([A-Z0-9]{8})\b", texto)
    if m_cace: cab["codigo_aceptacion"] = m_cace.group(1)
    
    m_sad = re.search(r"CLAVE DE LA SECCION ADUANERA.*?:\s*(\d+)", texto)
    if m_sad: cab["seccion_aduanera"] = m_sad.group(1)

    m_fe = re.search(r"ENTRADA\s+(\d{2}/\d{2}/\d{4})", texto)
    if m_fe: cab["fecha_entrada"] = m_fe.group(1)
    
    m_fp = re.search(r"PAGO\s+(\d{2}/\d{2}/\d{4})", texto)
    if m_fp: cab["fecha_pago"] = m_fp.group(1)

    m_mb = re.search(r"MARCAS, NUMEROS Y TOTAL DE BULTOS:\s*(.*?)\s+(?:FECHAS|TASAS A NIVEL PEDIMENTO|ENTRADA)", texto)
    if m_mb:
        cab["marcas_numeros_bultos"] = m_mb.group(1).strip()
        m_nb = re.search(r"(\d+)\s+BULTOS?", cab["marcas_numeros_bultos"], re.IGNORECASE)
        cab["num_bultos"] = int(m_nb.group(1)) if m_nb else None

    # C. Datos del Proveedor
    m_prov = re.search(r"ID\. FISCAL\s+NOMBRE, DENOMINACION O RAZON SOCIAL\s+DOMICILIO:?\s+VINCULACION\s+([A-Z0-9]+)\s+(.*?)\s+(SI|NO)\s+", texto)
    if m_prov:
        cab["proveedor_id_fiscal"] = m_prov.group(1)
        cab["proveedor_vinculacion"] = m_prov.group(3)
        cab["proveedor_nombre"] = m_prov.group(2).strip()
        
        # Extract Domicilio via regex between the provider name/vinculacion and the next section
        m_dom = re.search(r"DOMICILIO:?\s*VINCULACION.*?\n(.*?)\n(?:NUM\. FACTURA|NUMERO DE ACUSE|DATOS DEL PROVEEDOR)", texto, re.DOTALL)
        if m_dom:
            cab["proveedor_domicilio"] = re.sub(r"\s+", " ", m_dom.group(1).strip())

    # D. Documentos Equivalentes
    cab["facturas"] = []
    seen = set()
    doc_matches = re.finditer(r"([A-Z0-9\-]+)\s*\|\s*(\d{2}/\d{2}/\d{4})\s*\|\s*(CIF|FOB|EXW|CFR|DAP|DDP|FCA)\s*\|\s*([A-Z]{3})\s*\|\s*([\d,]+\.\d{2})\s*\|\s*([\d\.]+)\s*\|\s*([\d,]+\.\d{2})", texto)
    for m in doc_matches:
        fact_id = m.group(1)
        if fact_id not in seen:
            seen.add(fact_id)
            cab["facturas"].append({
                "es_cove": fact_id.upper().startswith("COVE"),
                "cove_acuse": None,
                "factura": fact_id,
                "fecha": m.group(2),
                "incoterm": m.group(3),
                "moneda": m.group(4),
                "valor_moneda": float(m.group(5).replace(",", "")),
                "factor": float(m.group(6)),
                "valor_dolares": float(m.group(7).replace(",", ""))
            })
    # sometimes they are not separated by |
    doc_matches = re.finditer(r"([A-Z0-9\-]{4,}),?\s+(\d{2}/\d{2}/\d{4})\s+(CIF|FOB|EXW|CFR|DAP|DDP|FCA)\s+([A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d\.]+)\s+([\d,]+\.\d{2})(?:\s+(COVE[A-Z0-9]+))?", texto)
    for m in doc_matches:
        fact_id = m.group(1)
        if fact_id not in seen:
            seen.add(fact_id)
            cove = m.group(8)
            cab["facturas"].append({
                "es_cove": fact_id.upper().startswith("COVE"),
                "cove_acuse": cove if cove else None,
                "factura": fact_id,
                "fecha": m.group(2),
                "incoterm": m.group(3),
                "moneda": m.group(4),
                "valor_moneda": float(m.group(5).replace(",", "")),
                "factor": float(m.group(6)),
                "valor_dolares": float(m.group(7).replace(",", ""))
            })


    # E. Guia M/H
    m_guia = re.search(r"(?:NO\.|NUMERO)\s*\(GUIA/ORDEN EMBARQUE\)/ID:\s*([A-Z0-9\-]+)", texto)
    if m_guia:
        guia_raw = m_guia.group(1)
        if guia_raw.endswith("M"):
            cab["guia"] = guia_raw[:-1]
            cab["tipo_guia"] = "Master"
        elif guia_raw.endswith("H"):
            cab["guia"] = guia_raw[:-1]
            cab["tipo_guia"] = "House"
        else:
            cab["guia"] = guia_raw
            cab["tipo_guia"] = "Directa"

    # Contenedores estructurados desde bloque
    cab["contenedores"] = []
    m_conts_bloque = re.search(r"NUMERO/TIPO/CLASE/EQUIPAMIENTO(.*?)(?:MARCAS, NUMEROS|DATOS DEL PROVEEDOR|IDENTIFICADORES)", texto, re.DOTALL)
    if m_conts_bloque:
        cont_matches = re.finditer(r"([A-Z]{4}\d{7})\s+(\d+)\s+(\d+)\s+(\d+)", m_conts_bloque.group(1))
        for m in cont_matches:
            cab["contenedores"].append({
                "numero": m.group(1),
                "tipo": m.group(2),
                "clase": m.group(3),
                "equipamiento": m.group(4)
            })
            
    # Formas de Pago Virtuales (FPV)
    m_fpv = re.search(r"IVA\s+F\.?P\.?\s+(21|22)\s+([\d,]+)", texto)
    if m_fpv:
        cab["fp_virtual"] = m_fpv.group(1)
        cab["iva_fpv"] = float(m_fpv.group(2).replace(",", ""))
    # F. Identificadores Complementarios
    cab["identificadores"] = []
    id_matches = re.finditer(r"\b(CR|IM|PP|EN|PO)\s+(\d{1,10})\b", texto)
    for m in id_matches:
        cab["identificadores"].append({"clave": m.group(1), "complemento": m.group(2)})

    # G. Incrementables
    m_inc = re.search(r"VAL\. SEGUROS\s+SEGUROS\s+FLETES\s+EMBALAJES\s+OTROS INCREMENTABLES\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)", texto)
    if m_inc:
        cab["val_seguros"] = float(m_inc.group(1).replace(",", ""))
        cab["seguros"] = float(m_inc.group(2).replace(",", ""))
        cab["fletes"] = float(m_inc.group(3).replace(",", ""))
        cab["embalajes"] = float(m_inc.group(4).replace(",", ""))
        cab["otros_incrementables"] = float(m_inc.group(5).replace(",", ""))

    # Decrementables
    m_dec = re.search(r"TRANSPORTE\s+SEGURO\s+CARGA\s+DESCARGA\s+OTROS.*?DECREMENTABLES.*?\n\s*([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)", texto, re.DOTALL)
    if m_dec:
        cab["dec_transporte"] = float(m_dec.group(1).replace(",", ""))
        cab["dec_seguro"] = float(m_dec.group(2).replace(",", ""))
        cab["dec_carga"] = float(m_dec.group(3).replace(",", ""))
        cab["dec_descarga"] = float(m_dec.group(4).replace(",", ""))
        cab["dec_otros"] = float(m_dec.group(5).replace(",", ""))

    # Datos Bancarios
    m_banco = re.search(r"BANCO:\s*(.*?)\n", texto)
    if m_banco: cab["pago_banco"] = m_banco.group(1).strip()
    
    m_lc = re.search(r"LÍNEA DE CAPTURA:\s*(.*?)\n", texto)
    if m_lc: cab["pago_linea_captura"] = m_lc.group(1).strip()
    
    m_imp = re.search(r"IMPORTE PAGADO:\s*\$?([\d,]+(?:\.\d+)?)", texto)
    if m_imp: cab["pago_importe"] = float(m_imp.group(1).replace(",", ""))
    
    m_fhp = re.search(r"FECHA Y HORA DE PAGO:\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})", texto)
    if m_fhp: cab["pago_fecha_hora"] = m_fhp.group(1)
    
    m_nob = re.search(r"NÚMERO DE OPERACIÓN BANCARIA:\s*(\d+)", texto)
    if m_nob: cab["pago_operacion_bancaria"] = m_nob.group(1)
    
    m_nts = re.search(r"NÚMERO DE TRANSACCIÓN SAT:\s*(\d+)", texto)
    if m_nts: cab["pago_transaccion_sat"] = m_nts.group(1)

    # H. Tasas a Nivel Pedimento
    cab["tasas"] = []
    m_tasas_bloque = re.search(r"TASAS A NIVEL PEDIMENTO(.*?)CUADRO DE LIQUIDACION", texto, re.DOTALL)
    if m_tasas_bloque:
        tasa_matches = re.finditer(r"\b([A-Z/]+)\s+(\d+)\s+([\d\.]+)\b", m_tasas_bloque.group(1))
        for m in tasa_matches:
            cab["tasas"].append({
                "contribucion": m.group(1),
                "clave_tasa": int(m.group(2)),
                "tasa": float(m.group(3))
            })

    # I. Cuadro de Liquidacion
    cab["cuadro_liquidacion"] = []
    m_cuadro_bloque = re.search(r"CUADRO DE LIQUIDACION(.*?)(?:DEPOSITO REFERENCIADO|DATOS DEL PROVEEDOR)", texto, re.DOTALL)
    if m_cuadro_bloque:
        liq_matches = re.finditer(r"\b([A-Z/]+)\s+(\d+)\s+([\d,]+)\b", m_cuadro_bloque.group(1))
        for m in liq_matches:
            if m.group(1) in ["DTA", "PRV", "IVA", "IVA/PRV", "IGIE", "ISAN", "IEPS", "CNT", "ECI", "ITV"]:
                cab["cuadro_liquidacion"].append({
                    "concepto": m.group(1),
                    "forma_pago": int(m.group(2)),
                    "importe": float(m.group(3).replace(",", ""))
                })
            
    # Calculate Total Efectivo (sum of all liquidations where forma_pago == 0)
    cab["total_efectivo"] = sum(item["importe"] for item in cab["cuadro_liquidacion"] if item["forma_pago"] == 0)
    
    # Extract printed TOTAL just in case (this might be higher, including F.P. 22)
    m_tot_liq = re.search(r"TOTAL\s+([\d,]+)", texto)
    if m_tot_liq:
        cab["total_general"] = float(m_tot_liq.group(1).replace(",", ""))

    # set dta, prv, iva from cuadro_liquidacion for backward compatibility
    for c in cab["cuadro_liquidacion"]:
        cab[c["concepto"].lower().replace("/", "_")] = c["importe"]
        
    if cab.get("facturas") and len(cab["facturas"]) > 0:
        cab["factura"] = cab["facturas"][0]["factura"]
        cab["incoterm"] = cab["facturas"][0]["incoterm"]
        cab["moneda"] = cab["facturas"][0]["moneda"]

    m_tot = (re.search(r"TOTAL DE PARTIDAS:?\s*\**\s*(\d+)", texto)
             or re.search(r"FIN DE PEDIMENTO.{0,140}?(\d+)\s+010", texto))
    cab["total_partidas"] = int(m_tot.group(1)) if m_tot else None
    
    m_cove_match = re.search(r"NUMERO DE ACUSE DE VALOR:\s*(COVE[A-Z0-9]+)", texto, re.IGNORECASE)
    if m_cove_match:
        cab["cove_acuse"] = m_cove_match.group(1)
    else:
        cab["cove_acuse"] = None

    return cab


def _f(x):
    return float(x.replace(",", "")) if x else 0.0


def conciliar(partidas, cab):
    secuencias = [int(p["secuencia"]) for p in partidas if p["secuencia"]]
    esperadas = set(range(1, (cab["total_partidas"] or len(partidas)) + 1))
    suma_adu = sum(_f(p["val_adu_usd"]) for p in partidas)

    # SAAI redondea cada partida a pesos enteros, por lo que la tolerancia
    # correcta es +-1 peso por partida, no cero.
    tolerancia = len(partidas)
    diferencia = (cab["valor_aduana"] - suma_adu) if cab["valor_aduana"] else None

    return {
        "partidas_declaradas": cab["total_partidas"],
        "partidas_extraidas": len(partidas),
        "secuencias_faltantes": sorted(esperadas - set(secuencias)),
        "secuencias_duplicadas": len(secuencias) - len(set(secuencias)),
        "sin_secuencia": sum(1 for p in partidas if not p["secuencia"]),
        "suma_val_adu": round(suma_adu, 2),
        "valor_aduana_encabezado": cab["valor_aduana"],
        "diferencia": round(diferencia, 2) if diferencia is not None else None,
        "concilia": diferencia is not None and abs(diferencia) <= tolerancia,
    }


def main():
    modo_json = "--json" in sys.argv
    rutas = [a for a in sys.argv[1:] if not a.startswith("--")]

    for ruta in rutas:
        partidas = extraer(ruta)
        cab = encabezado(ruta)
        rep = conciliar(partidas, cab)

        if modo_json:
            print(json.dumps({
                "archivo": ruta, 
                "cabecera": cab,
                "conciliacion": rep,
                "partidas": partidas
            }, ensure_ascii=False, indent=2))
            continue

        nombre = ruta.split("/")[-1]
        ok = (rep["concilia"]
              and not rep["secuencias_faltantes"]
              and not rep["secuencias_duplicadas"]
              and rep["sin_secuencia"] == 0
              and rep["partidas_extraidas"] == rep["partidas_declaradas"])
        estado = "OK" if ok else "REVISAR"
        print(f"{nombre:38s} [{estado}]")
        print(f"  partidas   declaradas={rep['partidas_declaradas']} "
              f"extraidas={rep['partidas_extraidas']} "
              f"faltantes={rep['secuencias_faltantes'][:5]} "
              f"sin_secuencia={rep['sin_secuencia']}")
        print(f"  valor      suma={rep['suma_val_adu']:,.2f} "
              f"encabezado={rep['valor_aduana_encabezado']:,.2f} "
              f"diferencia={rep['diferencia']:,.2f}")


if __name__ == "__main__":
    main()
