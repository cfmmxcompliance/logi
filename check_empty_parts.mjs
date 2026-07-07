import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const snap = await getDocs(collection(db, 'parts'));
    const empties = snap.docs.filter(d => {
        const pn = (d.data().PART_NUMBER || '').toString().trim();
        return !pn;
    });

    console.log(`Vacíos encontrados: ${empties.length}`);
    if (empties.length === 0) { console.log('Nada que borrar.'); process.exit(0); }

    const batch = writeBatch(db);
    empties.forEach(d => batch.delete(doc(db, 'parts', d.id)));
    await batch.commit();

    console.log(`${empties.length} registros vacíos eliminados.`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
