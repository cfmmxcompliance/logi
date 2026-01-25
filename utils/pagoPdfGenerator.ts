
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Simple Bank Map (Common Mexican Banks)
const BANK_MAP: Record<string, string> = {
    "002": "Banco Nacional de México, S.A.",
    "012": "BBVA Bancomer, S.A.",
    "014": "Banco Santander (México), S.A.",
    "021": "HSBC México, S.A.",
    "044": "Scotiabank Inverlat, S.A.",
    "072": "Banco Mercantil del Norte, S.A.", // Banorte
    "058": "Banco Banregio, S.A.",
    "127": "Banco Azteca, S.A.",
};

interface PagoData {
    patente: string;
    pedimento: string;
    aduana: string;
    bancoKey: string;
    lineaCaptura: string;
    importePagado: string;
    fechaPago: string;
    numOperacion: string;
    numTransaccion: string;
}

export const generatePagoPdf = (data: PagoData, format: 'blob' | 'base64' = 'blob'): Blob | string => {
    const doc = new jsPDF();
    const bankName = BANK_MAP[data.bancoKey] || `BANCO CLAVE ${data.bancoKey}`;

    // Header: "0323 02GP KUP1..." (The Linea Captura again often, or internal refs)
    // For visual fidelity to the sample, we'll put the Linea Captura at top right roughly
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(data.lineaCaptura, 120, 15);

    // Title
    doc.setFontSize(12);
    doc.text("***   PAGO ELECTRONICO   ***", 105, 25, { align: 'center' });

    // Main Info Block
    // PATENTE: 1774      PEDIMENTO: 3001931      ADUANA: 810
    doc.setFontSize(10);
    doc.text("PATENTE:", 15, 40);
    doc.setFont("helvetica", "normal");
    doc.text(data.patente, 45, 40);

    doc.setFont("helvetica", "bold");
    doc.text("PEDIMENTO:", 80, 40);
    doc.setFont("helvetica", "normal");
    doc.text(data.pedimento, 110, 40);

    doc.setFont("helvetica", "bold");
    doc.text("ADUANA:", 150, 40);
    doc.setFont("helvetica", "normal");
    doc.text(data.aduana, 175, 40);

    // Bank
    doc.setFont("helvetica", "bold");
    doc.text("BANCO:", 15, 50);
    doc.setFont("helvetica", "normal");
    doc.text(bankName, 45, 50);

    // Linea Captura
    doc.setFont("helvetica", "bold");
    doc.text("LÍNEA DE CAPTURA:", 15, 60);
    doc.setFont("helvetica", "normal");
    doc.text(data.lineaCaptura, 65, 60); // spaced out like 0323 02GP...

    // Importe & Fecha
    doc.setFont("helvetica", "bold");
    doc.text("IMPORTE PAGADO:", 15, 70);
    doc.setFont("helvetica", "normal");
    doc.text(`$${Number(data.importePagado).toLocaleString('en-US')}`, 65, 70);

    doc.setFont("helvetica", "bold");
    doc.text("FECHA Y HORA DE PAGO:", 110, 70);
    doc.setFont("helvetica", "normal");
    doc.text(data.fechaPago, 160, 70);

    // Operation Identifiers
    doc.setFont("helvetica", "bold");
    doc.text("NÚMERO DE OPERACIÓN BANCARIA:", 15, 80);
    doc.setFont("helvetica", "normal");
    doc.text(data.numOperacion, 90, 80);

    doc.setFont("helvetica", "bold");
    doc.text("NÚMERO DE TRANSACCIÓN SAT:", 15, 90);
    doc.setFont("helvetica", "normal");
    doc.text(data.numTransaccion, 90, 90);

    // Constant Fields
    doc.setFont("helvetica", "bold");
    doc.text("MEDIO DE PRESENTACIÓN:", 15, 100);
    doc.setFont("helvetica", "normal");
    doc.text("OTROS MEDIOS ELECTRÓNICOS (PAGO ELECTRÓNICO)", 90, 100);

    doc.setFont("helvetica", "bold");
    doc.text("MEDIO DE RECEPCIÓN/COBRO:", 15, 110);
    doc.setFont("helvetica", "normal");
    doc.text("EFECTIVO (CARGO A CUENTA)", 90, 110);


    if (format === 'base64') {
        const dataUri = doc.output('datauristring');
        return dataUri.split(',')[1]; // Return just base64
    }
    return doc.output('blob');
};
