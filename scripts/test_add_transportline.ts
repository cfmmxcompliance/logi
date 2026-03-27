import { transportLineService } from '../services/transportLineService';

async function run() {
  try {
    const mockId = 'APL-001';
    console.log("Adding mock TransportLine to Firebase...");
    await transportLineService.addTransportLine({
      transportLineId: mockId,
      carrierCodigo: 'EGLV',
      TransportLine: 'APL Logistics',
      razonSocial: 'APL Logistics de México S.A. de C.V.'
    });
    console.log("Successfully added TransportLine.");
    
    console.log("Fetching ALL TransportLines...");
    const fetchedAll = await transportLineService.getAllTransportLines();
    console.log(`Found ${fetchedAll.length} total transport lines:`, fetchedAll.map(c => c.transportLineId));
    
    console.log("Fetching TransportLines by Carrier (EGLV)...");
    const fetched = await transportLineService.getTransportLinesByCarrier('EGLV');
    console.log(`Found ${fetched.length} lines for Evergreen:`, fetched);
    
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

run();
