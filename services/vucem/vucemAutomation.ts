import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { geminiService } from '../geminiService';
import { VucemConfig } from './types';
import { vucemService } from './vucemService';
import { acusesService } from './acusesService';
import { pedimentoService } from './pedimentoService';
import { generateCovePdf } from '../../utils/vucemPdfGenerator';
import { parsePedimentoFinancials } from '../../utils/xmlFinancialParser';
import { PedimentoRecord } from '../../types';

export class VucemAutomation {
    private async uploadFile(data: any) {
        const functions = getFunctions();
        const saveToDrive = httpsCallable(functions, 'saveFileToExpediente');
        return saveToDrive(data);
    }

    // EL CANDADO DE SEGURIDAD LOCAL (Zero-Risk Auth)
    private async validateCredentialsLocally(config: VucemConfig): Promise<boolean> {
        try {
            const { readPrivateKey } = await import('./cryptoUtils');
            if (config.keyFile) {
                await readPrivateKey(config.keyFile, config.password);
            }
            return true;
        } catch (e) {
            console.error("Fallo de seguridad local:", e);
            throw new Error("CONTRASEÑA INCORRECTA: Se bloqueó el intento localmente para proteger tu FIEL.");
        }
    }

    /**
     * Valida que la extracción de Gemini cumpla con las reglas de negocio críticas.
     */
    private validateFinancialData(data: any) {
        const f = data?.financials || {};
        const errors = [];

        // 1. Reglas Individuales
        if (!f.prv || f.prv <= 0) errors.push("PRV (Prevalidación) no puede ser 0");
        if (!f.iva || f.iva <= 0) errors.push("Import VAT (IVA) no puede ser 0");
        if (!f.ivaPrv || f.ivaPrv < 53) errors.push("IVA/PRV debe ser al menos 53");

        // 2. Validación de Suma (Holística) y AUTO-REPARACIÓN
        // Efectivo debe ser aproximadamente la suma de los conceptos
        let componentsSum = (f.igi || 0) + (f.dta || 0) + (f.iva || 0) + (f.prv || 0) + (f.ivaPrv || 0) + (f.cnt || 0);
        const total = f.efectivo || 0;
        let diff = Math.abs(total - componentsSum);

        // INTENTO DE AUTO-REPARACIÓN DE PRV
        // Si falta PRV y la diferencia es exactamente una cuota estándar (330, 310, 240), asumimos que es PRV.
        if ((!f.prv || f.prv === 0) && (diff >= 309 && diff <= 331)) {
            console.log(`[AUTO-FIX] Detectada falta de PRV. Rellenando con ${diff} basado en suma total.`);
            f.prv = diff;
            componentsSum += diff; // Actualizar suma
            diff = Math.abs(total - componentsSum); // Recalcular diferencia (debería ser 0)
        }

        // INTENTO DE AUTO-REPARACIÓN DE CNT (Contraprestación)
        // A veces es ~15 o ~16 pesos y el AI lo ignora por pequeño.
        if ((!f.cnt || f.cnt === 0) && (diff >= 14 && diff <= 17)) {
            console.log(`[AUTO-FIX] Detectada falta de CNT. Rellenando con ${diff}.`);
            f.cnt = diff;
            componentsSum += diff;
            diff = Math.abs(total - componentsSum);
        }

        // Re-validar Suma después de intentos de reparación
        if (total > 0 && diff > 50) {
            errors.push(`SUMA INCORRECTA: Total(${total}) != Suma(${componentsSum}). Dif: ${diff}`);
        }

        // Re-validar Reglas Individuales después de reparación
        if (!f.prv || f.prv <= 0) errors.push("PRV (Prevalidación) no puede ser 0");
        if (!f.iva || f.iva <= 0) errors.push("Import VAT (IVA) no puede ser 0");

        if (errors.length > 0) {
            throw new Error(`REGLAS DE NEGOCIO VIOLADAS: ${errors.join(". ")}`);
        }
    }

