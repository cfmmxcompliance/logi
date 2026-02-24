
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

const inspectFiles = async () => {
    console.log("--- Inspecting Uploaded Files Inventory (ds_files) ---");
    const colRef = collection(db, 'ds_files');
    const snapshot = await getDocs(colRef);

    console.log(`Found ${snapshot.size} uploaded files.`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`FILE: ${data.fileName} -> CODE: ${data.code} | ROWS: ${data.rowsCount || (data.content ? data.content.length : 0)}`);
    });

    process.exit(0);
};

inspectFiles().catch(console.error);
