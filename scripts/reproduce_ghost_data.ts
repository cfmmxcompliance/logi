
// Mocking the types and logic from storageService for isolation testing

interface Item {
    id: string;
    invoiceNo: string;
    partNo: string;
    qty?: number;
    regimen?: string;
}

let dbState: { commercialInvoices: Item[] } = { commercialInvoices: [] };

// Logic from storageService.deleteInvoiceItems (Approximate)
const deleteInvoiceItems = (ids: string[]) => {
    console.log(`[DELETE] Deleting ${ids.length} items...`);
    // The logic in storageService:
    // dbState.commercialInvoices = dbState.commercialInvoices.filter((i: any) => !ids.includes(i.id));

    // Reproducing potential bug: Type mismatch? 
    // If ids are strings and i.id are numbers? (Unlikely, both strings)
    // If ids are from selection but i.id in state are different?

    const initialCount = dbState.commercialInvoices.length;
    dbState.commercialInvoices = dbState.commercialInvoices.filter(i => !ids.includes(i.id));
    const finalCount = dbState.commercialInvoices.length;
    console.log(`[DELETE] Result: ${initialCount} -> ${finalCount}`);
};

// Logic from storageService.addInvoiceItems
const addInvoiceItems = (newItems: Item[]) => {
    console.log(`[ADD] Adding ${newItems.length} items...`);

    // Deduplication Logic
    const normalize = (val: any) => String(val || '').trim().toUpperCase();
    const existingKeys = new Set(
        (dbState.commercialInvoices || []).map(
            (i: any) => `${normalize(i.invoiceNo)}-${normalize(i.partNo)}-${Number(i.qty || 0).toFixed(4)}`
        )
    );

    const uniqueNewItems = newItems.filter(item => {
        const key = `${normalize(item.invoiceNo)}-${normalize(item.partNo)}-${Number(item.qty || 0).toFixed(4)}`;
        return !existingKeys.has(key);
    });

    console.log(`[ADD] Unique Items found: ${uniqueNewItems.length}`);

    // storageService appends:
    dbState.commercialInvoices = [...(dbState.commercialInvoices || []), ...uniqueNewItems];
    console.log(`[ADD] Total Items in State: ${dbState.commercialInvoices.length}`);
};

// SIMULATION
const runTest = () => {
    console.log("--- STARTING GHOST DATA SIMULATION ---");

    // 1. Initial State: User has 2 items
    const item1 = { id: 'A', invoiceNo: 'INV-001', partNo: 'P1', qty: 10, regimen: 'A1' };
    const item2 = { id: 'B', invoiceNo: 'INV-001', partNo: 'P2', qty: 5, regimen: 'A1' };

    dbState.commercialInvoices = [item1, item2];
    console.log("Initial State:", dbState.commercialInvoices);

    // 2. User Deletes these 2 items
    // Scenario: User selects them and hits delete.
    deleteInvoiceItems(['A', 'B']);

    // 3. User Uploads the SAME items again (Logic usually generates NEW IDs if purely uploading from Excel?)
    // In CIExtractor, upload parsing -> storageService.addInvoiceItems.
    // Excel upload usually generates IDs or uses row index? 
    // If storageService.addInvoiceItems receives items WITHOUT IDs, it might generate them?
    // Let's assume they come with NEW generated IDs or existing ones?
    // Usually new uploads get new IDs unless matched?
    const newItem1 = { id: 'C', invoiceNo: 'INV-001', partNo: 'P1', qty: 10, regimen: 'A1' }; // Same data, new ID
    const newItem2 = { id: 'D', invoiceNo: 'INV-001', partNo: 'P2', qty: 5, regimen: 'A1' };

    addInvoiceItems([newItem1, newItem2]);

    // 4. Check Result
    console.log("Final State:", dbState.commercialInvoices);

    const duplicates = dbState.commercialInvoices.filter(i => i.partNo === 'P1').length;
    if (duplicates > 1) {
        console.error("❌ FAILED: Duplicate P1 found! Ghost lines detected.");
    } else {
        console.log("✅ PASSED: No duplicates.");
    }
};

runTest();
