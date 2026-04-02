import * as xlsx from 'xlsx';
import fs from 'fs';

function run() {
    console.log("📥 Leyendo CONTRATOS-BL.xlsx...");
    const wbContracts = xlsx.read(fs.readFileSync('./CONTRATOS-BL.xlsx'), { type: 'buffer' });
    const wsContracts = wbContracts.Sheets[wbContracts.SheetNames[0]];
    const dataContracts = xlsx.utils.sheet_to_json(wsContracts);

    // Map by Contrato (Removing potential CFM- prefix for robust matching)
    // Keys: "Contrato", "Número de factura", "BL"
    const contractMap = new Map();
    dataContracts.forEach(row => {
        if (row['Contrato']) {
            const rawContract = String(row['Contrato']).trim();
            // Store raw
            contractMap.set(rawContract, {
                invoice: row['Número de factura'] || '',
                bl: row['BL'] || ''
            });

            // If it starts with a certain format we might also want to match it flexibly, 
            // but exact substring match during iteration is better.
        }
    });
    console.log(`✅ Contratos cargados: ${contractMap.size}`);

    console.log("📥 Leyendo Truckload Packing List (USA).xlsx...");
    const wbTruckload = xlsx.read(fs.readFileSync('./Truckload Packing List (USA).xlsx'), { type: 'buffer' });
    const sheetNameTruck = "整车箱单(美国)"; 
    if (!wbTruckload.Sheets[sheetNameTruck]) {
        console.error(`❌ No se encontró la hoja "${sheetNameTruck}" en Truckload`);
        return;
    }

    const wsTruckload = wbTruckload.Sheets[sheetNameTruck];
    const dataTruckload = xlsx.utils.sheet_to_json(wsTruckload, { defval: "" });

    let matchCount = 0;
    
    // Process and add columns
    const linkedData = dataTruckload.map(row => {
        const orderNo = String(row['ORDER NO'] || '').trim();
        
        let foundInvoice = '';
        let foundBL = '';

        // Try exact match first
        if (contractMap.has(orderNo)) {
            const map = contractMap.get(orderNo);
            foundInvoice = map.invoice;
            foundBL = map.bl;
        } else {
            // Try substring match (Truckload has "CFM-24MX..." while Contract is "24MX...")
            for (const [contractStr, map] of contractMap.entries()) {
                if (orderNo.includes(contractStr) || contractStr.includes(orderNo)) {
                    foundInvoice = map.invoice;
                    foundBL = map.bl;
                    break;
                }
            }
        }

        if (foundInvoice || foundBL) {
            matchCount++;
        }

        // Return a fresh row with the newly linked fields at the END or BEGINNING
        return {
            'BL (Vinculado)': foundBL,
            'Factura (Vinculada)': foundInvoice,
            ...row
        };
    });

    console.log(`✅ Registros de Truckload procesados: ${linkedData.length}`);
    console.log(`🔗 Total de vehículos exitosamente vinculados a su BL/Factura: ${matchCount}`);

    // Create a new workbook to export
    const newWb = xlsx.utils.book_new();
    const newWs = xlsx.utils.json_to_sheet(linkedData);
    xlsx.utils.book_append_sheet(newWb, newWs, "Vinculacion");

    const exportName = './Truckload_Vinculado.xlsx';
    xlsx.writeFile(newWb, exportName);

    console.log(`\n🎉 ¡Listo! Archivo generado: ${exportName}`);
    console.log("Este archivo combina los VINs, Motores y Modelos con su respectiva Factura y código BL.");
}

run();
