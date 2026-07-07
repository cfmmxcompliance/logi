import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(query(collection(db, 'asignacion_cajas'), limit(3)));
        snap.forEach(d => {
            const data = d.data();
            console.log(`carrierCodigo: ${data.carrierCodigo}, carrierNombre: ${data.carrierNombre}, numeroCaja: ${data.numeroCaja}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
