import { storageService } from './storageService.ts';

/**
 * Service to handle automated tracking updates from Carrier Portals.
 * Requirements:
 * - Check once daily (logic set for "after 4 AM").
 * - Search for records missing ATA Port / ATA.
 * - Update Vessel Tracking and Shipment Plan.
 */
export const trackingService = {
  
  init: async () => {
    console.log("⚓ Initializing Tracking Automation Service...");
    await trackingService.runDailyCheck();
  },

  runDailyCheck: async () => {
    const lastRunStr = localStorage.getItem('last_tracking_update');
    const now = new Date();
    
    // Logic: Run if it hasn't run today since 4 AM.
    // If last run was yesterday, run it.
    // If last run was today but before 4 AM (and now is 5 AM), run it.
    
    let shouldRun = true;
    if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        const today4AM = new Date();
        today4AM.setHours(4, 0, 0, 0);

        // If last run was after today's 4 AM cutoff, don't run again
        if (lastRun > today4AM) {
            shouldRun = false;
        }
    }

    if (!shouldRun) {
        console.log("⚓ Tracking update already ran today.");
        return;
    }

    console.log("⚓ Starting daily carrier portal synchronization...");
    
    try {
        await trackingService.syncCarrierData();
        // Update timestamp
        localStorage.setItem('last_tracking_update', now.toISOString());
    } catch (e) {
        console.error("Failed to run tracking sync", e);
    }
  },

  syncCarrierData: async () => {
    // 1. Get Records needing update (Missing ATA)
    const vessels = storageService.getVesselTracking().filter(v => !v.ataPort || v.ataPort.trim() === '');
    const shipments = storageService.getShipments().filter(s => !s.ata || s.ata.trim() === '');

    if (vessels.length === 0 && shipments.length === 0) {
        console.log("⚓ No active shipments needing ATA updates.");
        return;
    }

    console.log(`⚓ Checking status for ${vessels.length} vessels and ${shipments.length} shipments...`);

    // 2. Simulate Portal Scraping / API Calls
    // In a real production environment, this would call a backend Cloud Function 
    // that uses Puppeteer/Selenium or Carrier APIs (Maersk, MSC, COSCO, etc.)
    
    let updatesCount = 0;

    // --- VESSEL TRACKING UPDATES ---
    for (const v of vessels) {
        // SIMULATION LOGIC:
        // If ETD was more than 45 days ago, assume it arrived today for demonstration.
        // In real app: const carrierData = await fetchFromCarrier(v.shippingCompany, v.blNo);
        
        if (v.etd) {
            const etdDate = new Date(v.etd);
            const daysDiff = (new Date().getTime() - etdDate.getTime()) / (1000 * 3600 * 24);
            
            if (daysDiff > 45 && v.blNo) {
                // Simulate finding an ATA
                const simulatedATA = new Date().toISOString().split('T')[0];
                const updatedRecord = { ...v, ataPort: simulatedATA };
                await storageService.updateVesselTracking(updatedRecord);
                updatesCount++;
                console.log(`✅ Auto-updated Vessel ${v.blNo}: ATA set to ${simulatedATA}`);
            }
        }
    }

    // --- SHIPMENT PLAN UPDATES ---
    for (const s of shipments) {
        if (s.etd) {
             const etdDate = new Date(s.etd);
             const daysDiff = (new Date().getTime() - etdDate.getTime()) / (1000 * 3600 * 24);
             
             if (daysDiff > 45 && s.blNo) {
                 const simulatedATA = new Date().toISOString().split('T')[0];
                 const updatedShipment = { ...s, ata: simulatedATA };
                 await storageService.updateShipment(updatedShipment);
                 updatesCount++;
                 console.log(`✅ Auto-updated Shipment ${s.blNo}: ATA set to ${simulatedATA}`);
             }
        }
    }

    if (updatesCount > 0) {
        // Optional: Trigger a notification if we had a notification system
        console.log(`⚓ Auto-Tracking complete. Updated ${updatesCount} records.`);
    }
  }
};