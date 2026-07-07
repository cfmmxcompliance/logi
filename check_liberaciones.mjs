import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, orderBy } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Check all possible collection names for liberaciones
        const colsToCheck = ['liberaciones', 'liberacion', 'cierres', 'sellos', 'liberaciones_dock'];
        
        for (const col of colsToCheck) {
            try {
                const snap = await getDocs(query(collection(db, col), limit(2)));
                console.log(`\n[${col}] Total: ${snap.size} docs mostrados`);
                snap.forEach(d => {
                    const data = d.data();
                    console.log(`  ID: ${d.id}`);
                    console.log(`  Campos: ${Object.keys(data).join(', ')}`);
                    console.log(`  asignacionCajaId: ${data.asignacionCajaId || '(ninguno)'}`);
                    console.log(`  fechaLiberacion: ${data.fechaLiberacion || '(ninguno)'}`);
                });
            } catch(e) {
                console.log(`[${col}] ERROR: ${e.message}`);
            }
        }

        // Check what the liberacionService actually uses
        console.log('\n--- Verificando colección "liberaciones" total ---');
        const libSnap = await getDocs(collection(db, 'liberaciones'));
        console.log(`Total en "liberaciones": ${libSnap.size}`);
        
        // Show a sample with fecha
        const libs = libSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const jun17 = libs.filter(l => 
            (l.fechaLiberacion || '').includes('2026-06-17') ||
            (l.createdAt || '').includes('2026-06-17') ||
            (l.fechaHoraRegistro || '').includes('17/6/2026') ||
            (l.fechaHoraRegistro || '').includes('17/06/2026')
        );
        console.log(`Liberaciones con fecha 17/06: ${jun17.length}`);
        jun17.slice(0,3).forEach(l => {
            console.log(`  asignacionCajaId: ${l.asignacionCajaId}, fecha: ${l.fechaLiberacion}, registrado: ${l.fechaHoraRegistro}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
