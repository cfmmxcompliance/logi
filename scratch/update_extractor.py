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
                elif w["text"] == "P.V/C":
                    b["PVC"] = (w["x0"], w["x1"])
                elif w["text"] == "P.O/D":
                    b["POD"] = (w["x0"], w["x1"])

        unido = " ".join(textos)
        if "ADU/USD" in unido:
            for w in fila:
                if w["text"] in ("VAL.ADU/USD", "ADU/USD"):
                    b["VAL_ADU"] = (w["x0"], w["x1"])
                elif w["text"] == "IMP.PRECIO":
                    b["PRECIO_PAG"] = (w["x0"], w["x1"])
                elif w["text"] == "PRECIO":
                    b.setdefault("PRECIO_UNIT", (w["x0"], w["x1"]))

        if "FRACCION" in b and "VAL_ADU" in b:
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
    p["val_adu_usd"] = p["precio_pagado"] = p["precio_unitario"] = None
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
            elif DEC_5.match(w["text"]):
                p["precio_unitario"] = w["text"]

    # Numero de parte y factura viven en el bloque OBSERVACIONES A NIVEL PARTIDA
    candidatos = [
        t for t in tokens
        if len(t) >= 8 and "-" in t
        and not t.startswith(("NOM", "REF:"))
        and not FACTURA.match(t)
        and not re.match(r"^\d{3}-\d", t)
    ]
    p["numero_parte"] = candidatos[0] if candidatos else None
    facturas = [t for t in tokens if FACTURA.match(t)]
    p["factura"] = facturas[0] if facturas else None

    # Regla 8: la fraccion real va en el campo F.A. ORIGINAL
    fa = re.search(r"F\.?A:?\s*(?:ORIGINAL\s*)?(\d{8,10})", " ".join(tokens))
    p["fa_original"] = fa.group(1) if fa else None
    
    # Permiso de Regla Octava (C1)
    p["permiso_r8"] = None
    for i, t in enumerate(tokens):
        if t == "C1" and i + 1 < len(tokens) and len(tokens[i+1]) > 5:
            p["permiso_r8"] = tokens[i+1]
            break
        elif t.startswith("C1") and len(t) > 6:
            p["permiso_r8"] = t.replace("C1", "", 1).strip()
            break


