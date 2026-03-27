import { expoService } from '../services/expoService';

async function run() {
  try {
    console.log("Adding mock Expo to Firebase...");
    await expoService.addExpo({
      // 1. Datos Base
      expo: 'U26BWABBMUSEH',
      modelo: 'MOCK MODEL 8K',
      pesoNetoUnitarioKg: 400.5,
      pesoBrutoUnitarioKg: 450.0,
      pesoBrutoUnitarioLb: 992.08,
      volumenUnitario: 3.5,
      valorUsdUnitario: 8169.0,
      
      // 2. SAT
      objetoImpuestoSat: '02',
      unidadMedidaSat: 'H87',
      usoCfdiSat: 'G01',
      claveProductoSat: '25101500',

      // 3. Aduanas
      fraccionArancelaria: '8703.21.01',
      unidadAduana: 'PZ',
      cantidadAduana: 1,
      puAduana: 8169.0,
      clavePedimento: 'A1',
      incoterm: 'FOB',

      // 4. Transporte
      materialPeligroso: true,
      claveMaterialPeligroso: 'UN3171',
      tipoDeMateria: 'Batería',

      // 5. Fabricante/Ambiental
      mid: 'MXCFMMEX107APO',
      testGroupNameNo: 'TCMAX.998U1Y'
    });
    console.log("Successfully added Expo.");
    
    console.log("Fetching Expo to verify...");
    const fetched = await expoService.getExpo('U26BWABBMUSEH');
    console.log("Fetched:", fetched);
    
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
  process.exit(0);
}

run();
