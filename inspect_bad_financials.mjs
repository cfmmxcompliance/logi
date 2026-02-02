import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function check() {
    console.log("Fetching dossiers...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    let badCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const fins = data.financials;

        if (fins && fins.montoPagado > 0 && (!fins.valorAduana || fins.valorAduana === 0)) {
            console.log(`❌ Missing ValorAduana: ${data.numPedimento}`);
            console.log(JSON.stringify(fins, null, 2));
            badCount++;
            if (badCount >= 5) break;
        }
    }

    if (badCount === 0) console.log("✅ No issues found in this batch.");
    process.exit(0);
}

check();
