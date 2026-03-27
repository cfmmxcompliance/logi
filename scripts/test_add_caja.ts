import { cajaService } from '../services/cajaService';

async function run() {
  try {
    console.log("Adding mock Caja to Firebase...");
    await cajaService.addCaja({
      NumeroCaja: 'MSCU-123456',
      carrierCodigo: 'EGLV',
      TransportLine: 'Evergreen Marine',
      TipoCaja: 'Refrigerada 40FT'
    });
    console.log("Successfully added Caja.");
    
    console.log("Fetching ALL Cajas...");
    const fetchedAll = await cajaService.getAllCajas();
    console.log(`Found ${fetchedAll.length} total cajas:`, fetchedAll.map(c => c.NumeroCaja));
    
    console.log("Fetching Cajas by Carrier (EGLV)...");
    const fetched = await cajaService.getCajasByCarrier('EGLV');
    console.log(`Found ${fetched.length} cajas for Evergreen:`, fetched);
    
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

run();
