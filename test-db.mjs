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

async function test() {
    try {
        console.log("Fetching CFDI Invoices...");
        const snapshot = await getDocs(query(collection(db, 'cfdiInvoices'), limit(5)));
        console.log(`Found ${snapshot.docs.length} CFDI invoices.`);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id}, uuid: ${data.uuid}, UUID: ${data.UUID}`);
        });

        const snapshot2 = await getDocs(query(collection(db, 'xmlciRecords'), limit(5)));
        console.log(`Found ${snapshot2.docs.length} XMLCI records.`);
        snapshot2.docs.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id}, uuid: ${data.uuid}, UUID: ${data.UUID}`);
        });

        // Test prefix query
        if (snapshot.docs.length > 0) {
            const testUuid = snapshot.docs[0].data().uuid;
            if (testUuid) {
                const lower = testUuid.toLowerCase();
                const norm = testUuid.toUpperCase();
                console.log(`Testing query for UUID: ${testUuid}`);
                const q1 = await getDocs(query(collection(db, 'cfdiInvoices'), where('uuid', '>=', lower), where('uuid', '<=', lower + '\uf8ff'), limit(1)));
                console.log(`Query lower result count: ${q1.docs.length}`);
                const q2 = await getDocs(query(collection(db, 'cfdiInvoices'), where('uuid', '>=', norm), where('uuid', '<=', norm + '\uf8ff'), limit(1)));
                console.log(`Query norm result count: ${q2.docs.length}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

test();
