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

        const cajas = ['UTV700016', 'H09904', 'H14163', '200700', 'HM73', 'H09908'];

        // Check sellos for these cajas
        const sellosSnap = await getDocs(collection(db, 'sellos'));
        const allSellos = sellosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const caja of cajas) {
            const matches = allSellos.filter(s => s.numeroCaja === caja);
            console.log(`\n=== ${caja} ===`);
            console.log(`Sellos encontrados: ${matches.length}`);
            matches.forEach((s, i) => {
                console.log(`  [${i}] asignacionCajaId: ${s.asignacionCajaId} | fecha: ${s.fechaAsignacion} | fechaHoraRegistro: ${s.fechaHoraRegistro} | createdAt: ${s.createdAt}`);
            });
        }

        // Check historico_expo: do exp_ records with OLD asignacionCajaIds exist?
        console.log('\n\n--- Buscando registros previos de estas cajas en historico_expo ---');
        const histSnap = await getDocs(collection(db, 'historico_expo'));
        const allHist = histSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const caja of cajas) {
            const matches = allHist.filter(h => h.trailer === caja);
            console.log(`\n${caja}: ${matches.length} registros en historico_expo`);
            matches.forEach(h => {
                console.log(`  id: ${h.id} | pickupDayCFM: ${h.pickupDayCFM} | createdAt: ${h.createdAt}`);
            });
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
