import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function patch() {
    try {
        console.log("Searching for Frotzon in transport_lines...");
        const tlSnap = await getDocs(collection(db, 'transport_lines'));
        let frotzonId = null;
        let frotzonName = null;
        
        tlSnap.forEach(doc => {
            const data = doc.data();
            const name = (data.nombreSubLinea || '').toUpperCase();
            if (name.includes('FROTZO') || name.includes('FRITZ') || name.includes('FROZT')) {
                console.log("Found:", data);
                frotzonId = doc.id;
                frotzonName = data.nombreSubLinea;
            }
        });

        if (!frotzonId) {
            console.log("Could not find Frotzon in transport_lines.");
            // Wait, let's see if it's there.
        } else {
            console.log(`Frotzon ID is ${frotzonId}`);
        }

        console.log("Finding TL043 and TL044...");
        const q = query(collection(db, 'asignacion_cajas'), where('numeroOperacion', 'in', ['TL043', 'TL044']));
        const snap = await getDocs(q);

        if (snap.empty) {
            console.log("TL043 and TL044 not found.");
            process.exit(0);
        }

        for (const d of snap.docs) {
            const data = d.data();
            console.log(`Updating document ID: ${d.id}, Current transportLineId: ${data.transportLineId}`);
            
            if (frotzonId) {
                await updateDoc(doc(db, 'asignacion_cajas', d.id), {
                    transportLineId: frotzonId
                });
                console.log(`✅ Updated ${d.id} to use transportLineId: ${frotzonId}`);
            }
        }
        
        console.log("Done.");
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

patch();
