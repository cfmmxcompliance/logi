import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      authDomain: "logimaster-cfmoto.firebaseapp.com",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    const docSnap = await getDoc(doc(db, 'users', 'Laredo-MexicoCSR@m-v-t.com'));
    if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('Documento encontrado:');
        console.log('  role:', data.role);
        console.log('  password guardado:', data.password ? 'SÍ' : 'NO');
        console.log('  name:', data.name || '—');
        console.log('  email:', data.email || '—');
        console.log('  Todos los campos:', Object.keys(data).join(', '));
    }

    // Test Firebase Auth
    console.log('\nProbando Firebase Auth con lowercase...');
    try {
        await signInWithEmailAndPassword(auth, 'laredo-mexicocsr@m-v-t.com', '1234');
        console.log('  ✅ Auth OK con password 1234');
    } catch (e) {
        console.log(`  ❌ Auth error: ${e.code} - ${e.message}`);
    }

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