    /**
     * PROCESAMIENTO OFFLINE (VUCEM-Free)
     * Lee un XML local, extrae financieros y lo sube a Drive.
     */
    async processLocalXml(file: File, onProgress?: (msg: string) => void) {
        const xmlStr = await file.text();
        return this.processLocalFile(file.name, xmlStr, onProgress);
    }

    /**
     * Motor de procesamiento de archivos individuales (Independiente del origen)
     */
    async processLocalFile(fileName: string, content: string | Uint8Array, onProgress?: (msg: string) => void) {
        const isXml = fileName.toLowerCase().endsWith('.xml');
        const isPdf = fileName.toLowerCase().endsWith('.pdf');

        if (isXml) {
            const xmlStr = typeof content === 'string' ? content : new TextDecoder().decode(content);
            const financials = parsePedimentoFinancials(xmlStr);
            const pedimentoNo = financials.pedimentoNum;

            if (!pedimentoNo) {
                // Si no es pedimento, checamos si es COVE
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlStr, "text/xml");

                // Busqueda agnóstica de namespace para eDocument o cove
                let eDoc = "";
                const allElements = doc.getElementsByTagName("*");
                for (let i = 0; i < allElements.length; i++) {
                    const localName = allElements[i].localName.toLowerCase();
                    if (localName === 'edocument' || localName === 'cove') {
                        eDoc = allElements[i].textContent || "";
                        break;
                    }
                }

                if (eDoc) {
                    if (onProgress) onProgress(`Procesando COVE ${eDoc}...`);
                    // Subida de COVE (Codificación robusta para binarios/especiales)
                    const blob = new Blob([xmlStr], { type: 'application/xml' });
                    const xmlBase64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(blob);
                    });

                    await this.uploadFile({
                        pedimentoNo: "POR_CLASIFICAR",
                        fileName: fileName,
                        fileBase64: xmlBase64,
                        mimeType: 'application/xml'
                    });
                    return eDoc;
                }
                throw new Error(`Archivo XML no reconocido: ${fileName}. No se encontró número de pedimento ni COVE.`);
            }

            if (onProgress) onProgress(`Procesando Pedimento ${pedimentoNo}...`);

            // 1. Subir a Drive (Codificación robusta)
            const blob = new Blob([xmlStr], { type: 'application/xml' });
            const xmlBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = () => reject(new Error("Error al convertir XML a Base64"));
                reader.readAsDataURL(blob);
            });

            await this.uploadFile({
                pedimentoNo,
                fileName: fileName,
                fileBase64: xmlBase64,
                mimeType: 'application/xml'
            });

            // 2. Indexar en Firestore
            const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const dossierDoc = snapshot.docs[0];
                await updateDoc(doc(db, 'electronic_dossiers', dossierDoc.id), {
                    financials,
                    ataPort: financials.fechaEntrada || "",
                    lastUpdate: new Date().toISOString(),
                    status: 'Complete'
                });
            } else {
                await addDoc(collection(db, 'electronic_dossiers'), {
                    numPedimento: pedimentoNo,
                    ataPort: financials.fechaEntrada || "",
                    items: [{
                        name: fileName,
                        url: '#',
                        driveId: '',
                        createdAt: new Date().toISOString()
                    }],
                    financials,
                    lastUpdate: new Date().toISOString(),
                    status: 'Complete'
                });
            }
            return pedimentoNo;
        } else if (isPdf) {
            // Manejo de PDFs (Pago, Acuse, etc)
            if (onProgress) onProgress(`Aislando Página 1 de: ${fileName}...`);

            // 0. Convertir a Base64 de forma segura
            const blob = new Blob([content as any], { type: 'application/pdf' });
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = (e) => reject(new Error(`Error leyendo binario de PDF: ${e}`));
                reader.readAsDataURL(blob);
            });

            // 1. Intentar detectar si es un Pedimento y extraer datos si es necesario
            let pedimentoNo = "POR_CLASIFICAR";
            let financials = null;

            try {
                if (onProgress) onProgress(`Consultando Gemini AI (Portada) para: ${fileName}...`);
                const data = await geminiService.fastExtractPedimento(base64);

                if (data.type === 'PEDIMENTO' && data.numPedimento) {
                    this.validateFinancialData(data); // <--- REGLAS DE NEGOCIO OBLIGATORIAS
                    pedimentoNo = data.numPedimento.replace(/\s+/g, ''); // Normalizar ID
                    if (onProgress) onProgress(`✅ Pedimento ${pedimentoNo} detectado por AI.`);
                    financials = {
                        pedimentoNum: pedimentoNo,
                        clavePedimento: data.cvePedimento || "",
                        fechaPago: data.financials?.pago || "",
                        fechaEntrada: data.financials?.entrada || "",
                        montoPagado: data.financials?.efectivo || 0,
                        lineaCaptura: data.lineaCaptura || data.financials?.selloBancario || "",
                        valorAduana: data.financials?.valorAduana || 0,
                        banco: data.financials?.banco || "",
                        dta: data.financials?.dta || 0,
                        igi: data.financials?.igi || 0,
                        igiTotal: data.financials?.igi || 0,
                        iva: data.financials?.iva || 0,
                        prv: data.financials?.prv || 0,
                        ivaPrv: data.financials?.ivaPrv || 0,
                        cnt: data.financials?.cnt || 0,
                        isFixedAsset: data.fixedAssets || false,
                        supplierName: data.importador?.nombre || "",
                        supplierTaxId: data.importador?.rfc || "",
                        supplierCountry: ""
                    };
                } else if (data.type === 'COVE' && data.eDocument) {
                    if (onProgress) onProgress(`📄 Documento identificado como COVE: ${data.eDocument}`);
                } else {
                    if (onProgress) onProgress(`ℹ️ Archivo no identificado as Pedimento/COVE, subiendo como genérico...`);
                }
            } catch (err) {
                console.warn("Fast AI Extraction failed/slow:", err);
                if (onProgress) onProgress(`⚠️ Falló extracción IA (tardará más en reportes).`);
            }

            // Delay estratégico para evitar 429 (Rate Limit) en procesos masivos
            await new Promise(r => setTimeout(r, 1000));

            if (onProgress) onProgress(`Subiendo archivo a Drive...`);
            try {
                await this.uploadFile({
                    pedimentoNo,
                    fileName: fileName,
                    fileBase64: base64,
                    mimeType: 'application/pdf'
                });
            } catch (err: any) {
                console.error("Error subiendo PDF a Drive:", err);
                const detail = err.message || "Error desconocido";
                throw new Error(`Fallo subida a Drive: ${fileName}. Detalle: ${detail}`);
            }

            // 2. Si extrajimos financieros, indexar en Firestore
            if (financials && pedimentoNo !== "POR_CLASIFICAR") {
                try {
                    const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        await updateDoc(doc(db, 'electronic_dossiers', snapshot.docs[0].id), {
                            financials,
                            ataPort: financials.fechaEntrada || "",
                            isFixedAsset: financials.isFixedAsset || false,
                            lastUpdate: new Date().toISOString(),
                            status: 'Complete'
                        });
                    } else {
                        await addDoc(collection(db, 'electronic_dossiers'), {
                            numPedimento: pedimentoNo,
                            ataPort: financials.fechaEntrada || "",
                            items: [{
                                name: fileName,
                                url: '#',
                                driveId: '',
                                createdAt: new Date().toISOString()
                            }],
                            financials,
                            isFixedAsset: financials.isFixedAsset || false,
                            lastUpdate: new Date().toISOString(),
                            status: 'Complete'
                        });
                    }
                } catch (err) {
                    console.error("Error indexando PDF en Firestore:", err);
                }
            }

            return pedimentoNo;
        }
    }

    async syncPedimentoToDrive(pedimento: PedimentoRecord, config: VucemConfig, onProgress?: (msg: string) => void) {
        if (onProgress) onProgress("Verificando integridad de credenciales (Local)...");
        await this.validateCredentialsLocally(config);

        const pedimentoNo = pedimento.pedimento;

        for (const coveRef of pedimento.coves || []) {
            try {
                if (onProgress) onProgress(`Consultando COVE ${coveRef.cove}...`);
                const resp = await vucemService.consultarEdocument(coveRef.cove, config);

                if (resp.resultadoBusqueda?.cove) {
                    const coveData = resp.resultadoBusqueda.cove;
                    let finalPdfBase64 = "";
                    let isOfficial = false;

                    try {
                        const officialPdf = await acusesService.consultarAcuse(coveRef.cove, config);
                        if (officialPdf) {
                            finalPdfBase64 = officialPdf;
                            isOfficial = true;
                            if (onProgress) onProgress(`✅ Acuse Oficial descargado para ${coveRef.cove}`);
                        }
                    } catch (e) { console.warn(`No acuse for ${coveRef.cove}`); }

                    if (!finalPdfBase64) finalPdfBase64 = generateCovePdf(coveData, 'base64') as string;

                    await this.uploadFile({
                        pedimentoNo,
                        fileName: `COVE_${coveRef.cove}${isOfficial ? '_OFICIAL' : ''}.pdf`,
                        fileBase64: finalPdfBase64,
                        mimeType: 'application/pdf'
                    });

                    if (resp.resultadoBusqueda.adenda) {
                        try {
                            const adendaXml = resp.resultadoBusqueda.adenda;
                            const adendaB64 = btoa(unescape(encodeURIComponent(adendaXml)));
                            await this.uploadFile({
                                pedimentoNo,
                                fileName: `ADENDA_COVE_${coveRef.cove}.xml`,
                                fileBase64: adendaB64,
                                mimeType: 'application/xml'
                            });
                        } catch (err) { console.warn(`Error adenda ${coveRef.cove}`, err); }
                    }
                }
            } catch (err: any) {
                console.error(`Error COVE ${coveRef.cove}:`, err);
                const errMsg = (err.message || "").toLowerCase();
                if (errMsg.includes('auth') || errMsg.includes('firm') || errMsg.includes('password')) {
                    throw new Error(`ABORTADO POR SEGURIDAD: Autenticación.`);
                }
            }
            await new Promise(r => setTimeout(r, 800));
        }

        for (const docRef of pedimento.digitalDocuments || []) {
            try {
                if (onProgress) onProgress(`Procesando Documento ${docRef.eDocument}...`);
                const resp = await vucemService.consultarEdocument(docRef.eDocument, config);
                let finalPdfBase64 = "";
                try {
                    const officialPdf = await acusesService.consultarAcuse(docRef.eDocument, config);
                    if (officialPdf) finalPdfBase64 = officialPdf;
                } catch (e) { }

                if (!finalPdfBase64 && resp.resultadoBusqueda?.cove) {
                    finalPdfBase64 = generateCovePdf(resp.resultadoBusqueda.cove, 'base64') as string;
                }

                if (finalPdfBase64) {
                    await this.uploadFile({
                        pedimentoNo,
                        fileName: `DOC_${docRef.eDocument}.pdf`,
                        fileBase64: finalPdfBase64,
                        mimeType: 'application/pdf'
                    });
                }
            } catch (err: any) {
                console.error(`Error Doc ${docRef.eDocument}:`, err);
                const errMsg = (err.message || "").toLowerCase();
                if (errMsg.includes('auth') || errMsg.includes('firm')) throw new Error(`ABORTADO.`);
            }
            await new Promise(r => setTimeout(r, 800));
        }
        try {
            const patente = pedimento.patente || config.rfc.slice(0, 4);
            const aduana = pedimento.seccion ? pedimento.seccion.substring(0, 2) : "00";
            const xmlBase64 = await pedimentoService.consultarPedimentoCompleto(patente, aduana, pedimentoNo, config);

            if (xmlBase64) {
                await this.uploadFile({
                    pedimentoNo,
                    fileName: `PEDIMENTO_${pedimentoNo}_FULL.xml`,
                    fileBase64: xmlBase64,
                    mimeType: 'application/xml'
                });

                try {
                    const xmlStr = atob(xmlBase64);
                    const financials = parsePedimentoFinancials(xmlStr);
                    const { getFirestore, doc, setDoc } = await import('firebase/firestore');
                    const { db } = await import('../../services/firebaseConfig');

                    if (pedimento.id) {
                        const dossierRef = doc(db, 'electronic_dossiers', pedimento.id);
                        await setDoc(dossierRef, {
                            financials,
                            status: 'Complete',
                            lastUpdate: new Date().toISOString()
                        }, { merge: true });
                    }
                } catch (e) { }
            }
        } catch (e) { console.error(`Error syncing Pedimento XML`, e); }
    }

    async syncDateRangeToDrive(start: string, end: string, config: VucemConfig, onProgress?: (msg: string) => void) {
        if (onProgress) onProgress("Verificando integridad de credenciales (Local)...");
        await this.validateCredentialsLocally(config);

        if (onProgress) onProgress(`Consultando VUCEM del ${start} al ${end}...`);
        const resp = await vucemService.consultarEdocument({ start, end }, config);
        const covesFound = resp.resultadoBusqueda?.coves || [];

        if (covesFound.length === 0) {
            if (onProgress) onProgress("No se encontraron documentos.");
            return;
        }

        for (let i = 0; i < covesFound.length; i++) {
            const coveData = covesFound[i];
            const eDoc = coveData.eDocument;
            const pedimentoNo = "POR_CLASIFICAR";

            if (onProgress) onProgress(`[${i + 1}/${covesFound.length}] Procesando COVE ${eDoc}...`);

            let finalPdfBase64 = "";
            let isOfficial = false;
            try {
                const officialPdf = await acusesService.consultarAcuse(eDoc, config);
                if (officialPdf) {
                    finalPdfBase64 = officialPdf;
                    isOfficial = true;
                }
            } catch (e) { }

            if (!finalPdfBase64) finalPdfBase64 = generateCovePdf(coveData, 'base64') as string;

            await this.uploadFile({
                pedimentoNo,
                fileName: `COVE_${eDoc}${isOfficial ? '_OFICIAL' : ''}.pdf`,
                fileBase64: finalPdfBase64,
                mimeType: 'application/pdf'
            });

            if (resp.resultadoBusqueda?.adenda && i === 0) {
                try {
                    const adendaXml = resp.resultadoBusqueda.adenda;
                    const adendaB64 = btoa(unescape(encodeURIComponent(adendaXml)));
                    await this.uploadFile({
                        pedimentoNo,
                        fileName: `ADENDA_BATCH_${start}_${end}.xml`,
                        fileBase64: adendaB64,
                        mimeType: 'application/xml'
                    });
                } catch (e) { }
            }
            await new Promise(r => setTimeout(r, 800));
        }
    }

    /**
     * REPROCESAMIENTO DE EXPEDIENTE EXISTENTE (Drive -> Gemini -> Firestore)
     */
    async reprocessDossier(pedimentoNo: string, onProgress?: (msg: string) => void) {
        const cleanId = pedimentoNo.replace(/\s+/g, ''); // Normalizar (quitar espacios)
        try {
            if (onProgress) onProgress(`[REPROCESO] Localizando ${cleanId} en Firestore...`);

            const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', cleanId));
            const snap = await getDocs(q);

            // Si no lo encuentra con el ID limpio, intentar con el original por si acaso
            let dossierDoc = snap.empty ? null : snap.docs[0];
            if (!dossierDoc) {
                const qOrig = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
                const snapOrig = await getDocs(qOrig);
                if (!snapOrig.empty) dossierDoc = snapOrig.docs[0];
            }

            if (!dossierDoc) throw new Error(`Expediente ${pedimentoNo} no encontrado en Base de Datos.`);

            const dossierData = dossierDoc.data();
            const items = dossierData.items || [];

            // 1. Encontrar el PDF del pedimento (Identificación inteligente)
            if (onProgress) onProgress(`[DEBUG] Buscando PDF original entre ${items.length} archivos...`);
            console.log("Archivos disponibles:", items.map((i: any) => i.name));

            const pdfItem = items.find((it: any) =>
                it.name.toLowerCase().includes('pedimento') ||
                it.name.toLowerCase().includes('full') ||
                (it.name.toLowerCase().endsWith('.pdf') && !it.name.toLowerCase().includes('acuse'))
            );

            if (!pdfItem || !pdfItem.driveId) {
                throw new Error("No se encontró el PDF ORIGINAL en el expediente (revisa que el nombre diga 'pedimento').");
            }

            if (onProgress) onProgress(`[REPROCESO] Descargando desde Drive...`);

            // 2. Descargar de Drive vía Cloud Function
            const functions = getFunctions();
            const getFile = httpsCallable(functions, 'getFileFromDrive');
            const fileResp: any = await getFile({ fileId: pdfItem.driveId });

            if (!fileResp.data?.success || !fileResp.data?.fileBase64) {
                throw new Error("Error de conexión con Google Drive al descargar el PDF.");
            }

            const base64 = fileResp.data.fileBase64;

            // 3. Ejecutar nueva extracción con Gemini
            if (onProgress) onProgress(`[REPROCESO] Re-analizando con Gemini 2.0...`);
            const data = await geminiService.fastExtractPedimento(base64);

            if (!data || data.type === 'UNKNOWN') {
                throw new Error(`Gemini no pudo identificar el documento como Pedimento (Asegúrate que el PDF sea legible).`);
            }

            // Validar Reglas de Negocio (PRV, IVA, etc)
            try {
                this.validateFinancialData(data);
            } catch (vErr: any) {
                throw new Error(`FALLO DE DATOS: ${vErr.message}`);
            }

            // 4. Mapear y actualizar en Firestore
            const financials = {
                pedimentoNum: data.numPedimento || pedimentoNo,
                clavePedimento: data.cvePedimento || "",
                fechaPago: data.financials?.pago || "",
                fechaEntrada: data.financials?.entrada || "",
                montoPagado: data.financials?.efectivo || 0,
                lineaCaptura: data.lineaCaptura || data.financials?.selloBancario || "",
                valorAduana: data.financials?.valorAduana || 0,
                banco: data.financials?.banco || "",
                dta: data.financials?.dta || 0,
                igi: data.financials?.igi || 0,
                igiTotal: data.financials?.igi || 0,
                iva: data.financials?.iva || 0,
                prv: data.financials?.prv || 0,
                ivaPrv: data.financials?.ivaPrv || 0,
                cnt: data.financials?.cnt || 0,
                isFixedAsset: data.fixedAssets || false,
                supplierName: data.importador?.nombre || "",
                supplierTaxId: data.importador?.rfc || "",
                supplierCountry: ""
            };

            if (onProgress) onProgress(`[REPROCESO] Actualizando registros financieros...`);

            await updateDoc(doc(db, 'electronic_dossiers', dossierDoc.id), {
                financials,
                isFixedAsset: financials.isFixedAsset || false,
                lastUpdate: new Date().toISOString()
            });

            if (onProgress) onProgress(`✅ Reproceso completado para ${pedimentoNo}.`);
            return true;
        } catch (err: any) {
            console.error("ERROR EN REPROCESO:", err);
            throw err;
        }
    }
}

export const vucemAutomation = new VucemAutomation();
