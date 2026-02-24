import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function inspectPedimentos() {
    const targetPeds = ["5600551", "6400122", "6400164"];
    console.log(`Inspecting ds504 for pedimentos: ${targetPeds.join(", ")}`);

    for (const ped of targetPeds) {
        console.log(`\n--- Pedimento: ${ped} ---`);
        const q = query(collection(db, "ds504"), where("Pedimento", "==", ped));
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log("No records found in ds504.");
            // Try with 'c1' or 'c2' just in case
            const q2 = query(collection(db, "ds504"), where("c1", "==", ped));
            const snap2 = await getDocs(q2);
            if (!snap2.empty) {
                console.log(`Found ${snap2.size} records using 'c1'.`);
                snap2.docs.forEach(doc => {
                    const d = doc.data();
                    console.log(`Type: ${d.c4 || d.TipoContenedor}, ID: ${d.c3 || d.NumContenedor}`);
                });
            }
        } else {
            console.log(`Found ${snap.size} records.`);
            snap.docs.forEach(doc => {
                const d = doc.data();
                console.log(`Type: ${d.TipoContenedor || d.c4}, ID: ${d.NumContenedor || d.c3}`);
            });
        }
    }
    process.exit(0);
}

inspectPedimentos().catch(console.error);
