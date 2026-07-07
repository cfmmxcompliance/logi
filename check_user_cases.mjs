import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, where, limit } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Get all users and find those with mixed-case IDs or email fields
        const snap = await getDocs(collection(db, 'users'));
        const problems = [];

        snap.forEach(d => {
            const id = d.id;
            const emailField = d.data().email || '';
            const idHasMixedCase = id !== id.toLowerCase();
            const emailFieldHasMixedCase = emailField !== emailField.toLowerCase();
            
            if (idHasMixedCase || emailFieldHasMixedCase) {
                problems.push({ id, emailField, idHasMixedCase, emailFieldHasMixedCase });
            }
        });

        console.log(`Total usuarios con mayúsculas en ID o campo email: ${problems.length}`);
        problems.forEach(p => {
            console.log(`  ID: "${p.id}" (mixedCase:${p.idHasMixedCase}) | email field: "${p.emailField}" (mixedCase:${p.emailFieldHasMixedCase})`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
