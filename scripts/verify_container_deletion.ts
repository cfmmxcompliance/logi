
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';

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
const COLS = { INVOICES: 'commercial_invoices' };

async function verifyDelete() {
    const TEST_CONTAINER = "TEST-CONTAINER-STRESS-" + Date.now();
    console.log(`🧪 Starting STRESS Test with Container: ${TEST_CONTAINER}`);

    for (let cycle = 1; cycle <= 3; cycle++) {
        console.log(`\n================================`);
        console.log(`      CYCLE ${cycle} / 3`);
        console.log(`================================`);

        // 1. Create Dummy Items
        console.log("Creating 3 dummy items...");
        const batch = writeBatch(db);
        for (let i = 0; i < 3; i++) {
            const id = `TEST-ITEM-C${cycle}-${Date.now()}-${i}`;
            const ref = doc(db, COLS.INVOICES, id);
            batch.set(ref, {
                invoiceNo: 'TEST-INV',
                partNo: 'TEST-PART',
                containerNo: TEST_CONTAINER,
                description: `Cycle ${cycle} Item`,
                timestamp: new Date().toISOString()
            });
        }
        await batch.commit();
        console.log("✅ Dummy items created.");

        // 2. Verify Existence (Wait slightly for consistency if needed, but awaiting commit is usually enough)
        const q1 = query(collection(db, COLS.INVOICES), where('containerNo', '==', TEST_CONTAINER));
        const snap1 = await getDocs(q1);
        if (snap1.size !== 3) {
            console.error(`❌ Setup Failed in Cycle ${cycle}. Expected 3, found ${snap1.size}`);
            process.exit(1);
        }

        // 3. EXECUTE DELETE LOGIC
        console.log("🗑️ Executing Delete Logic...");
        const qDelete = query(collection(db, COLS.INVOICES), where("containerNo", "==", TEST_CONTAINER));
        const snapDelete = await getDocs(qDelete);
        const deleteIds = snapDelete.docs.map(d => d.id);

        const deleteBatch = writeBatch(db);
        deleteIds.forEach(id => deleteBatch.delete(doc(db, COLS.INVOICES, id)));
        await deleteBatch.commit();

        // 4. Verify DELETION
        const q2 = query(collection(db, COLS.INVOICES), where('containerNo', '==', TEST_CONTAINER));
        const snap2 = await getDocs(q2);

        if (!snap2.empty) {
            console.error(`❌ FAILED Cycle ${cycle}: Ghost Data persists! Found ${snap2.size}`);
            process.exit(1);
        }
        console.log("✅ Container Empty (Cleaned).");

        // 5. SIMULATE RE-UPLOAD
        console.log("🔄 Re-uploading items...");
        const batch2 = writeBatch(db);
        for (let i = 0; i < 3; i++) {
            const id = `TEST-ITEM-REUPLOAD-C${cycle}-${Date.now()}-${i}`;
            const ref = doc(db, COLS.INVOICES, id);
            batch2.set(ref, {
                invoiceNo: 'TEST-INV',
                partNo: 'TEST-PART',
                containerNo: TEST_CONTAINER,
                description: `Cycle ${cycle} Re-uploaded`,
                timestamp: new Date().toISOString()
            });
        }
        await batch2.commit();

        // 6. VERIFY NO DUPLICATES
        const q3 = query(collection(db, COLS.INVOICES), where('containerNo', '==', TEST_CONTAINER));
        const snap3 = await getDocs(q3);

        console.log(`Final Item Count: ${snap3.size} (Expected: 3)`);
        if (snap3.size !== 3) {
            console.error(`❌ FAILED Cycle ${cycle}: Duplicates found.`);
            process.exit(1);
        }

        // 7. SIMULATE CSV DATA
        const exportData = snap3.docs.map(d => `${d.data().invoiceNo} | ${d.data().description}`);
        console.log(`✅ CSV Check: ${exportData.length} rows.`);

        // CLEANUP FOR NEXT CYCLE (Or leave it for next cycle to delete? The logic handles overwrite/append, but Delete Container cleans it anyway)
        // To really test "Delete Container", we should start the next cycle by Deleting again, or assume user manually deleted?
        // Actually, the test is: User Deletes -> Uploads.
        // So for Cycle 2: User Deletes (the re-uploaded items from Cycle 1) -> Uploads new.
        // My cycle loop above: Create -> Delete -> Re-upload.
        // Next cycle: Create(Adds MORE?) -> Delete -> ...
        // Wait, "Create" in step 1 will ADD to the Re-uploaded items from Cycle 1 if I don't clean up.
        // But the user flow is:
        // C1: Upload -> Delete -> Upload.
        // C2: (Data exists from C1) -> Delete -> Upload.
        // So I should SKIP Step 1 (Create) in cycles 2 & 3, OR purely rely on the "Delete" step to clear previous cycle's "Re-upload".
        // Let's make it robust:
        // Cycle Start:
        //   If items exist (leftover from prev cycle), Delete them? No, the test IS the delete function.
        //   Let's just Clean Up at end of cycle to be safe, so each cycle starts fresh?
        //   The user said "Repite el proceso".
        //   Process = Load -> Delete -> Load -> Check.
        //   So yes, clean up at the end of the loop is fine.

        console.log("Cleanup before next cycle...");
        const cleanupBatch = writeBatch(db);
        snap3.docs.forEach(d => cleanupBatch.delete(d.ref));
        await cleanupBatch.commit();
    }

    console.log("\n✅✅✅ ALL 3 CYCLES PASSED PERFECTLY.");
    process.exit(0);
}

verifyDelete().catch(e => {
    console.error(e);
    process.exit(1);
});
