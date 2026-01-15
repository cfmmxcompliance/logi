
// Debug Script to analyze Storage State
import { storageService } from './services/storageService.ts';

export const diagnoseStorage = async () => {
    console.log("--- STORAGE DIAGNOSIS ---");

    // 1. Check LocalStorage Raw Size
    const rawLS = localStorage.getItem('logimaster_db');
    if (rawLS) {
        const parsed = JSON.parse(rawLS);
        const inv = parsed.commercialInvoices || [];
        console.log(`[LocalStorage] Main DB Item Count: ${inv.length}`);
        if (inv.length > 0) {
            console.log(`[LocalStorage] First Item ID: ${inv[0].id}, Inv: ${inv[0].invoiceNo}`);
            console.log(`[LocalStorage] Last Item ID: ${inv[inv.length - 1].id}, Inv: ${inv[inv.length - 1].invoiceNo}`);
        }
    } else {
        console.warn("[LocalStorage] Main DB key 'logimaster_db' is MISSING or EMPTY.");
    }

    // 2. Check Backup Key
    const backup = localStorage.getItem('logimaster_commercial_invoices_backup');
    if (backup) {
        const parsedBackup = JSON.parse(backup);
        console.log(`[LocalStorage] Backup Key Count: ${parsedBackup.length}`);
    } else {
        console.log("[LocalStorage] No specialized Invoice backup found.");
    }

    // 3. Check In-Memory State
    const memItems = storageService.getInvoiceItems();
    console.log(`[Memory] Current Service State Count: ${memItems.length}`);

    // 4. Analyze Data Distribution (Invoice Numbers)
    const distribution: Record<string, number> = {};
    memItems.forEach(i => {
        const k = i.invoiceNo || 'Unknown';
        distribution[k] = (distribution[k] || 0) + 1;
    });
    console.table(distribution);

    console.log("-------------------------");
};

