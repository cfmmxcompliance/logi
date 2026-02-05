
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, orderBy } from 'firebase/firestore';

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

async function search() {
    console.log("--- BROAD SEARCH IN COMMERCIAL_INVOICES ---");

    try {
        // Just get 100 random docs (default order) and check them
        const q = query(collection(db, 'commercial_invoices'), limit(100));
        const snap = await getDocs(q);

        console.log(`Fetched ${snap.size} documents.`);

        const target = "TEMU";
        let foundCount = 0;

        snap.forEach(d => {
            const data = d.data();
            const str = JSON.stringify(data).toUpperCase();
            if (str.includes(target)) {
                console.log(`\nMATCH FOUND in Doc ID: ${d.id}`);
                console.log("InvoiceNo:", data.invoiceNo);
                console.log("ContainerNo:", data.containerNo);
                console.log("PartNo:", data.partNo);
                foundCount++;
            }
        });

        if (foundCount === 0) {
            console.log("\nNo matches for 'TEMU' in the sample of 100 documents.");
            console.log("Sample Invoice Numbers seen:");
            const sampleInvoices = new Set();
            snap.forEach(d => sampleInvoices.add(d.data().invoiceNo));
            console.log(Array.from(sampleInvoices).slice(0, 10)); // Show unique invoices
        } else {
            console.log(`\nTotal Matches: ${foundCount}`);
        }

    } catch (e) {
        console.error("Error:", e);
    }

    process.exit(0);
}

search().catch(console.error);
