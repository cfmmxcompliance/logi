import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // 1. Get all 50 closed asignaciones del 17/06
    const asigSnap = await getDocs(query(collection(db, 'asignacion_cajas'), where('fecha', '==', '2026-06-17')));
    const asignaciones = asigSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const libSnap = await getDocs(query(
        collection(db, 'liberacionesCaja'),
        where('fechaLiberacion', '>=', '2026-06-17'),
        where('fechaLiberacion', '<=', '2026-06-17')
    ));
    const libs = libSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const asigIds = new Set(asignaciones.map(a => a.id));
    const closedLibs = libs.filter(l => asigIds.has(l.asignacionCajaId));

    console.log(`Cierres del 17/06: ${closedLibs.length}`);

    // 2. Get all sellos
    const sellosSnap = await getDocs(collection(db, 'sellos'));
    const allSellos = sellosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 3. For each closure, check if historico_expo has correct pickupDayCFM
    let fixed = 0;
    for (const lib of closedLibs) {
        const expId = `exp_${lib.asignacionCajaId}`;
        const existingDoc = await getDoc(doc(db, 'historico_expo', expId));
        
        // Get sello's fechaHoraRegistro for this asignacion
        const sello = allSellos.find(s => s.asignacionCajaId === lib.asignacionCajaId);
        const pickupDay = sello?.fechaHoraRegistro || lib.fechaHoraRegistro || lib.fechaLiberacion;
        
        if (!pickupDay) continue;

        // Check if the record needs fixing
        const existing = existingDoc.exists() ? existingDoc.data() : {};
        const currentPickup = (existing.pickupDayCFM || '').toString();
        const isJun17 = currentPickup.includes('17/6/2026') || currentPickup.includes('17/06/2026') || currentPickup.startsWith('2026-06-17');
        
        if (isJun17) continue; // Already correct

        const asig = asignaciones.find(a => a.id === lib.asignacionCajaId);
        
        // Get transport line info
        let transportLine = '';
        let team = asig?.carrierCodigo || '';
        const tId = asig?.transportLineId || asig?.transportLine || '';
        if (tId) {
            try {
                const tlDoc = await getDoc(doc(db, 'transport_lines', tId));
                if (tlDoc.exists()) {
                    transportLine = tlDoc.data().nombreSubLinea || tlDoc.data().TransportLine || tId;
                } else {
                    transportLine = tId;
                }
            } catch(_) { transportLine = tId; }
        }

        const record = {
            id: expId,
            trailer: lib.numeroCaja || asig?.numeroCaja || '',
            team,
            transportLine,
            pickupDayCFM: pickupDay,
            dodaUrl: existing.dodaUrl || '',
            entryUrl: existing.entryUrl || '',
            ...(existing.dodaUploadedAt ? { dodaUploadedAt: existing.dodaUploadedAt } : {}),
            ...(existing.entryUploadedAt ? { entryUploadedAt: existing.entryUploadedAt } : {}),
            dateRequested: existing.dateRequested || '',
            crossingDate: existing.crossingDate || '',
            dateReceived: existing.dateReceived || '',
            daysToReceive: existing.daysToReceive || '',
            cfmRef: existing.cfmRef || '',
            expDoda: existing.expDoda || '',
            comments: existing.comments || '',
            scacAndCaat: existing.scacAndCaat || '',
            createdAt: existing.createdAt || Date.now()
        };

        console.log(`FIX: ${asig?.numeroCaja} (${asig?.numeroOperacion}) | pickupDayCFM: "${currentPickup}" -> "${pickupDay}"`);
        await setDoc(doc(db, 'historico_expo', expId), record);
        fixed++;
    }

    console.log(`\nTotal corregidos: ${fixed}`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
