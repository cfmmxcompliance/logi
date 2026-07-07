import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(collection(db, 'users'));
        let fixed = 0;
        let skipped = 0;

        for (const d of snap.docs) {
            const originalId = d.id;
            const lowercaseId = originalId.toLowerCase();

            if (originalId === lowercaseId) {
                skipped++;
                continue; // Already lowercase, no action needed
            }

            // This user has mixed/upper case ID - needs to be migrated
            const data = d.data();
            console.log(`Migrating: "${originalId}" -> "${lowercaseId}"`);

            // Create new doc with lowercase ID, fixing email field too
            await setDoc(doc(db, 'users', lowercaseId), {
                ...data,
                email: lowercaseId
            });

            // Delete old doc
            await deleteDoc(doc(db, 'users', originalId));
            fixed++;
        }

        console.log(`\nDone! Fixed: ${fixed} | Already OK: ${skipped}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
