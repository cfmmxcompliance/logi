import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ContratoRecord } from '../types/contrato';
import { CommercialInvoiceItem, VinReportRecord } from '../types';
import { asignacionCajaService } from './asignacionCajaService';
import { contratoService } from './contratoService';

const COLS_VIN_REPORTS = 'vin_reports';

export const vinReportService = {
  // Syncs records for a given date range (or all if not provided)
  generateVinReports: async (startDate?: string, endDate?: string): Promise<void> => {
    if (!db) throw new Error("Sin conexión a Internet");

    // 1. Fetch Contratos (Embarques)
    let contratos: ContratoRecord[] = [];
    if (startDate && endDate) {
      contratos = await contratoService.getContratosByDateRange(startDate, endDate);
    } else {
      // Si se ocupa sin fechas, podríamos traer todo, pero es mejor con fechas para no saturar.
      contratos = await contratoService.getContratosByDateRange('2000-01-01', '2099-12-31'); 
    }

    // 2. Fetch Asignaciones para cruzar 'Plataformas' (observaciones)
    const asignaciones = await asignacionCajaService.getAsignacionesByDateRange(
      startDate || '2000-01-01', 
      endDate || '2099-12-31'
    ).catch(() => []);

    // 3. Obtener facturas únicas de esos contratos
    const facturasSet = new Set<string>();
    contratos.forEach(c => {
      if (c.factura) {
        // En Embarques puede venir separado por comas
        const facts = c.factura.split(',').map(f => f.trim()).filter(Boolean);
        facts.forEach(f => facturasSet.add(f));
      }
    });

    const facturas = Array.from(facturasSet);
    if (facturas.length === 0) {
      throw new Error("No hay números de factura en los embarques de este rango de fechas.");
    }

    // 4. Buscar los items de XML (cfdi_invoices o commercial_invoices)
    const chunkSize = 10;
    let xmlItems: CommercialInvoiceItem[] = [];
    
    for (let i = 0; i < facturas.length; i += chunkSize) {
      const chunk = facturas.slice(i, i + chunkSize);
      const q = query(collection(db, 'cfdi_invoices'), where('invoiceNo', 'in', chunk));
      const snap = await getDocs(q);
      snap.forEach(d => {
        xmlItems.push({ ...d.data(), id: d.id } as CommercialInvoiceItem);
      });
    }

    if (xmlItems.length === 0) {
      for (let i = 0; i < facturas.length; i += chunkSize) {
        const chunk = facturas.slice(i, i + chunkSize);
        const q = query(collection(db, 'commercial_invoices'), where('invoiceNo', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(d => {
          xmlItems.push({ ...d.data(), id: d.id } as CommercialInvoiceItem);
        });
      }
    }

    // 5. Construir los registros cruzados
    const vinRecords: VinReportRecord[] = [];
    
    contratos.forEach(contrato => {
      if (!contrato.factura) return;
      
      const facts = contrato.factura.split(',').map(f => f.trim()).filter(Boolean);
      const asig = asignaciones.find(a => a.numeroOperacion === contrato.numeroOperacion || a.numeroCaja === contrato.numeroCaja);
      
      let refCounter = 1;
      
      facts.forEach(facturaNo => {
        const itemsForInvoice = xmlItems.filter(item => item.invoiceNo === facturaNo && !!item.vin);
        
        itemsForInvoice.forEach(item => {
          let colorExtracted = '';
          if (item.spanishDescription && item.spanishDescription.includes('COLOR')) {
             const parts = item.spanishDescription.split('COLOR');
             colorExtracted = parts.length > 1 ? parts[1].trim() : '';
          }

          const record: VinReportRecord = {
            id: item.vin || item.id,
            containerNo: contrato.numeroCaja || '',
            sealNo: contrato.selloAsignado || '',
            model: item.model || '',
            ref: refCounter.toString(),
            productNo: item.partNo || '',
            vinNo: item.vin || '',
            engineNo: item.engine || '',
            productionDate: '', 
            color: colorExtracted,
            orderNo: contrato.contrato || '',
            invoiceNo: facturaNo,
            shippingDate: contrato.fecha || '',
            plataformas: asig?.observaciones || ''
          };
          
          vinRecords.push(record);
          refCounter++;
        });
      });
    });

    if (vinRecords.length === 0) {
      throw new Error("No se encontraron VINs en el XML para las facturas de este rango de fechas.");
    }

    // 6. Upsert Batch en Firebase (en chunks de 500 por límite de Firestore)
    const vinReportsRef = collection(db, COLS_VIN_REPORTS);
    
    for (let i = 0; i < vinRecords.length; i += 500) {
      const chunk = vinRecords.slice(i, i + 500);
      const batch = writeBatch(db);
      
      chunk.forEach(record => {
        const docRef = doc(vinReportsRef, record.vinNo);
        batch.set(docRef, record, { merge: true });
      });
      
      await batch.commit();
    }
    
    console.log(`✅ Sincronizados ${vinRecords.length} VINs exitosamente.`);
  },

  getAllVinReports: async (): Promise<VinReportRecord[]> => {
    if (!db) return [];
    const q = query(collection(db, COLS_VIN_REPORTS));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as VinReportRecord));
  }
};
