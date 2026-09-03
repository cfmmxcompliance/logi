import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function executeRestore() {
    console.log("Starting restoration process...");
    
    // 1. Get the current document which was overwritten (SNLU142065)
    const docRef = db.collection('asignacion_cajas').doc('TL00120260903');
    const overwrittenSnap = await docRef.get();
    
    if (!overwrittenSnap.exists) {
        console.error("The document TL00120260903 doesn't exist anymore!");
        return;
    }
    
    const overwrittenData = overwrittenSnap.data();
    console.log("Current data in TL00120260903 (should be SNLU142065):", overwrittenData.numeroCaja);
    
    // 2. Find the max TL for 2026-09-03
    const q = db.collection('asignacion_cajas').where('fecha', '==', '2026-09-03');
    const asigs = await q.get();
    let maxNum = 0;
    asigs.forEach(doc => {
        const d = doc.data();
        const match = (d.numeroOperacion || '').match(/^TL(\d+)$/);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
        }
    });
    const nextTLNum = maxNum + 1;
    const newOp = `TL${String(nextTLNum).padStart(3, '0')}`;
    const newDocId = `${newOp}20260903`;
    
    console.log(`Max TL was TL${String(maxNum).padStart(3, '0')}. Moving SNLU142065 to ${newOp} (ID: ${newDocId})`);
    
    // 3. Move the overwritten data to a new document so we don't lose it
    const newDocData = {
        ...overwrittenData,
        id: newDocId,
        numeroOperacion: newOp,
        customId: `${newDocId}${overwrittenData.carrierCodigo || ''}${overwrittenData.scac || ''}`
    };
    
    await db.collection('asignacion_cajas').doc(newDocId).set(newDocData);
    console.log(`Successfully created new document for SNLU142065.`);
    
    // 4. Recreate the original TL00120260903 (UL53814)
    const originalData = {
        id: 'TL00120260903',
        customId: 'TL00120260903ARCBTQLA',
        numeroOperacion: 'TL001',
        fecha: '2026-09-03',
        numeroCaja: 'UL53814',
        carrierCodigo: 'ARCB',
        subLinea: 'SDM LOGISTICS',
        scac: 'TQLA',
        nombreDriver: 'Rolando Rodríguez Hernández',
        driverId: 'ARC011', // Based on carrierRef 
        carrierRef: 'ARC011',
        vehiculos: '4',
        layoutUrl: 'https://docs.google.com/spreadsheets/d/12IweTo-cH9kaGY2TbVH5l-ffvCN4a4q5/edit?usp=drivesdk&ouid=107501428824783577035&rtpof=true&sd=true',
        layoutFileName: 'LAY OUT CCP_CFM-26CFTTN-644229-16_UL53814.xlsx',
        layoutUploadedBy: 'kristian.kelly@cfmoto.com',
        layoutUploadedAt: '2026-09-03T14:57:07.394Z',
        ccpUrl: 'https://drive.google.com/file/d/1r7DI6_7hEDBENgESyohYVWzf8lL5eTxQ/view?usp=drivesdk',
        ccpFileName: 'TRA2888.pdf',
        ccpUploadedBy: 'arcbest@tql.com',
        ccpUploadedAt: '2026-09-03T15:14:01.500Z',
        cfmRef: 'CFM-26CFTTN-644229-16_UL53814',
        placasTracto: ' ',
        horaAsignacion: '08:00',
        createdBy: 'arcbestmx@tql.com', // Typically created by the carrier
        createdAt: '2026-09-03T14:57:07.394Z',
        updatedAt: new Date().toISOString()
    };
    
    await db.collection('asignacion_cajas').doc('TL00120260903').set(originalData);
    console.log("Successfully restored original document TL00120260903 (UL53814).");
    
    console.log("Restoration complete!");
}

executeRestore().then(() => process.exit(0)).catch(console.error);
