import { driverService } from '../services/driverService';

async function run() {
  try {
    console.log("Adding mock Driver to Firebase...");
    await driverService.addDriver({
      driverId: 'TEST-DRV-002',
      nombre: 'Pedro Ramírez',
      licencia: 'Z987654321',
      telefono: '555-987-6543',
      placasTracto: '123-ABC-9',
      carrierCodigo: 'EGLV' // Relates to the carrier we just added
    });
    console.log("Successfully added Driver.");
    
    console.log("Fetching ALL Drivers...");
    const fetchedAll = await driverService.getAllDrivers();
    console.log(`Found ${fetchedAll.length} total drivers:`, fetchedAll.map(d => d.driverId));
    
    console.log("Fetching Drivers by Carrier (EGLV)...");
    const fetched = await driverService.getDriversByCarrier('EGLV');
    console.log(`Found ${fetched.length} drivers for Evergreen:`, fetched);
    
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

run();
