import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(collection(db, 'asignacion_cajas'));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Find by numeroOperacion TL011, TL035, TL055
        const targets = ['TL011', 'TL035', 'TL055'];
        
        for (const op of targets) {
            const record = all.find(r => r.numeroOperacion === op);
            if (!record) {
                console.log(`\n${op}: NO ENCONTRADO`);
                continue;
            }
            console.log(`\n=== ${op} ===`);
            console.log(JSON.stringify(record, null, 2));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
