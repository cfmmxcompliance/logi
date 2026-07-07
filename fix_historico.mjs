import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Fetch all liberaciones created today
        const snapLib = await getDocs(collection(db, 'liberacionesCaja'));
        let libs = snapLib.docs.map(d => ({id: d.id, ...d.data()}));
        libs = libs.filter(d => d.createdAt && d.createdAt.startsWith('2026-06-16'));
        
        let count = 0;
        for (const lib of libs) {
            const expId = `exp_${lib.asignacionCajaId}`;
            const correctDate = lib.fechaHoraRegistro || lib.fechaLiberacion || lib.createdAt;
            
            try {
                await updateDoc(doc(db, 'historico_expo', expId), {
                    pickupDayCFM: correctDate
                });
                count++;
            } catch(e) {
                // Document might not exist if id generation was different, but it should
            }
        }
        
        console.log(`Updated ${count} records in historico_expo with correct pickupDayCFM`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
