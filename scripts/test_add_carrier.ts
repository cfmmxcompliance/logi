import { carrierService } from '../services/carrierService';

async function run() {
  try {
    console.log("Adding mock Carrier to Firebase...");
    await carrierService.addCarrier({
      codigo: 'EGLV',
      nombre: 'Evergreen',
      razonSocial: 'Evergreen Marine Corp. Ltd.'
    });
    console.log("Successfully added Carrier.");
    
    console.log("Fetching Carrier to verify...");
    const fetched = await carrierService.getCarrier('EGLV');
    console.log("Fetched:", fetched);
    
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

run();
