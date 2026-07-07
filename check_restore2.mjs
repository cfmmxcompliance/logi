import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, where, limit } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Get one broken record
        const snap = await getDocs(query(collection(db, 'historico_expo'), where('pickupDayCFM', '>=', '2026-06-17'), limit(5)));
        for (const d of snap.docs) {
            const data = d.data();
            console.log(`\nBroken Record: Trailer ${data.trailer}, ID ${d.id}`);
            
            // Check if it's an exp_ id
            if (d.id.startsWith('exp_')) {
                const asigId = d.id.replace('exp_', '');
                const asigDoc = await getDoc(doc(db, 'asignacion_cajas', asigId));
                if (asigDoc.exists()) {
                    console.log(`  Found in asignacion_cajas! Fecha: ${asigDoc.data().fecha}`);
                } else {
                    console.log(`  NOT found in asignacion_cajas.`);
                }
            } else {
                // Try finding by trailer in asignacion_cajas
                const q = query(collection(db, 'asignacion_cajas'), where('numeroCaja', '==', data.trailer), limit(1));
                const asigSnap = await getDocs(q);
                if (!asigSnap.empty) {
                     console.log(`  Found by trailer in asignacion_cajas! Fecha: ${asigSnap.docs[0].data().fecha}`);
                } else {
                     console.log(`  NOT found by trailer.`);
                }
            }
            
            // Try finding in sellos
            const qs = query(collection(db, 'sellos'), where('numeroCaja', '==', data.trailer), limit(1));
            const selloSnap = await getDocs(qs);
            if (!selloSnap.empty) {
                console.log(`  Found in sellos! FechaRegistro: ${selloSnap.docs[0].data().fechaHoraRegistro}`);
            } else {
                console.log(`  NOT found in sellos.`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
