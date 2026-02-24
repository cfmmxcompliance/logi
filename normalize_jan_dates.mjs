import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

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

async function normalizeJanDates() {
    console.log("Normalizing Jan 2026 dates in ds501 and ds701...");

    const collections = ["ds501", "ds701"];
    let totalFixed = 0;

    for (const colName of collections) {
        const snap = await getDocs(collection(db, colName));
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const date = data.FechaPagoReal || data.c9 || "";

            // If it has a flexible match for Jan 2026 but is not exactly YYYY-MM-DD 00:00:00
            if ((date.startsWith("2026-01") || date.startsWith("202601")) && date.length !== 19) {
                const cleanDate = date.trim().split(' ')[0].replace(/[/-]/g, '');
                if (cleanDate.length === 8) {
                    const normalized = `${cleanDate.substring(0, 4)}-${cleanDate.substring(4, 6)}-${cleanDate.substring(6, 8)} 00:00:00`;
                    if (normalized !== date) {
                        console.log(`Fixing ${colName} ${docSnap.id}: ${date} -> ${normalized}`);
                        await updateDoc(doc(db, colName, docSnap.id), { FechaPagoReal: normalized });
                        totalFixed++;
                    }
                }
            } else if (date.includes(" ") && date.startsWith("2026-01") && !date.endsWith("00:00:00")) {
                // Handle cases where it has a time but is correctly formatted otherwise
                const normalized = `${date.split(' ')[0]} 00:00:00`;
                console.log(`Fixing ${colName} ${docSnap.id} (time removal): ${date} -> ${normalized}`);
                await updateDoc(doc(db, colName, docSnap.id), { FechaPagoReal: normalized });
                totalFixed++;
            }
        }
    }

    console.log(`Finished. Total records normalized: ${totalFixed}`);
    process.exit(0);
}

normalizeJanDates().catch(console.error);
