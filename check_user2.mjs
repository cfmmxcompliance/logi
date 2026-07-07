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

        // Check both variants
        const ids = ['arcbestmx@tql.com', 'ArcBestMX@tql.com'];
        
        for (const id of ids) {
            const d = await getDoc(doc(db, 'users', id));
            if (d.exists()) {
                console.log(`\n✓ Documento encontrado con ID: "${id}"`);
                console.log(JSON.stringify(d.data(), null, 2));
            } else {
                console.log(`\n✗ NO existe documento con ID: "${id}"`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
