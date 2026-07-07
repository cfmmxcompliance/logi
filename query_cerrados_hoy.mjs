import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Fetch all liberaciones created today
        const snap = await getDocs(collection(db, 'liberacionesCaja'));
        let docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Filter those created today
        docs = docs.filter(d => d.createdAt && d.createdAt.startsWith('2026-06-16'));
        
        console.log(`Total transportes cerrados HOY (2026-06-16) en Asignacion Diaria: ${docs.length}`);
        docs.forEach((d, i) => {
            console.log(`${i+1}. Caja: ${d.numeroCaja || 'N/A'}, FechaLiberacion: ${d.fechaLiberacion || 'N/A'}, Hora: ${d.createdAt.substring(11, 19)}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
