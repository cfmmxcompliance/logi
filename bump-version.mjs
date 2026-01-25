import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, increment } from 'firebase/firestore';

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

async function bump() {
    console.log("🚀 Bumping Parts Version to force Client Sync...");
    const ref = doc(db, 'system_metadata', 'parts_version');
    await setDoc(ref, {
        version: increment(1),
        lastUpdated: new Date().toISOString(),
        updatedBy: 'System Repair Tool'
    }, { merge: true });
    console.log("✅ Version Bumped. Clients will now re-fetch.");
    process.exit(0);
}

bump();
