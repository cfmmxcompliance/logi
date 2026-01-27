
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Setup without service account (relies on ADC or environment)
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: "logimaster-cfmoto"
    });
}

const db = getFirestore();

async function checkInvoices() {
    try {
        console.log("Checking 'commercial_invoices' collection...");
        const snapshot = await db.collection("commercial_invoices").limit(5).get();

        console.log(`Found ${snapshot.size} documents (limit 5).`);

        if (snapshot.empty) {
            console.log("Collection appears empty or inaccessible.");
        } else {
            console.log("Sample Data:");
            snapshot.forEach(doc => {
                const data = doc.data();
                console.log(`- ${doc.id}: Invoice=${data.invoiceNo}`);
            });
        }
    } catch (error) {
        console.error("Error accessing Firestore:", error);
    }
}

checkInvoices();
