import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, writeBatch } from "firebase/firestore";
import fs from 'fs';

const configContent = fs.readFileSync('./services/firebaseConfig.ts', 'utf8');
const apiKeyMatch = configContent.match(/apiKey:\s*"([^"]+)"/);
const authDomainMatch = configContent.match(/authDomain:\s*"([^"]+)"/);
const projectIdMatch = configContent.match(/projectId:\s*"([^"]+)"/);
const storageBucketMatch = configContent.match(/storageBucket:\s*"([^"]+)"/);
const messagingSenderIdMatch = configContent.match(/messagingSenderId:\s*"([^"]+)"/);
const appIdMatch = configContent.match(/appId:\s*"([^"]+)"/);

const config = {
    apiKey: apiKeyMatch?.[1],
    authDomain: authDomainMatch?.[1],
    projectId: projectIdMatch?.[1],
    storageBucket: storageBucketMatch?.[1],
    messagingSenderId: messagingSenderIdMatch?.[1],
    appId: appIdMatch?.[1]
};

const app = initializeApp(config);
const db = getFirestore(app);

async function backfill() {
    const preAlertsSnap = await getDocs(collection(db, 'pre_alerts'));
    
    // Map of BL -> PO 
    const poMap = new Map();
    preAlertsSnap.forEach(d => {
        const data = d.data();
        if (data.bookingAbw && data.invoiceNo) { 
            const normalizedBL = data.bookingAbw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            poMap.set(normalizedBL, data.invoiceNo);
        }
    });
    console.log(`✅ Loaded ${poMap.size} BL -> PO maps from PreAlerts.`);
    
    const trackingSnap = await getDocs(collection(db, 'vessel_tracking'));
    let toUpdateTracking = 0;
    const batch = writeBatch(db);
    
    trackingSnap.forEach(d => {
        const data = d.data();
        if (data.blNo && (!data.invoiceNo || data.invoiceNo.trim() === '')) {
            const normalizedBL = data.blNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const po = poMap.get(normalizedBL);
            if (po) {
                batch.update(doc(db, 'vessel_tracking', d.id), { invoiceNo: po });
                toUpdateTracking++;
            }
        }
    });

    const shipmentsSnap = await getDocs(collection(db, 'shipments'));
    let toUpdateShipments = 0;
    shipmentsSnap.forEach(d => {
        const data = d.data();
        if (data.blNo && (!data.reference || data.reference.trim() === '')) {
            const normalizedBL = data.blNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const po = poMap.get(normalizedBL);
            if (po) {
                batch.update(doc(db, 'shipments', d.id), { reference: po });
                toUpdateShipments++;
            }
        }
    });
    
    if (toUpdateTracking > 0 || toUpdateShipments > 0) {
        console.log(`⏳ Updating ${toUpdateTracking} Tracking records & ${toUpdateShipments} Shipments...`);
        await batch.commit();
        console.log("✅ Update complete!");
    } else {
        console.log("✅ No records needed updates (they either have POs or no match found).");
    }
}

backfill().catch(console.error);
