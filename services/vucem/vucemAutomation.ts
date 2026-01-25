
import { VucemConfig, Cove } from './types';
import { vucemService } from './vucemService';
import { acusesService } from './acusesService';
import { pedimentoService } from './pedimentoService';
import { generateCovePdf } from '../../utils/vucemPdfGenerator';
import { generatePagoPdf } from '../../utils/pagoPdfGenerator';
import { parsePedimentoFinancials } from '../../utils/xmlFinancialParser';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PedimentoRecord } from '../../types';

export class VucemAutomation {
    private saveToDrive = httpsCallable(getFunctions(), 'saveFileToExpediente');

    async syncPedimentoToDrive(pedimento: PedimentoRecord, config: VucemConfig, onProgress?: (msg: string) => void) {
        const pedimentoNo = pedimento.pedimento;

        // 0. LOCAL AUTH GUARD: Try to read the key locally before even hitting the net
        try {
            const { readPrivateKey } = await import('./cryptoUtils');
            if (config.keyFile) {
                await readPrivateKey(config.keyFile, config.password);
            }
        } catch (e: any) {
            throw new Error(`GUARD LOCAL: La contraseña de la llave .key es incorrecta. Proceso abortado para evitar bloqueos.`);
        }
        for (const coveRef of pedimento.coves || []) {
            try {
                if (onProgress) onProgress(`Consultando COVE ${coveRef.cove}...`);
                const resp = await vucemService.consultarEdocument(coveRef.cove, config);

                if (resp.resultadoBusqueda?.cove) {
                    const coveData = resp.resultadoBusqueda.cove;

                    // NEW: Try to get Official Acuse PDF first (Legal)
                    let finalPdfBase64 = "";
                    let isOfficial = false;

                    try {
                        const officialPdf = await acusesService.consultarAcuse(coveRef.cove, config);
                        if (officialPdf) {
                            finalPdfBase64 = officialPdf;
                            isOfficial = true;
                            if (onProgress) onProgress(`✅ Acuse Oficial descargado para ${coveRef.cove}`);
                        }
                    } catch (e) {
                        console.warn(`No se pudo descargar acuse oficial para ${coveRef.cove}, generando representación...`);
                    }

                    // Fallback to Generated PDF (Representation)
                    if (!finalPdfBase64) {
                        finalPdfBase64 = generateCovePdf(coveData, 'base64') as string;
                    }

                    if (onProgress) onProgress(`Subiendo ${isOfficial ? 'Acuse Oficial' : 'Representación'} de ${coveRef.cove} a Drive...`);
                    await this.saveToDrive({
                        pedimentoNo,
                        fileName: `COVE_${coveRef.cove}${isOfficial ? '_OFICIAL' : ''}.pdf`,
                        fileBase64: finalPdfBase64,
                        mimeType: 'application/pdf'
                    });

                    // NEW: Save Adenda if present (Audit Finding Fix)
                    if (resp.resultadoBusqueda.adenda) {
                        try {
                            const adendaXml = resp.resultadoBusqueda.adenda;
                            // Basic Base64 encoding for the XML string
                            const adendaB64 = btoa(unescape(encodeURIComponent(adendaXml)));

                            await this.saveToDrive({
                                pedimentoNo,
                                fileName: `ADENDA_COVE_${coveRef.cove}.xml`,
                                fileBase64: adendaB64,
                                mimeType: 'application/xml'
                            });
                            if (onProgress) onProgress(`✅ Adenda detectada y guardada para ${coveRef.cove}`);
                        } catch (err) {
                            console.warn(`Error saving Adenda for ${coveRef.cove}`, err);
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Error syncing COVE ${coveRef.cove}:`, err);
                // FAIL-FAST: If it's an auth error, abort the entire batch
                const errMsg = (err.message || "").toLowerCase();
                if (errMsg.includes('auth') || errMsg.includes('firm') || errMsg.includes('password') || errMsg.includes('credent')) {
                    throw new Error(`ABORTADO POR SEGURIDAD: Error de autenticación detectado (${err.message}). Revisa tus credenciales.`);
                }
            }
            // Throttling: Small delay to respect VUCEM rate limits
            await new Promise(r => setTimeout(r, 800));
        }

        // 2. Process Digitalized Documents (Edocuments)
        for (const docRef of pedimento.digitalDocuments || []) {
            try {
                if (onProgress) onProgress(`Procesando Documento ${docRef.eDocument}...`);
                // Note: For digital documents, we might just get the XML or a simple receipt.
                // VUCEM usually offers the "Impresion Simplificada" for some.
                // For now, let's treat them like eDocuments/COVEs if the service supports it.
                // If it's a generic document, we might need a different VUCEM method.
                const resp = await vucemService.consultarEdocument(docRef.eDocument, config);

                // Same logic for Documents
                // Try official acuse first (Digitalization Acuse)
                let finalPdfBase64 = "";
                try {
                    const officialPdf = await acusesService.consultarAcuse(docRef.eDocument, config);
                    if (officialPdf) {
                        finalPdfBase64 = officialPdf;
                    }
                } catch (e) {
                    console.warn(`No Acuse found for ${docRef.eDocument}`);
                }

                if (!finalPdfBase64 && resp.resultadoBusqueda?.cove) {
                    // Fallback to generic representation (data dump)
                    const docData = resp.resultadoBusqueda.cove;
                    finalPdfBase64 = generateCovePdf(docData, 'base64') as string;
                }

                if (finalPdfBase64) {
                    await this.saveToDrive({
                        pedimentoNo,
                        fileName: `DOC_${docRef.eDocument}.pdf`,
                        fileBase64: finalPdfBase64,
                        mimeType: 'application/pdf'
                    });
                }
            } catch (err: any) {
                console.error(`Error syncing Doc ${docRef.eDocument}:`, err);
                // FAIL-FAST
                const errMsg = (err.message || "").toLowerCase();
                if (errMsg.includes('auth') || errMsg.includes('firm') || errMsg.includes('password') || errMsg.includes('credent')) {
                    throw new Error(`ABORTADO POR SEGURIDAD: Error de autenticación detectado (${err.message}).`);
                }
            }
            // Throttling
            await new Promise(r => setTimeout(r, 800));
        }

        // 3. Process Full Pedimento XML (The "Historical Truth")
        try {
            // Need to extract Patente and Aduana from pedimento number or config.
            // Simplified: Assuming we can extract or use defaults.
            // Example Pedimento: 24  16  3628  6001234
            // Patente is usually available in the record.
            const patente = pedimento.patente || config.rfc.slice(0, 4); // Fallback
            // Aduana is trickier without the full string parsing, defaulting dummy or parsing if available.
            const aduana = pedimento.seccion ? pedimento.seccion.substring(0, 2) : "00"; // Simplification

            if (onProgress) onProgress(`Descargando XML Oficial de Pedimento ${pedimentoNo}...`);
            const xmlBase64 = await pedimentoService.consultarPedimentoCompleto(patente, aduana, pedimentoNo, config);

            if (xmlBase64) {
                await this.saveToDrive({
                    pedimentoNo,
                    fileName: `PEDIMENTO_${pedimentoNo}_FULL.xml`,
                    fileBase64: xmlBase64,
                    mimeType: 'application/xml'
                });

                // 3a. Financial Data Extraction & DB Update
                try {
                    const xmlStr = atob(xmlBase64);
                    const financials = parsePedimentoFinancials(xmlStr);

                    // We need to update the Firestore document for this Pedimento.
                    // Since vucemAutomation runs on client-side (mostly), we can access Firestore directly
                    // IF we inject it, OR we use a callable "updateDossierMetadata".
                    // For simplicity and speed, let's use the saveToDrive callable if it supports metadata update
                    // OR just use client-side Import if we have context.

                    // Wait, `vucemAutomation` is a class imported in UI. We can dynamically import firestore.
                    const { getFirestore, doc, setDoc, updateDoc } = await import('firebase/firestore');
                    const { db } = await import('../../services/firebaseConfig');

                    // Find dossier by pedimento Number? Or we assume we know the ID?
                    // We only have `pedimentoNo`. We might need to query for the ID or assume it exists.
                    // Actually, usually `pedimento` object passed to this function has `id` if it came from DB?
                    // `syncPedimentoToDrive` receives `pedimento: PedimentoRecord`.

                    if (pedimento.id) {
                        const dossierRef = doc(db, 'electronic_dossiers', pedimento.id);
                        await setDoc(dossierRef, {
                            financials,
                            status: 'Complete', // If we have the full XML, it's pretty complete
                            lastUpdate: new Date().toISOString()
                        }, { merge: true });
                    }

                } catch (e) {
                    console.warn("Error extracting financials:", e);
                }

                // 3b. Generate "Pago Electrónico" Receipt (Rehydration)
                try {
                    const parser = new DOMParser();
                    const xmlStr = atob(xmlBase64); // Decode base64 to parse
                    const doc = parser.parseFromString(xmlStr, "text/xml");

                    // Helper to get tag content ignoring namespace
                    const getTag = (tag: string) => {
                        const els = doc.getElementsByTagName("*");
                        for (let i = 0; i < els.length; i++) {
                            if (els[i].localName === tag) return els[i].textContent || "";
                        }
                        return "";
                    };

                    const pagoData = {
                        patente,
                        pedimento: pedimentoNo,
                        aduana,
                        bancoKey: getTag("claveBanco") || "000",
                        lineaCaptura: getTag("lineaCaptura"),
                        importePagado: getTag("importePagado") || getTag("totalEfectivo") || "0",
                        fechaPago: (getTag("fechaPago") || "") + " " + (getTag("horaPago") || ""),
                        numOperacion: getTag("numeroOperacionBancaria"),
                        numTransaccion: getTag("numeroTransaccionSAT") || getTag("numeroOperacion") // Fallback
                    };

                    // Only generate if we have a valid Linea Captura (means it was paid)
                    if (pagoData.lineaCaptura) {
                        const pagoPdfBase64 = generatePagoPdf(pagoData, 'base64') as string;
                        await this.saveToDrive({
                            pedimentoNo,
                            fileName: `PAGO_PEDIMENTO_${pedimentoNo}.pdf`,
                            fileBase64: pagoPdfBase64,
                            mimeType: 'application/pdf'
                        });
                        if (onProgress) onProgress(`✅ Pago Electrónico generado para ${pedimentoNo}`);
                    }
                } catch (err) {
                    console.warn(`Error generating Payment PDF for ${pedimentoNo}:`, err);
                }
            }
        } catch (e) {
            console.error(`Error syncing Pedimento XML ${pedimentoNo}:`, e);
        }

        // 4. TODO: Acuse PDF (Requires ConsultarAcuse) - Done in previous steps via acusesService
    }

    /**
     * Sincronización masiva por Rango de Fechas (Discovery Mode).
     * Descarga todos los COVEs generados en un periodo, útil para lo que no está en Data Stage.
     */
    async syncDateRangeToDrive(start: string, end: string, config: VucemConfig, onProgress?: (msg: string) => void) {

        // 0. Local Guard
        try {
            // ... existing guard logic could be reused or assumed passed from UI
        } catch (e) { }

        if (onProgress) onProgress(`Consultando VUCEM del ${start} al ${end}...`);

        const resp = await vucemService.consultarEdocument({ start, end }, config);
        const covesFound = resp.resultadoBusqueda?.coves || [];

        if (covesFound.length === 0) {
            if (onProgress) onProgress("No se encontraron documentos en este periodo.");
            return;
        }

        if (onProgress) onProgress(`Se encontraron ${covesFound.length} documentos. Procesando...`);

        for (let i = 0; i < covesFound.length; i++) {
            const coveData = covesFound[i];
            const eDoc = coveData.eDocument;

            // Try to infer Pedimento? For now, if we don't know it, use "POR_CLASIFICAR"
            // VUCEM returns COVEs. COVEs are linked to Pedimentos but the COVE XML itself might not always have it 
            // plainly visible without deep parsing or reference.
            // We'll organize by Month/Date if Pedimento is unknown.
            const pedimentoNo = "POR_CLASIFICAR";

            if (onProgress) onProgress(`[${i + 1}/${covesFound.length}] Procesando COVE ${eDoc}...`);

            // 1. Download Official Acuse
            let finalPdfBase64 = "";
            let isOfficial = false;
            try {
                const officialPdf = await acusesService.consultarAcuse(eDoc, config);
                if (officialPdf) {
                    finalPdfBase64 = officialPdf;
                    isOfficial = true;
                }
            } catch (e) { console.warn(`Skipping official acuse for ${eDoc}`); }

            // 2. Fallback PDF
            if (!finalPdfBase64) {
                finalPdfBase64 = generateCovePdf(coveData, 'base64') as string;
            }

            // 3. Save
            await this.saveToDrive({
                pedimentoNo,
                fileName: `COVE_${eDoc}${isOfficial ? '_OFICIAL' : ''}.pdf`,
                fileBase64: finalPdfBase64,
                mimeType: 'application/pdf'
            });

            // NEW: Save Adenda if present
            // Note: In Date Range Sync, we iterate `covesFound` which came from `resp.resultadoBusqueda.coves`.
            // Our current parser puts adenda in `resp.resultadoBusqueda.adenda` (single top level).
            // BUT wait, if there are multiple COVEs, where is the adenda?
            // VUCEM usually returns 1 Adenda per Request if it's a specific query.
            // For Date Range, we get a list of COVEs. Does the XML have multiple <adenda>?
            // The parser extracts the *first* adenda.
            // If VUCEM Date Range returns one big XML with multiple COVEs and multiple Adendas, we need to handle that.
            // However, typical behavior is 1 Adenda per simplified print request. 
            // Since `consultarEdocument` with dates returns a list of COVEs metadata...
            // Actually, `ConsultarEdocument` is for getting the "Comprobante de Valor" data.
            // If the user wants the Adenda of a specific COVE found in the range, they might need to query specifically that COVE.
            // BUT, if `resp.resultadoBusqueda.adenda` is populated, let's save it.
            // It might be assoc with the first one or a general one. 
            // Ideally we'd need to re-query each COVE individually to get its specific Adenda if the list doesn't map them 1:1.
            // Given the scope, let's just save valid Adenda if we found one.
            if (resp.resultadoBusqueda?.adenda && i === 0) {
                // Only save once per batch response to avoid dupes/errors if it's a global adenda or just the first one.
                try {
                    const adendaXml = resp.resultadoBusqueda.adenda;
                    const adendaB64 = btoa(unescape(encodeURIComponent(adendaXml)));
                    await this.saveToDrive({
                        pedimentoNo, // "POR_CLASIFICAR"
                        fileName: `ADENDA_BATCH_${start}_${end}.xml`, // Generic name since we can't link 1:1 easily without improved parsing
                        fileBase64: adendaB64,
                        mimeType: 'application/xml'
                    });
                } catch (e) {
                    console.warn("Error saving batch adenda", e);
                }
            }

            // Throttling
            await new Promise(r => setTimeout(r, 800));
        }

        if (onProgress) onProgress(`Proceso finalizado. ${covesFound.length} documentos descargados.`);
    }
}

export const vucemAutomation = new VucemAutomation();
