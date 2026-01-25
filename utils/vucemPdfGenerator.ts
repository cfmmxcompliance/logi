
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Cove } from '../services/vucem/types';

export const generateCovePdf = (cove: Cove, outputType: 'download' | 'base64' | 'blob' = 'download'): string | Blob | void => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Header ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE VALOR ELECTRÓNICO (COVE)', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`eDocument: ${cove.eDocument}`, pageWidth - 15, 25, { align: 'right' });
    doc.text(`Fecha: ${cove.fechaExpedicion}`, pageWidth - 15, 30, { align: 'right' });

    // --- Emisor / Destinatario Section ---
    doc.autoTable({
        startY: 40,
        head: [['DATOS DEL EMISOR', 'DATOS DEL DESTINATARIO']],
        body: [[
            `Nombre: ${cove.emisor.nombre || 'N/A'}\nID: ${cove.emisor.identificacion}\nDomicilio: ${cove.emisor.domicilio.calle} ${cove.emisor.domicilio.numeroExterior}, ${cove.emisor.domicilio.colonia || ''}, ${cove.emisor.domicilio.municipio || ''}, ${cove.emisor.domicilio.pais}`,
            `Nombre: ${cove.destinatario.nombre || 'N/A'}\nID: ${cove.destinatario.identificacion}\nDomicilio: ${cove.destinatario.domicilio.calle} ${cove.destinatario.domicilio.numeroExterior}, ${cove.destinatario.domicilio.colonia || ''}, ${cove.destinatario.domicilio.municipio || ''}, ${cove.destinatario.domicilio.pais}`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 3 }
    });

    // --- General Info ---
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 5,
        head: [['Tipo Operación', 'Tipo Figura', 'Factura / Relación']],
        body: [[cove.tipoOperacion, cove.tipoFigura, cove.numeroFacturaRelacionFacturas]],
        theme: 'grid',
        headStyles: { fillColor: [52, 73, 94] },
        styles: { fontSize: 9 }
    });

    // --- Mercancías ---
    const mercanciasData = cove.facturas.flatMap(f =>
        f.mercancias.map(m => [
            m.descripcionGenerica,
            m.cantidad,
            m.claveUnidadMedida,
            `$${m.valorUnitario.toFixed(2)}`,
            `$${m.valorTotal.toFixed(2)}`,
            m.tipoMoneda
        ])
    );

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Descripción', 'Cant', 'UM', 'Precio Unit', 'Total', 'Moneda']],
        body: mercanciasData,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] },
        styles: { fontSize: 8 }
    });

    // --- Footer / Observations ---
    if (cove.observaciones) {
        doc.setFontSize(8);
        doc.text('Observaciones:', 15, doc.lastAutoTable.finalY + 10);
        doc.setFont('helvetica', 'italic');
        doc.text(cove.observaciones, 15, doc.lastAutoTable.finalY + 15, { maxWidth: pageWidth - 30 });
    }

    // --- Metadata / Legal Strip ---
    const finalY = doc.lastAutoTable.finalY + 25;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Este documento es una representación impresa de un Comprobante de Valor Electrónico transmitido a VUCEM.', pageWidth / 2, pageWidth > 200 ? 285 : 275, { align: 'center' });

    if (outputType === 'base64') {
        const str = doc.output('datauristring');
        return str.split(',')[1]; // Return only the base64 part
    } else if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`COVE_${cove.eDocument}.pdf`);
    }
};
