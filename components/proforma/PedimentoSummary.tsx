/*
 * PEDIMENTO PARSER (PHASE 2 FIX)
 * Estrategia: Extracción por Anclaje (Anchor Extraction)
 * 1. Busca la posición exacta de una etiqueta (Start Anchor).
 * 2. Busca la posición de la siguiente etiqueta (End Anchor).
 * 3. Extrae el contenido en medio.
 * 4. NO USA REGEX.
 */

export const parsePedimentoPhase2 = (rawText: string) => {
    if (!rawText) return null;

    // --- HELPER DE EXTRACCIÓN ROBUSTA ---
    const extract = (startLabel: string, endLabels: string[]) => {
        // 1. Encontrar dónde empieza la etiqueta (ej: "NUM.DE PEDIMENTO:")
        const startIdx = rawText.indexOf(startLabel);
        if (startIdx === -1) return "";

        // 2. Calcular dónde empieza el valor (justo después de la etiqueta)
        const valueStartIdx = startIdx + startLabel.length;

        // 3. Buscar el final más cercano (cualquiera de las etiquetas de cierre)
        let bestEndIdx = rawText.length; // Por defecto, hasta el final del texto

        for (const label of endLabels) {
            const idx = rawText.indexOf(label, valueStartIdx);
            // Si encontramos la etiqueta y está antes que la mejor posición actual, actualizamos
            if (idx !== -1 && idx < bestEndIdx) {
                bestEndIdx = idx;
            }
        }

        // 4. Cortar y limpiar
        // .trim() elimina los espacios o saltos de línea que sobren
        return rawText.substring(valueStartIdx, bestEndIdx).trim();
    };

    // --- HELPER PARA FECHAS (Verticales en tu raw text) ---
    const extractDates = () => {
        // Tu raw text tiene: FECHAS \n ENTRADA \n PAGO \n 22/12/2025 \n 22/12/2025
        // Buscamos el bloque después de "FECHAS"
        const block = extract("FECHAS", ["CUADRO DE LIQUIDACION"]);
        if (!block) return [];

        // Dividimos por líneas y buscamos las que parezcan fechas (tienen "/")
        const lines = block.split('\n').map(l => l.trim());
        const dateLines = lines.filter(l => l.includes('/') && l.length < 15);

        // Asumimos orden estándar del pedimento: 1. Entrada, 2. Pago
        return [
            { tipo: 'Entrada', fecha: dateLines[0] || "" },
            { tipo: 'Pago', fecha: dateLines[1] || "" }
        ];
    };

    // --- EJECUCIÓN DE EXTRACCIÓN ---

    // 1. HEADER (Datos Generales)
    // Basado estrictamente en tu Raw Text: "NUM.DE PEDIMENTO:25 16..."
    const header = {
        pedimentoNo: extract("NUM.DE PEDIMENTO:", ["T. OPER", "T.OPER"]),
        tipoOperacion: extract("T. OPER:", ["CVE.", "CVE "]),
        cvePedimento: extract("CVE. PEDIMENTO:", ["REGIMEN"]),
        regimen: extract("REGIMEN:", ["Clave en el RFC", "DESTINO", "\n"]),
        // "TIPO CAMBIO: 17.97920 PESO BRUTO:" -> Cortamos en PESO
        tipoCambio: extract("TIPO CAMBIO:", ["PESO BRUTO", "MEDIOS"]),
        // "9328.000ADUANA" -> Aquí el dato está pegado. Buscamos "ADUANA" como fin.
        pesoBruto: extract("PESO BRUTO:", ["ADUANA"]),
        // "ADUANA E/S: 160" -> Cortamos al salto de línea o siguiente sección
        aduana: extract("ADUANA E/S:", ["\n", "CERTIFICACIONES", "MEDIOS"]),

        fechas: extractDates()
    };

    // 2. VALORES (Están en un bloque claro a la derecha visualmente, abajo en texto)
    const valores = {
        // "VALOR DOLARES:\n66093.74\nVALOR ADUANA:"
        dolares: extract("VALOR DOLARES:", ["VALOR ADUANA", "\n"]),
        // "VALOR ADUANA:\n1188313\nPRECIO PAGADO..."
        aduana: extract("VALOR ADUANA:", ["PRECIO PAGADO", "\n"]),
        // "PRECIO PAGADO/VALOR COMERCIAL:\n1..."
        precioPagado: extract("PRECIO PAGADO/VALOR COMERCIAL:", ["DATOS DEL", "\n"]),
        fletes: extract("FLETES:", ["EMBALAJES", "\n"]) || "0",
        seguros: extract("SEGUROS:", ["FLETES", "\n"]) || "0",
        embalajes: extract("EMBALAJES:", ["OTROS", "\n"]) || "0",
        otros: extract("OTROS INCREMENTABLES:", ["VALOR DECREMENTABLES", "\n"]) || "0"
    };

    // 3. ACTORES
    const importador = {
        // Busca el primer RFC después del título de importador
        rfc: extract("DATOS DEL IMPORTADOR/EXPORTADOR\nClave en el RFC:", ["NOMBRE", " "]),
        nombre: extract("RAZON SOCIAL:\n", ["CURP", "DOMICILIO"]),
        domicilio: extract("DOMICILIO:", ["VAL. SEGUROS", "TRANSPORTE", "Pagina"])
    };

    const proveedor = {
        // "ID FISCAL\n... número ..."
        idFiscal: extract("ID FISCAL\n", ["NOMBRE", " "]), // Toma la línea siguiente a ID FISCAL
        nombre: extract("RAZON SOCIAL\n", ["DOMICILIO"]),
        domicilio: extract("DOMICILIO:\n", ["VINCULACION", "NUM. FACTURA"])
    };

    // 4. TASAS (Cuadro Liquidación)
    // El raw text muestra: "DTA\n0\n445" (Concepto, FP, Importe en columnas verticales a veces mezcladas)
    // Para simplificar sin regex, extraemos el bloque y buscamos claves conocidas.
    const importes = {
        dta: extract("DTA\n4\n", ["\n"]).trim(), // Busca la tasa específica si el formato es "TASA\nDTA..."
        // Fallback: búsqueda simple por cercanía si el formato varía
        iva: extract("IVA\n0\n", ["EFECTIVO", "\n"]).trim(),
        totalEfectivo: extract("EFECTIVO\n", ["\n", "PRV"]).trim()
    };

    // --- RECONSTRUCCIÓN DEL JSON FINAL ---
    return {
        header: {
            ...header,
            ...importador, // Aplana importador dentro de header si tu UI lo espera así, o sepáralo
            importador: importador,
            proveedor: proveedor,
            valores: valores,
            importes: importes,
            // Pasamos arrays vacíos para partidas/contenedores si se procesan aparte
            // Ojo: Si ya tienes lógica que extrae partidas, úsala aquí.
            // Si no, este parser se enfoca en arreglar el Header que estaba vacío.
        },
        // Mantenemos rawText para debugging
        rawText: rawText
    };
};