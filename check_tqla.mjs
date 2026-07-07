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
        
        // Filter today
        const today = all.filter(a => a.fecha === '2026-06-18');
        console.log(`Total asignaciones hoy (2026-06-18): ${today.length}`);
        
        // Check how many match TQLA transport lines
        const tqlaIds = new Set(['TQL-001', 'TQL-002', 'TQL-003']);
        const tqlaToday = today.filter(a => tqlaIds.has(a.transportLineId));
        console.log(`De esas, con transportLineId TQL-001/002/003: ${tqlaToday.length}`);
        
        // Also check if any assignment has these IDs on any date
        const tqlaAll = all.filter(a => tqlaIds.has(a.transportLineId));
        console.log(`Total historico con TQLA transport lines: ${tqlaAll.length}`);
        tqlaAll.slice(0, 5).forEach(a => {
            console.log(`  Op: ${a.numeroOperacion}, Caja: ${a.numeroCaja}, Fecha: ${a.fecha}, transportLineId: ${a.transportLineId}`);
        });

        // Check what login error could be happening - look at their role spelling
        console.log('\nUser role is "Transportista" - system checks for "TRANSPORTISTA" (uppercase)?');

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
