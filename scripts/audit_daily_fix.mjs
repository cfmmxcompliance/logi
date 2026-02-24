
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

// Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function auditAndFix() {
    console.log("🔍 Scanning Parts for updates in the last 30 days...");

    // 1. Get All Parts
    const snap = await getDocs(collection(db, 'parts'));

    const changesByDate = new Map();
    // 30 day window
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    snap.docs.forEach(d => {
        const data = d.data();
        if (data.UPDATE_TIME) {
            const updateTime = new Date(data.UPDATE_TIME);

            // Filter by 30 days
            if (updateTime >= thirtyDaysAgo) {
                // Convert to Local Date String (YYYY-MM-DD) for grouping
                // Mexico City is roughly UTC-6. 
                const localDate = new Date(updateTime.getTime() - (6 * 60 * 60 * 1000));
                const dateKey = localDate.toISOString().split('T')[0];

                if (!changesByDate.has(dateKey)) {
                    changesByDate.set(dateKey, []);
                }
                changesByDate.get(dateKey).push(data.PART_NUMBER || data.PartNo);
            }
        }
    });

    console.log(`📊 Found updates for ${changesByDate.size} distinct days.`);

    for (const [date, parts] of changesByDate.entries()) {
        const uniquePNs = Array.from(new Set(parts)).filter(Boolean);
        const count = uniquePNs.length;

        // Fix any day with significant activity (>5 items) to be safe
        // This ensures days like "Feb 7" with 6 items are also fully populated with PNs if they weren't before
        if (count > 0) {
            console.log(`🛠 Syncing ${date}: ${count} items...`);
            await setDoc(doc(db, 'daily_changes', date), {
                id: date,
                timestamp: new Date().toISOString(),
                // Use a special action so we know it was a repair, but only if creating new.
                // Actually, let's keep the existing action if it exists? 
                // No, getting the doc first is slow. Let's just merge. 
                // If it was "System (Import)", it will stay unless we overwrite.
                // We'll set a "repaired: true" flag.

                // CRITICAL: We must provide 'partNumbers' list because that's what was missing!
                partNumbers: uniquePNs,
                count: count,
                repaired: true,
                repairedAt: new Date().toISOString()
            }, { merge: true });
        }
    }

    console.log("✅ 30-Day Repair Complete. Please refresh the Daily Audit page.");
    process.exit(0);
}

auditAndFix().catch(console.error);
