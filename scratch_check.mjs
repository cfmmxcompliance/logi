import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

// Logimaster Firebase App Config
const firebaseConfig = {
  apiKey: process.env.GEMINI_API_KEY,
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.appspot.com",
  messagingSenderId: "364536294713",
  appId: "1:364536294713:web:4432de862664ff0e68d90e",
  measurementId: "G-9D0388TKVZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    console.log("Checking for TL00120260903...");
    
    // Check possible collections
    const collections = ['transport_lines', 'truckload_assignments', 'daily_assignments', 'asignaciones_diarias', 'asignacion_diaria', 'deleted_records', 'history', 'audit_logs'];
    
    for (const col of collections) {
        try {
            const docRef = doc(db, col, "TL00120260903");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                console.log(`Found in ${col} by ID:`, docSnap.data());
            } else {
                // Try searching by fields just in case
                const q = query(collection(db, col), where("id", "==", "TL00120260903"));
                const querySnapshot = await getDocs(q);
                let foundCount = 0;
                querySnapshot.forEach((doc) => {
                    console.log(`Found by query in ${col}:`, doc.id, doc.data());
                    foundCount++;
                });
            }
        } catch (e) {
            console.error(`Error querying ${col}:`, e.message);
        }
    }
}

check().then(() => process.exit(0)).catch(console.error);
