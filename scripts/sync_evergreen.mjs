import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

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

const extractedData = [
    { "Booking Number": "143559711345", "ETD": "DEC-20-2025", "ETA": "JAN-06-2026", "Packages": "19 PACKAGES", "Total Gross Weight": "8,019.000 KGS" },
    { "Booking Number": "143574071408", "ETD": "JAN-15-2026", "ETA": "FEB-02-2026", "Packages": "26 PACKAGES", "Total Gross Weight": "11,644.000 KGS" },
    { "Booking Number": "143574069012", "ETD": "DEC-06-2025", "ETA": "DEC-24-2025", "Packages": "8 PACKAGES", "Total Gross Weight": "4,757.000 KGS" },
    { "Booking Number": "143559588446", "ETD": "DEC-06-2025", "ETA": "DEC-23-2025", "Packages": "12 PACKAGES", "Total Gross Weight": "11,807.000 KGS" },
    { "Booking Number": "143559589141", "ETD": "DEC-06-2025", "ETA": "DEC-23-2025", "Packages": "6 PACKAGES", "Total Gross Weight": "4,233.000 KGS" },
    { "Booking Number": "143574070070", "ETD": "DEC-20-2025", "ETA": "JAN-07-2026", "Packages": "12 PACKAGES", "Total Gross Weight": "11,386.000 KGS" },
    { "Booking Number": "143559711337", "ETD": "DEC-31-2025", "ETA": "JAN-17-2026", "Packages": "11 PACKAGES", "Total Gross Weight": "8,007.000 KGS" },
    { "Booking Number": "143574071165", "ETD": "DEC-27-2025", "ETA": "JAN-18-2026", "Packages": "12 PACKAGES", "Total Gross Weight": "11,442.000 KGS" },
    { "Booking Number": "143574068432", "ETD": "DEC-06-2025", "ETA": "DEC-23-2025", "Packages": "8 PACKAGES", "Total Gross Weight": "4,755.000 KGS" },
    { "Booking Number": "143574069373", "ETD": "DEC-14-2025", "ETA": "DEC-31-2025", "Packages": "29 PACKAGES", "Total Gross Weight": "13,685.000 KGS" },
    { "Booking Number": "143674060033", "ETD": "JAN-21-2026", "ETA": "FEB-09-2026", "Packages": "10 PACKAGES", "Total Gross Weight": "9,797.000 KGS" },
    { "Booking Number": "143559688106", "ETD": "DEC-20-2025", "ETA": "JAN-07-2026", "Packages": "11 PACKAGES", "Total Gross Weight": "13,170.000 KGS" },
    { "Booking Number": "143559589132", "ETD": "DEC-06-2025", "ETA": "DEC-23-2025", "Packages": "9 PACKAGES", "Total Gross Weight": "4,557.000 KGS" },
    { "Booking Number": "143559711205", "ETD": "DEC-14-2025", "ETA": "DEC-29-2025", "Packages": "25 PACKAGES", "Total Gross Weight": "14,325.000 KGS" },
    { "Booking Number": "143574069349", "ETD": "DEC-06-2025", "ETA": "DEC-23-2025", "Packages": "16 PACKAGES", "Total Gross Weight": "12,195.000 KGS" },
    { "Booking Number": "143559688203", "ETD": "DEC-20-2025", "ETA": "JAN-07-2026", "Packages": "12 PACKAGES", "Total Gross Weight": "12,008.000 KGS" },
    { "Booking Number": "143574070363", "ETD": "DEC-31-2025", "ETA": "JAN-17-2026", "Packages": "12 PACKAGES", "Total Gross Weight": "10,821.000 KGS" },
    { "Booking Number": "143574071254", "ETD": "DEC-27-2025", "ETA": "JAN-18-2026", "Packages": "14 PACKAGES", "Total Gross Weight": "10,806.000 KGS" },
    { "Booking Number": "143574070100", "ETD": "DEC-20-2025", "ETA": "JAN-07-2026", "Packages": "9 PACKAGES", "Total Gross Weight": "2,773.000 KGS" },
    { "Booking Number": "143559688220", "ETD": "DEC-31-2025", "ETA": "JAN-16-2026", "Packages": "28 PACKAGES", "Total Gross Weight": "14,283.000 KGS" },
    { "Booking Number": "143574070096", "ETD": "DEC-20-2025", "ETA": "JAN-06-2026", "Packages": "23 PACKAGES", "Total Gross Weight": "9,057.000 KGS" },
    { "Booking Number": "143559689064", "ETD": "JAN-05-2026", "ETA": "JAN-21-2026", "Packages": "10 PACKAGES", "Total Gross Weight": "8,174.000 KGS" },
    { "Booking Number": "143574070495", "ETD": "DEC-31-2025", "ETA": "JAN-16-2026", "Packages": "24 PACKAGES", "Total Gross Weight": "10,496.000 KGS" }
];

const months = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
    'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
};

function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const month = months[parts[0]];
    const day = parts[1];
    const year = parts[2];
    return `${year}-${month}-${day}`;
}

async function runSync() {
    console.log("🚀 Starting Bulk Update...");
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of extractedData) {
        const bookingNo = item["Booking Number"];
        const fullBL = `EGLV${bookingNo}`;

        // Find all records with this BL
        const q = query(collection(db, "vessel_tracking"), where("blNo", "==", fullBL));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log(`⚠️ No records found for BL: ${fullBL}`);
            skippedCount++;
            continue;
        }

        const updates = {
            etd: normalizeDate(item.ETD),
            etaPort: normalizeDate(item.ETA),
            packages: item.Packages,
            grossWeight: parseFloat(item["Total Gross Weight"].replace(/,/g, '')),
            updatedAt: new Date().toISOString()
        };

        const batch = [];
        querySnapshot.forEach((docSnap) => {
            console.log(`✅ Updating record ${docSnap.id} for BL: ${fullBL}`);
            batch.push(updateDoc(doc(db, "vessel_tracking", docSnap.id), updates));
        });

        await Promise.all(batch);
        updatedCount += querySnapshot.size;
    }

    console.log(`\n🎉 Sync Complete!`);
    console.log(`Updated: ${updatedCount} records`);
    console.log(`Skipped (Not Found): ${skippedCount} BLs`);
    process.exit(0);
}

runSync().catch(err => {
    console.error("❌ Sync Failed:", err);
    process.exit(1);
});
