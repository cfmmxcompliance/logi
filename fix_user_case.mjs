import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // The problem: document ID is 'ArcBestMX@tql.com' but system looks for 'arcbestmx@tql.com'
        const oldId = 'ArcBestMX@tql.com';
        const newId = 'arcbestmx@tql.com';

        // Read existing document
        const oldDoc = await getDoc(doc(db, 'users', oldId));
        if (!oldDoc.exists()) {
            console.log(`Document ${oldId} not found!`);
            process.exit(1);
        }

        const data = oldDoc.data();
        console.log('Original data:', data);

        // Create new document with lowercase ID
        await setDoc(doc(db, 'users', newId), {
            ...data,
            email: newId  // also fix email field to be lowercase
        });
        console.log(`✓ Created new document with ID: ${newId}`);

        // Delete old document with uppercase ID
        await deleteDoc(doc(db, 'users', oldId));
        console.log(`✓ Deleted old document with ID: ${oldId}`);

        console.log('\nDone! User ArcBestMX@tql.com can now login as arcbestmx@tql.com');

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
