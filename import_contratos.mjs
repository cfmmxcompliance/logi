import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";
import fs from 'fs';
import * as xlsx from 'xlsx'; // Rely on the locally installed 'xlsx' package

const configContent = fs.readFileSync('./services/firebaseConfig.ts', 'utf8');
const apiKeyMatch = configContent.match(/apiKey:\s*"([^"]+)"/);
const authDomainMatch = configContent.match(/authDomain:\s*"([^"]+)"/);
const projectIdMatch = configContent.match(/projectId:\s*"([^"]+)"/);

const config = {
    apiKey: apiKeyMatch?.[1],
    authDomain: authDomainMatch?.[1],
    projectId: projectIdMatch?.[1]
};

const app = initializeApp(config);
const db = getFirestore(app);

async function importExcel() {
    console.log("📥 Leyendo archivo Excel CONTRATOS-BL.xlsx...");
    const fileBuffer = fs.readFileSync('./CONTRATOS-BL.xlsx');
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Map by normalized BL
    // Columns: 'Contrato', 'Número de factura', 'BL'
    const excelMap = new Map();
    let rowsProcessed = 0;
    
    data.forEach(row => {
        if (row['BL'] && row['Número de factura']) {
            const normalizedBL = String(row['BL']).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            excelMap.set(normalizedBL, {
                invoiceNo: String(row['Número de factura']).trim(),
                contracto: row['Contrato'] ? String(row['Contrato']).trim() : null
            });
            rowsProcessed++;
        }
    });

    console.log(`✅ ${rowsProcessed} registros válidos encontrados en el Excel.`);

    const trackingSnap = await getDocs(collection(db, 'vessel_tracking'));
    let toUpdate = 0;
    const batch = writeBatch(db);

    trackingSnap.forEach(d => {
        const tData = d.data();
        if (tData.blNo) {
            const normalizedBL = tData.blNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const mapping = excelMap.get(normalizedBL);
            
            if (mapping) {
                const updates = {};
                if (!tData.invoiceNo || tData.invoiceNo.trim() === '') {
                    updates.invoiceNo = mapping.invoiceNo;
                }
                if (mapping.contracto && (!tData.contractNo || tData.contractNo.trim() === '')) {
                    updates.contractNo = mapping.contracto;
                }
                
                if (Object.keys(updates).length > 0) {
                    batch.update(doc(db, 'vessel_tracking', d.id), updates);
                    toUpdate++;
                }
            }
        }
    });

    if (toUpdate > 0) {
        console.log(`\n⏳ Ejecutando actualización en Firebase para ${toUpdate} documentos de Vessel Tracking...`);
        await batch.commit();
        console.log("✅ ¡Actualización de base de datos terminada!");
    } else {
        console.log("\n✅ Todos los registros ya estaban actualizados o no se encontraron BLs enlazables.");
    }
}

importExcel().catch(console.error);
