import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runQuery() {
    console.log("Querying ds510 for January 2026, FormaPago != 0 and != 9...");

    const snap = await getDocs(collection(db, 'ds510'));
    console.log(`Total records in ds510: ${snap.size}`);

    const results = [];
    snap.forEach(doc => {
        const data = doc.data();
        const formaPago = String(data.FormaPago || '');
        const fecha = String(data.FechaPagoReal || '');

        // January 2026 check (Format: YYYY-MM-DD ...)
        const isJan2026 = fecha.startsWith('2026-01');
        const notZeroOrNine = formaPago !== '0' && formaPago !== '9';

        if (isJan2026 && notZeroOrNine) {
            results.push({
                id: doc.id,
                pedimento: data.Pedimento,
                formaPago: formaPago,
                fecha: fecha,
                importe: data.ImportePago
            });
        }
    });

    console.log(`\nFound ${results.length} matching records:`);
    results.forEach(r => {
        console.log(`- Pedimento: ${r.pedimento} | Forma Pago: ${r.formaPago} | Fecha: ${r.fecha} | Importe: ${r.importe}`);
    });

    process.exit(0);
}

runQuery();
