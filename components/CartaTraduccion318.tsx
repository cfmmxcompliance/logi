import React from 'react';
import { CommercialInvoiceItem } from '../types';
import { LOGO_BASE64 } from '../src/constants/logo';

interface CartaTraduccion318Props {
  items: CommercialInvoiceItem[];
  pedimentos: Record<string, string>; // Record<regimen, pedimentoNumber>
}

export const CartaTraduccion318: React.FC<CartaTraduccion318Props> = ({ items, pedimentos }) => {
  // Group items by regimen
  const itemsByRegimen = items.reduce((acc, item) => {
    const regimen = item.regimen || 'IN'; // Default to IN if no regimen is provided (though it should be known)
    if (!acc[regimen]) acc[regimen] = [];
    acc[regimen].push(item);
    return acc;
  }, {} as Record<string, CommercialInvoiceItem[]>);

  const todayStr = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Calculate sum of totalAmount for an array of items
  const calculateTotal = (invoiceItems: CommercialInvoiceItem[]) => {
    return invoiceItems.reduce((sum, it) => sum + (it.totalAmount || 0), 0);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  return (
    <div id="carta-pdf-container" className="w-full bg-white print:m-0 print:p-0">
      {Object.entries(itemsByRegimen).map(([regimen, itemsForRegimen], regimenIndex) => {
        const regimenItems = itemsForRegimen as CommercialInvoiceItem[];
        // Group regimen items by invoiceNo
        const itemsByInvoice = regimenItems.reduce((acc, item) => {
          let inv = item.invoiceNo || 'S/F';
          if (regimen === 'A1' && !inv.endsWith('-A1')) {
            inv = `${inv}-A1`;
          }
          if (!acc[inv]) acc[inv] = [];
          acc[inv].push(item);
          return acc;
        }, {} as Record<string, CommercialInvoiceItem[]>);

        return (
          <div key={regimen} data-regimen={regimen} className="print:p-8 p-8 max-w-5xl mx-auto bg-white shadow-lg print:shadow-none mb-8 text-[11px] leading-tight font-sans text-black">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <img src={`data:image/png;base64,${LOGO_BASE64}`} alt="CFMOTO Logo" className="h-10" />
              <div className="text-right font-bold text-sm uppercase">
                ASUNTO: CARTA DE TRADUCCION DE FACTURA<br />
                MANZANILLO, MANZANILLO, COLIMA. a {todayStr}
              </div>
            </div>

            <div className="mb-4 uppercase">
              <strong>C. Titular de la Aduana de</strong><br />
              MANZANILLO, MANZANILLO, COLIMA.<br />
              <strong>P R E S E N T E:</strong>
            </div>

            <div className="mb-4 text-justify">
              <strong>IMPORTADOR:</strong> CFMOTO MEXICO POWER S DE RL DE CV<br />
              <strong>RFC:</strong> CMP220712ND9<br />
              <strong>DIRECCIÓN:</strong> CALLE TECNOLOGIA, No. 107, VYNMSA APODACA INDUSTRIAL PARK, C.P. 66628, CIUDAD APODACA, APODACA, NUEVO LEÓN, MEXICO
            </div>

            <div className="mb-4 text-justify">
              C. RAUL SERGIO MEDINA TOSCANO, REPRESENTANTE LEGAL DE CFMOTO MEXICO POWER S DE RL DE CV CON R.F.C: METR6805041K5 Y C.U.R.P: METR680504HNLDSL00, EXPONGO LO SIGUIENTE:
            </div>

            <div className="mb-6 text-justify">
              DE CONFORMIDAD CON EL ART.36-A, FRACCIÓN I INCISO A) Y ARTÍCULO 59-A, DE LA LEY ADUANERA EN VIGOR Y REGLA 3.1.8 DE CARÁCTER GENERAL EN MATERIA DE COMERCIO EXTERIOR VIGENTES, DECLARO BAJO PROTESTA DE DECIR VERDAD, QUE LA TRADUCCION DE LA FACTURA COMERCIAL{' '}
              <strong>{Object.keys(itemsByInvoice).join(' Y ')}</strong>{' '}
              DE MI PROVEEDOR ZHEJIANG CFMOTO POWER CO.,LTD ES LA SIGUIENTE: A CONTINUACIÓN DECLARAMOS LOS DATOS OMITIDOS EN LAS FACTURAS CORRESPONDIENTES A LA IMPORTACIÓN QUE POR ESA ADUANA A SU CARGO ESTAMOS LLEVANDO A CABO AL AMPARO DEL{' '}
              <strong>PEDIMENTO {pedimentos[regimen] || '_________________'}</strong>, Y QUE SON:
            </div>

            {/* Invoices */}
            {Object.entries(itemsByInvoice).map(([invoiceNo, itemsForInvoice], index) => {
              const invoiceItems = itemsForInvoice as CommercialInvoiceItem[];
              const invoiceTotal = calculateTotal(invoiceItems);
              const dateStr = invoiceItems[0]?.date || '';
              const parts = dateStr.split('-');
              const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
              const currencyStr = (invoiceItems[0]?.currency || 'USD').toUpperCase() === 'USD' ? 'DOLAR' : invoiceItems[0]?.currency || 'DOLAR';

              return (
                <div key={invoiceNo} className="mb-6 border border-slate-300 p-2">
                  {/* Invoice Summary Table */}
                  <table className="w-full text-center border-b border-slate-300 mb-2">
                    <thead>
                      <tr className="font-bold border-b border-slate-300">
                        <th className="pb-1 font-semibold">Factura</th>
                        <th className="pb-1 font-semibold">Fecha</th>
                        <th className="pb-1 font-semibold">Seguros</th>
                        <th className="pb-1 font-semibold">Fletes</th>
                        <th className="pb-1 font-semibold">Embalajes</th>
                        <th className="pb-1 font-semibold">Otros</th>
                        <th className="pb-1 font-semibold">Incoterm</th>
                        <th className="pb-1 font-semibold">Moneda</th>
                        <th className="pb-1 font-semibold">Valor Factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pt-1">{invoiceNo}</td>
                        <td className="pt-1">{formattedDate}</td>
                        <td className="pt-1">0.00</td>
                        <td className="pt-1">0.00</td>
                        <td className="pt-1">0.00</td>
                        <td className="pt-1">0.00</td>
                        <td className="pt-1">{invoiceItems[0]?.incoterm || 'CIF'}</td>
                        <td className="pt-1">{currencyStr}</td>
                        <td className="pt-1">{formatCurrency(invoiceTotal)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="mb-2 text-[10px]">Que contiene(n) la(s) siguiente(s) mercancía(s):</div>

                  {/* Items Detail Table */}
                  <table className="w-full text-center">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="pb-1 font-semibold">Número</th>
                        <th className="pb-1 font-semibold">Cantidad</th>
                        <th className="pb-1 font-semibold">UMC</th>
                        <th className="pb-1 font-semibold text-left">Descripción</th>
                        <th className="pb-1 font-semibold">Fracción</th>
                        <th className="pb-1 font-semibold">Origen</th>
                        <th className="pb-1 font-semibold">Valor Unitario</th>
                        <th className="pb-1 font-semibold">Moneda</th>
                        <th className="pb-1 font-semibold">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 border-b border-slate-300">
                      {invoiceItems.map((item, i) => (
                        <React.Fragment key={item.id}>
                          <tr>
                            <td className="pt-1 align-top">{i + 1}</td>
                            <td className="pt-1 align-top">{item.qty?.toFixed(3) || '0.000'}</td>
                            <td className="pt-1 align-top">{item.um || item.unidad || 'PIEZA'}</td>
                            <td className="pt-1 align-top text-left font-medium">{item.spanishDescription || item.rawDescripcion || ''}</td>
                            <td className="pt-1 align-top">{item.hts || ''}</td>
                            <td className="pt-1 align-top">CHINA</td>
                            <td className="pt-1 align-top">{formatCurrency(item.unitPrice || 0)}</td>
                            <td className="pt-1 align-top">{currencyStr}</td>
                            <td className="pt-1 align-top font-semibold">{formatCurrency(item.totalAmount || 0)}</td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}

            <div className="text-left font-bold uppercase text-[10px] mb-4">
              PROVEEDOR: ZHEJIANG CFMOTO POWER CO., LTD <br />
              DIRECCIÓN: WUZHOU ROAD, NO. EXT: 116, NO. INT: SN, YUHANG ECONOMIC DEVELOPMENT ZONE, C.P. 311100, HANGZHOU, CHINA <br />
              TAX ID: 91330100757206158J
            </div>

            <div className="text-justify mb-12 uppercase text-[10px]">
              ACEPTANDO TODA RESPONSABILIDAD LEGAL QUE IMPLIQUE EL INCUMPLIMIENTO DE LO ANTERIORMENTE MENCIONADO Y LAS SANCIONES QUE NOS HAGAMOS ACREEDORES.
            </div>

            {/* Footer Signatures */}
            <div className="mt-12 text-center break-inside-avoid">
              <div className="mb-20 font-bold tracking-[0.3em]">
                A t e n t a m e n t e
              </div>
              <div className="w-72 mx-auto border-t border-black pt-2">
                <div className="font-bold text-xs mb-1">FIRMA</div>
                <div className="text-xs mb-1 uppercase">RAUL SERGIO MEDINA TOSCANO</div>
                <div className="text-xs mb-8 uppercase">REPRESENTANTE LEGAL</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
