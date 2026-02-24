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

// All DS collections roughly from 501 to 700?
// Let's list a broad range
const CANDIDATES = [
    'ds501', 'ds505', 'ds506', 'ds507', 'ds509', 'ds510',
    'ds551', 'ds553', 'ds554', 'ds556', 'ds557', 'ds558'
];

const KEYWORDS = [
    'edocument', 'identificador', 'serie', 'peso', 'descarga', 'bulto', 'orden', 'r8'
];

async function inspectDeep() {
    console.log("🕵️‍♀️ Deep Inspection for Keywords:", KEYWORDS.join(', '));

    for (const col of CANDIDATES) {
        try {
            const q = query(collection(db, col), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data();
                const keys = Object.keys(data);

                const matches = keys.filter(k =>
                    KEYWORDS.some(kw => k.toLowerCase().includes(kw))
                );

                if (matches.length > 0) {
                    console.log(`\n📂 ${col}:`);
                    console.log(`   matches: ${matches.join(', ')}`);
                }
            }
        } catch (e) { }
    }
    process.exit(0);
}

inspectDeep();
