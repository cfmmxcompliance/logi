import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

async function testTypeMismatch() {
    console.log("🧪 Testing Number vs String mismatch for DS510...");

    // Testing numeric 1
    const qNum = query(collection(db, "ds510"), where("TipoPedimento", "==", 1), limit(1));
    const snapNum = await getDocs(qNum);
    console.log(`- Results for Number 1: ${snapNum.size}`);

    // Testing string "1"
    const qStr = query(collection(db, "ds510"), where("TipoPedimento", "==", "1"), limit(1));
    const snapStr = await getDocs(qStr);
    console.log(`- Results for String "1": ${snapStr.size}`);

    if (snapStr.size > 0) {
        const val = snapStr.docs[0].data().TipoPedimento;
        console.log(`- Exact value in Firestore for first record: '${val}' (Type: ${typeof val})`);
    }
}

testTypeMismatch();
