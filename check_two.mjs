import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const ids = ['exp_L7jnYxZwKCZ95UC1L4LC', 'exp_Sl5jKr3xuURAKzdaROUQ'];
        
        for (const id of ids) {
            const d = await getDoc(doc(db, 'historico_expo', id));
            console.log(`\n=== ${id} ===`);
            console.log(JSON.stringify(d.data(), null, 2));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
