import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
    private dossierCache: Map<string, any[]> = new Map();

    private async uploadFile(data: any) {
        const functions = getFunctions(undefined, 'us-central1');
        const saveToDrive = httpsCallable(functions, 'saveFileToDriveV2');
        return saveToDrive(data);
    }

    private async getDossierItems(pedimentoNo: string): Promise<any[]> {
        if (this.dossierCache.has(pedimentoNo)) {
            return this.dossierCache.get(pedimentoNo) || [];
        }

        const dossierQuery = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
        const dossierSnap = await getDocs(dossierQuery);

        const items = !dossierSnap.empty ? (dossierSnap.docs[0].data().items || []) : [];
        this.dossierCache.set(pedimentoNo, items);
        return items;
    }

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

    private validateFinancialData(data: any) {
        const f = data?.financials || {};
        const errors = [];
        if (!f.prv || f.prv <= 0) errors.push("PRV (Prevalidación) no puede ser 0");
        if (!f.iva || f.iva <= 0) errors.push("Import VAT (IVA) no puede ser 0");
        if (!f.ivaPrv || f.ivaPrv < 53) errors.push("IVA/PRV debe ser al menos 53");

        let componentsSum = (f.igi || 0) + (f.dta || 0) + (f.iva || 0) + (f.prv || 0) + (f.ivaPrv || 0) + (f.cnt || 0);
        const total = f.efectivo || 0;
        let diff = Math.abs(total - componentsSum);

        if ((!f.prv || f.prv === 0) && (diff >= 309 && diff <= 331)) {
            f.prv = diff;
            componentsSum += diff;
            diff = Math.abs(total - componentsSum);
        }

        if ((!f.cnt || f.cnt === 0) && (diff >= 14 && diff <= 17)) {
            f.cnt = diff;
            componentsSum += diff;
            diff = Math.abs(total - componentsSum);
        }

        if (total > 0 && diff > 50) {
            errors.push(`SUMA INCORRECTA: Total(${total}) != Suma(${componentsSum}). Dif: ${diff}`);
        }

        if (errors.length > 0) {
            throw new Error(`REGLAS DE NEGOCIO VIOLADAS: ${errors.join(". ")}`);
        }
    }

    async processLocalXml(file: File, onProgress?: (msg: string) => void) {
        const xmlStr = await file.text();
        return this.processLocalFile(file.name, xmlStr, onProgress);
    }

    async processLocalFile(
        fileName: string,
        content: string | Uint8Array,
        onProgress?: (msg: string) => void,
        onDuplicate?: (fileName: string, pedimentoNo: string) => Promise<'replace' | 'skip' | 'replaceAll' | 'skipAll'>
    ) {
        const isXml = fileName.toLowerCase().endsWith('.xml');
        const isPdf = fileName.toLowerCase().endsWith('.pdf');

        if (isXml) {
            const xmlStr = typeof content === 'string' ? content : new TextDecoder().decode(content);
            const financials = parsePedimentoFinancials(xmlStr);
            let pedimentoNo = financials.pedimentoNum;

            if (!pedimentoNo) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlStr, "text/xml");
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

                const p15 = fileName.match(/(\d{2})[^\d]?(\d{2})[^\d]?(\d{4})[^\d]?(\d{7})/);
                const mcMatch = fileName.match(/MC(\d{4})-(\d{2})\s+(\d{7})/i);

                if (p15) {
                    pedimentoNo = `${p15[1]}${p15[2]}${p15[3]}${p15[4]}`;
                } else if (mcMatch) {
                    pedimentoNo = `${mcMatch[2]}64${mcMatch[1]}${mcMatch[3]}`;
                }

                const coveMatch = fileName.match(/_([A-Z0-9]{12,13})(?:_|\.|$)/i);
                if (!pedimentoNo && coveMatch) {
                    const eDocId = coveMatch[1];
                    if (onProgress) onProgress(`Identificado COVE/e-Doc por nombre: ${eDocId}`);
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
                    return eDocId;
                }

                if (!pedimentoNo) {
                    throw new Error(`Archivo XML no reconocido: ${fileName}.`);
                }
            }

            const cleanFinancials = JSON.parse(JSON.stringify(financials, (k, v) => v === undefined ? null : v));
            const items = await this.getDossierItems(pedimentoNo);
            const existingItem = items.find((it: any) => it.name === fileName);

            if (existingItem && onDuplicate) {
                const action = await onDuplicate(fileName, pedimentoNo);
                if (action === 'skip' || action === 'skipAll') return pedimentoNo;
            }

            const blob = new Blob([xmlStr], { type: 'application/xml' });
            const xmlBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(blob);
            });

            await this.uploadFile({
                pedimentoNo,
                fileName: fileName,
                fileBase64: xmlBase64,
                mimeType: 'application/xml'
            });

            if (pedimentoNo !== "POR_CLASIFICAR") {
                const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    await updateDoc(doc(db, 'electronic_dossiers', snapshot.docs[0].id), {
                        financials: cleanFinancials,
                        ataPort: cleanFinancials.fechaEntrada || "",
                        lastUpdate: new Date().toISOString(),
                        status: 'Complete'
                    });
                } else {
                    await addDoc(collection(db, 'electronic_dossiers'), {
                        numPedimento: pedimentoNo,
                        items: [{ name: fileName, url: '#', driveId: '', createdAt: new Date().toISOString() }],
                        financials: cleanFinancials,
                        lastUpdate: new Date().toISOString(),
                        status: 'Complete'
                    });
                }
            }
            return pedimentoNo;
        } else if (isPdf) {
            const blob = new Blob([content as any], { type: 'application/pdf' });
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(blob);
            });

            let pedimentoNo = "";
            let financials = null;
            const pattern7 = fileName.match(/(\d{7})/);
            const patternMC = fileName.match(/MC(\d{4})/i);

            if (pattern7) pedimentoNo = pattern7[1];
            else if (patternMC) pedimentoNo = `640${patternMC[1]}`;

            try {
                await new Promise(r => setTimeout(r, 1000));
                const data = await geminiService.fastExtractPedimento(base64, fileName);
                if (data.type === 'PEDIMENTO' && data.numPedimento) {
                    pedimentoNo = data.numPedimento.replace(/\s+/g, '');
                    financials = this.mapToFinancials(data, pedimentoNo);
                }
            } catch (err) { console.warn("AI failed:", err); }

            if (!pedimentoNo) {
                const reference = patternMC ? `MC${patternMC[1]}` : fileName.substring(0, 15);
                pedimentoNo = `POR_CLASIFICAR_${reference}`;
            }

            await this.uploadFile({
                pedimentoNo,
                fileName: fileName,
                fileBase64: base64,
                mimeType: 'application/pdf'
            });

            if (financials && !pedimentoNo.startsWith("POR_CLASIFICAR")) {
                const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', pedimentoNo));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    await updateDoc(doc(db, 'electronic_dossiers', snapshot.docs[0].id), {
                        financials: JSON.parse(JSON.stringify(financials, (k, v) => v === undefined ? null : v)),
                        status: 'Complete',
                        lastUpdate: new Date().toISOString()
                    });
                }
            }
            return pedimentoNo;
        }
    }

    async syncPedimentoToDrive(pedimento: PedimentoRecord, config: VucemConfig, onProgress?: (msg: string) => void) {
        await this.validateCredentialsLocally(config);
        const pedimentoNo = pedimento.pedimento;

        for (const coveRef of pedimento.coves || []) {
            try {
                const resp = await vucemService.consultarEdocument(coveRef.cove, config);
                if (resp.resultadoBusqueda?.cove) {
                    const coveData = resp.resultadoBusqueda.cove;
                    let finalPdfBase64 = "";
                    try {
                        finalPdfBase64 = await acusesService.consultarAcuse(coveRef.cove, config);
                    } catch (e) { }
                    if (!finalPdfBase64) finalPdfBase64 = generateCovePdf(coveData, 'base64') as string;

                    await this.uploadFile({
                        pedimentoNo,
                        fileName: `COVE_${coveRef.cove}.pdf`,
                        fileBase64: finalPdfBase64,
                        mimeType: 'application/pdf'
                    });
                }
            } catch (err) { console.error(`Error COVE ${coveRef.cove}:`, err); }
            await new Promise(r => setTimeout(r, 800));
        }

        for (const docRef of pedimento.digitalDocuments || []) {
            try {
                const resp = await vucemService.consultarEdocument(docRef.eDocument, config);
                let finalPdfBase64 = "";
                try {
                    finalPdfBase64 = await acusesService.consultarAcuse(docRef.eDocument, config);
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
            } catch (err) { console.error(`Error Doc ${docRef.eDocument}:`, err); }
            await new Promise(r => setTimeout(r, 800));
        }

        try {
            const patente = pedimento.patente || config.rfc.slice(0, 4);
            const xmlBase64 = await pedimentoService.consultarPedimentoCompleto(patente, "00", pedimentoNo, config);
            if (xmlBase64) {
                await this.uploadFile({ pedimentoNo, fileName: `PEDIMENTO_${pedimentoNo}.xml`, fileBase64: xmlBase64, mimeType: 'application/xml' });
            }
        } catch (e) { }
    }

    async syncDateRangeToDrive(start: string, end: string, config: VucemConfig, onProgress?: (msg: string) => void) {
        await this.validateCredentialsLocally(config);
        const resp = await vucemService.consultarEdocument({ start, end }, config);
        const coves = resp.resultadoBusqueda?.coves || [];
        for (let i = 0; i < coves.length; i++) {
            const cove = coves[i];
            let pdf = "";
            try { pdf = await acusesService.consultarAcuse(cove.eDocument, config); } catch (e) { }
            if (!pdf) pdf = generateCovePdf(cove, 'base64') as string;
            await this.uploadFile({ pedimentoNo: "POR_CLASIFICAR", fileName: `COVE_${cove.eDocument}.pdf`, fileBase64: pdf, mimeType: 'application/pdf' });
            await new Promise(r => setTimeout(r, 800));
        }
    }

    async reprocessDossier(pedimentoNo: string, onProgress?: (msg: string) => void) {
        const cleanId = pedimentoNo.replace(/\s+/g, '');
        try {
            const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', cleanId));
            const snap = await getDocs(q);
            if (snap.empty) return false;

            const dossiersSnapshot = await getDocs(collection(db, 'electronic_dossiers'));
            let dossierDoc = snap.docs[0];
            const allItems: any[] = [];
            let bestFinancials = dossierDoc.data().financials;

            for (const docSnap of snap.docs) {
                allItems.push(...(docSnap.data().items || []));
                if (!bestFinancials && docSnap.data().financials) bestFinancials = docSnap.data().financials;
                if (docSnap.id !== dossierDoc.id) await deleteDoc(doc(db, 'electronic_dossiers', docSnap.id));
            }

            const uniqueItems = this.deduplicateItems(allItems);
            const remainingItems: any[] = [];
            let moveCount = 0;

            const functions = getFunctions();
            const getFile = httpsCallable(functions, 'getFileFromDriveV2');

            for (let i = 0; i < uniqueItems.length; i++) {
                const item = uniqueItems[i];
                const isPdf = item.name.toLowerCase().endsWith('.pdf');
                const isAcuse = item.name.toLowerCase().includes('acuse');

                if (!isPdf || (isAcuse && !cleanId.includes('POR_CLASIFICAR'))) {
                    remainingItems.push(item);
                    continue;
                }

                if (onProgress) onProgress(`[${i + 1}/${uniqueItems.length}] Analizando: ${item.name}`);

                // A. HEURÍSTICA DE NOMBRE (Rápido, seguro y evita el error de Drive/IA)
                let detectedNo = "";
                const pattern7 = item.name.match(/(\d{7})/);
                // Si el nombre tiene algo como MC0232-26, extraemos el 0232 y le pegamos 640
                const patternMC = item.name.match(/MC(\d{4})/i);

                if (patternMC) {
                    detectedNo = `640${patternMC[1]}`;
                } else if (pattern7) {
                    detectedNo = pattern7[1];
                }

                // B. DESCARGA + IA (Si no tenemos pedimento O si nos faltan los datos financieros)
                let data: any = { type: 'UNKNOWN' };
                let financials: any = null;

                // Solo corremos IA en PDFs (no acuses) si el nombre es ambiguo 
                // O si el expediente destino actual está vacío de datos financieros
                if (!isAcuse && (!detectedNo || !bestFinancials || Object.keys(bestFinancials).length < 5)) {
                    try {
                        if (item.driveId) {
                            const res: any = await getFile({ fileId: item.driveId });
                            if (res.data?.success) {
                                try {
                                    data = await geminiService.fastExtractPedimento(res.data.fileBase64, item.name);
                                    if (data.type === 'PEDIMENTO') {
                                        // Si la IA encontró un número, ese manda (suele ser el de 15 dígitos)
                                        const aiNo = (data.numPedimento || "").replace(/\s+/g, '');
                                        if (aiNo) detectedNo = aiNo;

                                        financials = this.mapToFinancials(data, detectedNo);
                                        // Si encontramos buenos datos, los guardamos para el resto del proceso
                                        if (financials && financials.montoPagado > 0) {
                                            bestFinancials = financials;
                                        }
                                    }
                                } catch (e) { console.warn("IA falló:", item.name); }
                            }
                        }
                    } catch (e) { console.warn("Error descarga:", item.name); }
                }

                const isSameDossier = detectedNo === cleanId || (detectedNo && cleanId.endsWith(detectedNo));

                if (detectedNo && !isSameDossier) {
                    if (onProgress) onProgress(`[REPROCESO] 🚀 Moviendo a ${detectedNo}...`);

                    let snapNew = await getDocs(query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', detectedNo)));

                    if (snapNew.empty && detectedNo.length === 7) {
                        // Optimización: No buscar de nuevo si ya tenemos una lista de candidatos o si el volumen es bajo
                        const matchingDoc = dossiersSnapshot.docs.find(d => {
                            const fullNo = (d.data().numPedimento || "").replace(/\s+/g, '');
                            return fullNo.endsWith(detectedNo);
                        });
                        if (matchingDoc) {
                            // @ts-ignore
                            snapNew = { empty: false, docs: [matchingDoc], size: 1 };
                        }
                    }

                    const financials = this.mapToFinancials(data, detectedNo);
                    if (!snapNew.empty) {
                        const target = snapNew.docs[0];
                        const tData = target.data();
                        const existingItems = tData.items || [];
                        const newItems = this.deduplicateItems([...existingItems, item]);
                        await updateDoc(doc(db, 'electronic_dossiers', target.id), {
                            items: newItems,
                            financials: financials || tData.financials || null,
                            lastUpdate: new Date().toISOString()
                        });
                    } else {
                        await addDoc(collection(db, 'electronic_dossiers'), {
                            numPedimento: detectedNo,
                            items: [item],
                            financials: financials || null,
                            lastUpdate: new Date().toISOString(),
                            status: 'Complete'
                        });
                    }
                    moveCount++;
                } else {
                    remainingItems.push(item);
                }
                await new Promise(r => setTimeout(r, 600));
            }

            const finalItems = this.deduplicateItems(remainingItems);
            if (finalItems.length === 0 && moveCount > 0) {
                await deleteDoc(doc(db, 'electronic_dossiers', dossierDoc.id));
            } else {
                await updateDoc(doc(db, 'electronic_dossiers', dossierDoc.id), {
                    items: finalItems,
                    financials: bestFinancials || null,
                    lastUpdate: new Date().toISOString()
                });
            }
            return true;
        } catch (err) { throw err; }
    }

    private isGenericEDocument(name: string): boolean {
        const lower = name.toLowerCase();
        // Captura patrones como "3471166400235 1.pdf" o "0438261CII788.pdf" (e-documents)
        // Pero excluye explícitamente Facturas y BLs que ya tienen su propia regex
        if (this.isFactura(name) || this.isBL(name)) return false;

        return lower.includes('e-document') ||
            /\d{11,13}/.test(name) ||
            / \d{1,2}\.pdf$/.test(lower) ||
            /acuse/i.test(lower);
    }

    private isFactura(name: string): boolean {
        return /factura/i.test(name) || /invoice/i.test(name);
    }

    private isBL(name: string): boolean {
        return / bl/i.test(name) || /bill of lading/i.test(name) || /hbl/i.test(name) || /mbl/i.test(name);
    }

    public getDocType(name: string): string {
        const n = name.toLowerCase();

        // Strict Priority Order
        // 1. XMLs (Always explicit)
        if (n.endsWith('.xml')) return 'XML';

        // 2. Specialized Documents (Regex based)
        if (this.isFactura(n)) return 'FACT';
        if (this.isBL(n)) {
            if (n.includes('hbl')) return 'HBL';
            if (n.includes('mbl')) return 'MBL';
            return 'BL';
        }

        // 3. Official VUCEM/Customs Documents
        if (n.includes('acuse')) return 'ACUSE';
        if (n.includes('ped_sim') || n.includes('pedimento_sim')) return 'PED-S';

        // 4. Pedimento Completo (Dossier)
        // STRICT: Must match D- pattern or explicit 'pedimento' name, but NOT be a simplificado
        if ((n.includes('d-') && n.includes('ped.pdf')) || n.includes('_ped_')) return 'PED-C';
        if (n.includes('pedimento') && !n.includes('sim')) return 'PED-C';

        // 5. Logistics Misc
        if (n.includes('carta') || n.includes('instrucc')) return 'CARTA';
        if (n.includes('lista') || n.includes('packing')) return 'LISTA';
        if (n.includes('editorial')) return 'EDIT';

        // 6. Generic E-Documents (Last Resort)
        // Must contain "e-document" or match the digit pattern 0000.pdf
        if (this.isGenericEDocument(n)) return 'EDOC';

        return 'DOC';
    }

    private deduplicateItems(items: any[]) {
        const seen = new Set();
        return items.filter(it => {
            const id = it.driveId || it.name;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    async deleteDossier(pedimentoNo: string, onProgress?: (msg: string) => void) {
        const cleanId = pedimentoNo.replace(/\s+/g, '');
        try {
            if (onProgress) onProgress(`[ELIMINAR] Buscando expediente ${cleanId}...`);
            const q = query(collection(db, 'electronic_dossiers'), where('numPedimento', '==', cleanId));
            const snap = await getDocs(q);

            if (snap.empty) {
                if (onProgress) onProgress(`ℹ️ No se encontró el expediente ${pedimentoNo}.`);
                return false;
            }

            const functions = getFunctions();
            const deleteFile = httpsCallable(functions, 'deleteFileFromDriveV2');

            for (const dossierDoc of snap.docs) {
                const data = dossierDoc.data();
                const items = data.items || [];

                if (onProgress) onProgress(`[ELIMINAR] Limpiando ${items.length} archivos de Drive...`);

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.driveId) {
                        try {
                            if (onProgress) onProgress(`[ELIMINAR] [${i + 1}/${items.length}] Borrando ${item.name}...`);
                            await deleteFile({ fileId: item.driveId });
                        } catch (e) {
                            console.warn(`No se pudo borrar archivo ${item.name} de Drive:`, e);
                        }
                    }
                }

                if (onProgress) onProgress(`[ELIMINAR] Borrando registro de Firebase...`);
                await deleteDoc(doc(db, 'electronic_dossiers', dossierDoc.id));
            }

            if (onProgress) onProgress(`✅ Expediente ${cleanId} eliminado totalmente.`);
            return true;
        } catch (err: any) {
            console.error("ERROR EN ELIMINACIÓN:", err);
            if (onProgress) onProgress(`❌ Error: ${err.message || "Error desconocido"}`);
            throw err;
        }
    }

    private mapToFinancials(data: any, pedimentoNo: string) {
        if (data.type !== 'PEDIMENTO') return null;
        return {
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
            supplierName: data.proveedor?.nombre || "",
            supplierTaxId: data.proveedor?.idFiscal || "",
            supplierCountry: ""
        };
    }
}

export const vucemAutomation = new VucemAutomation();
