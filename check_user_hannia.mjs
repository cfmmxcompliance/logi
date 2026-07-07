import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          authDomain: "logimaster-cfmoto.firebaseapp.com",
          projectId: "logimaster-cfmoto",
          storageBucket: "logimaster-cfmoto.firebasestorage.app",
          messagingSenderId: "924452835722",
          appId: "1:924452835722:web:11a7eedec65ba034dc7873",
          measurementId: "G-01VXE7L5C3"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Try exact username or email
        const possibleIds = [
            'hanniacfmoto',
            'hanniacfmoto@gmail.com',
            'hanniacfmoto@cfmoto.com',
            'hannia@cfmoto.com'
        ];

        console.log("Checking user 'hanniacfmoto' in Firestore...");
        for (const id of possibleIds) {
            const userRef = doc(db, 'users', id);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                console.log(`\nFOUND USER DOC: ${id}`);
                console.log(JSON.stringify(userSnap.data(), null, 2));
            } else {
                console.log(`Not found under ID: ${id}`);
            }
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
