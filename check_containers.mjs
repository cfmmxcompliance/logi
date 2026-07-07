import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
    const app = initializeApp({ apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" });
    const db = getFirestore(app);

    const reportsSnap = await getDocs(collection(db, 'data_stage_reports'));
    
    const secciones = new Map(); // seccion -> { count, patentes, containerTotal }
    
    for (const reportDoc of reportsSnap.docs) {
        const itemsSnap = await getDocs(collection(db, 'data_stage_reports', reportDoc.id, 'items'));
        itemsSnap.docs.forEach(d => {
            const data = d.data();
            const sec = String(data.seccion || '?');
            const pat = String(data.patente || '?');
            const cnt = data.containerCount || 0;
            
            if (!secciones.has(sec)) secciones.set(sec, { count: 0, patentes: new Set(), containers: 0, claves: new Map() });
            const s = secciones.get(sec);
            s.count++;
            s.patentes.add(pat);
            s.containers += cnt;
            const clave = (data.claveDocumento || '?').toUpperCase();
            s.claves.set(clave, (s.claves.get(clave) || 0) + 1);
        });
        process.stdout.write(`\r${reportDoc.id.substring(0, 8)}...`);
    }

    console.log(`\n\n=== Secciones (Aduanas) en 504/501 ===`);
    console.log(`${'Seccion'.padEnd(10)} ${'Peds'.padStart(6)} ${'Containers'.padStart(12)} ${'Patentes'.padEnd(30)} Claves`);
    Array.from(secciones.entries()).sort((a,b) => b[1].count - a[1].count).forEach(([sec, v]) => {
        const patList = Array.from(v.patentes).join(',');
        const claveList = Array.from(v.claves.entries()).map(([k,c]) => `${k}:${c}`).join(', ');
        console.log(`${sec.padEnd(10)} ${String(v.count).padStart(6)} ${String(v.containers).padStart(12)} ${patList.padEnd(30)} ${claveList}`);
    });

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
