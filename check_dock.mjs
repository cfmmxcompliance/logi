import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    try {
        console.log("Consultando asignaciones de hoy (2026-07-22)...");
        const q = query(collection(db, 'asignacion_cajas'), where('fecha', '==', '2026-07-22'));
        const snap = await getDocs(q);

        const conditions = ['RECHAZADO', 'DROP', 'NO SHOW'];
        let count = 0;
        
        console.log("Resultados:");
        snap.forEach(doc => {
            const data = doc.data();
            const dock = (data.dockArribo || '').trim().toUpperCase();
            if (conditions.includes(dock)) {
                console.log(`- Operación: ${data.numeroOperacion} | Caja: ${data.numeroCaja} | Carrier ID: ${data.transportLineId} | Dock: ${dock}`);
                count++;
            }
        });

        if (count === 0) {
            console.log("No se encontraron registros de hoy con RECHAZADO, DROP o NO SHOW.");
        } else {
            console.log(`Total encontrados: ${count}`);
        }
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

check();