# --------------------------------------------------------------------------
# Conciliacion (capa C): lo que hace defendible el resultado
# --------------------------------------------------------------------------

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
        
    m_ref = re.search(r"REF:\s+([\w\-]+)", texto)
    if m_ref: cab["referencia"] = m_ref.group(1)
        
    m_dest = re.search(r"DESTINO/ORIGEN:\s+(\d+)", texto)
    if m_dest: cab["destino_origen"] = m_dest.group(1)
        
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
    if m_rs: cab["razon_social_importador"] = m_rs.group(1).strip()
    
    m_cace = re.search(r"CÓDIGO DE(?: BARRAS|\s+ACEPTACIÓN)?\s+([A-Z0-9]{8})\b", texto)
    if m_cace: cab["codigo_aceptacion"] = m_cace.group(1)
    
    m_sad = re.search(r"CLAVE DE LA SECCION ADUANERA.*?:\s*(\d+)", texto)
    if m_sad: cab["seccion_aduanera"] = m_sad.group(1)

    m_fe = re.search(r"ENTRADA\s+(\d{2}/\d{2}/\d{4})", texto)
    if m_fe: cab["fecha_entrada"] = m_fe.group(1)
    
    m_fp = re.search(r"PAGO\s+(\d{2}/\d{2}/\d{4})", texto)
    if m_fp: cab["fecha_pago"] = m_fp.group(1)

    m_mb = re.search(r"MARCAS, NUMEROS Y TOTAL DE BULTOS:\s*(.*?)\s+(?:FECHAS|TASAS A NIVEL PEDIMENTO|ENTRADA)", texto)
    if m_mb: cab["marcas_numeros_bultos"] = m_mb.group(1).strip()

    # C. Datos del Proveedor
    m_prov = re.search(r"ID\. FISCAL\s+NOMBRE, DENOMINACION O RAZON SOCIAL\s+DOMICILIO:\s+VINCULACION\s+([A-Z0-9]+)\s+(.*?)\s+(SI|NO)\s+", texto)
    if m_prov:
        cab["proveedor_id_fiscal"] = m_prov.group(1)
        cab["proveedor_vinculacion"] = m_prov.group(3)
        cab["proveedor_nombre"] = m_prov.group(2).strip()

    # D. Documentos Equivalentes
    cab["facturas"] = []
    doc_matches = re.finditer(r"([A-Z0-9\-]+)\s*\|\s*(\d{2}/\d{2}/\d{4})\s*\|\s*(CIF|FOB|EXW|CFR|DAP|DDP|FCA)\s*\|\s*([A-Z]{3})\s*\|\s*([\d,]+\.\d{2})\s*\|\s*([\d\.]+)\s*\|\s*([\d,]+\.\d{2})", texto)
    for m in doc_matches:
        cab["facturas"].append({
            "factura": m.group(1),
            "fecha": m.group(2),
            "incoterm": m.group(3),
            "moneda": m.group(4),
            "valor_moneda": float(m.group(5).replace(",", "")),
            "factor": float(m.group(6)),
            "valor_dolares": float(m.group(7).replace(",", ""))
        })
    # sometimes they are not separated by |
    if not cab["facturas"]:
        doc_matches = re.finditer(r"([A-Z0-9\-]{4,})\s+(\d{2}/\d{2}/\d{4})\s+(CIF|FOB|EXW|CFR|DAP|DDP|FCA)\s+([A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d\.]+)\s+([\d,]+\.\d{2})", texto)
        for m in doc_matches:
            cab["facturas"].append({
                "factura": m.group(1),
                "fecha": m.group(2),
                "incoterm": m.group(3),
                "moneda": m.group(4),
                "valor_moneda": float(m.group(5).replace(",", "")),
                "factor": float(m.group(6)),
                "valor_dolares": float(m.group(7).replace(",", ""))
            })


    # E. Guia / Contenedores
    m_guia = re.search(r"NO\.\s*\(GUIA/ORDEN EMBARQUE\)/ID:\s*([A-Z0-9\-]+)", texto)
    if not m_guia:
        m_guia = re.search(r"NUMERO\s*\(GUIA/ORDEN EMBARQUE\)/ID:\s*([A-Z0-9\-]+)", texto)
    if m_guia: cab["guia"] = m_guia.group(1)
        
    contenedores = re.findall(r"([A-Z]{4}\d{7})\s+(\d+)\s+([A-Z0-9]+)", texto)
    cab["contenedores"] = [{"numero": c[0], "tipo": c[1]} for c in contenedores]
    if not cab["contenedores"]:
        contenedores = re.findall(r"([A-Z]{4}\d{7})\s+(\d{1,2})\b", texto)
        cab["contenedores"] = [{"numero": c[0], "tipo": c[1]} for c in contenedores]

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

    # H. Tasas a Nivel Pedimento
    cab["tasas"] = []
    tasa_matches = re.finditer(r"(\d+\s+[A-Z/]+)\s+(\d+)\s+([\d\.]+)", texto)
    for m in tasa_matches:
        cab["tasas"].append({
            "contribucion": m.group(1),
            "clave_tasa": int(m.group(2)),
            "tasa": float(m.group(3))
        })

    # I. Cuadro de Liquidacion
    cab["cuadro_liquidacion"] = []
    liq_matches = re.finditer(r"\b([A-Z/]+)\s+(\d+)\s+([\d,]+)\b", texto)
    for m in liq_matches:
        if m.group(1) in ["DTA", "PRV", "IVA", "IVA/PRV", "IGIE", "ISAN", "IEPS", "CNT", "ECI", "ITV"]:
            cab["cuadro_liquidacion"].append({
                "concepto": m.group(1),
                "forma_pago": int(m.group(2)),
                "importe": float(m.group(3).replace(",", ""))
            })
            
    m_tot_liq = re.search(r"TOTAL\s+([\d,]+)", texto)
    if m_tot_liq:
        cab["total_efectivo"] = float(m_tot_liq.group(1).replace(",", ""))

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
