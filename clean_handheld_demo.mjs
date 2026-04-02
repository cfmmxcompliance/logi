import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function wipeCollection(name) {
    const snap = await getDocs(collection(db, name));
    if (snap.empty) { console.log(`✅ [${name}] ya está vacía.`); return; }
    const ids = snap.docs.map(d => d.id);
    console.log(`🗑️  [${name}] — borrando ${ids.length} documentos...`);
    for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, name, id)));
        await batch.commit();
    }
    console.log(`✅ [${name}] limpiada.`);
}

async function main() {
    console.log('\n🚀 Limpiando colecciones del Handheld para demo...\n');
    await wipeCollection('asignacion_cajas');
    await wipeCollection('sellos');
    console.log('\n✅ Listo. Firebase listo para el demo.\n');
    process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
