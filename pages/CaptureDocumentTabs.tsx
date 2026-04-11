import React, { useState, useMemo } from 'react';
import {
  Download, FileText, FileCheck, Package, Truck, ClipboardList,
  Receipt, PackageOpen, Map, Table, ChevronLeft, ChevronRight
} from 'lucide-react';

// ─── Constantes globales CFMOTO ────────────────────────────────────────────
const CFM = {
  SHIPPER_NAME:       'CFMOTO MEXICO POWER, S. DE R.L. DE C.V.',
  SHIPPER_RFC:        'CMP220712ND9',
  SHIPPER_ADDR:       'Calle Tecnología No. 107, VYNMSA Apodaca Industrial Park, Apodaca, N.L. C.P. 66628',
  SHIPPER_STATE:      'NUEVO LEON',
  SHIPPER_CP:         '66628',
  CONSIGNEE_NAME:     'CFMOTO POWERSPORTS INC.',
  CONSIGNEE_ADDR:     '5005 Nathan Lane N, Plymouth MN 55442',
  CONSIGNEE_WAREHOUSE:'19351 Montrose ST Edgerton, KS 66021',
  CONSIGNEE_TAXID:    '22-3962475',
  CONSIGNEE_STATE:    'KANSAS',
  CONSIGNEE_CP:       '66021',
  CHINA_NAME:         'ZHEJIANG CFMOTO POWER CO., LTD',
  CHINA_ADDR:         'NO.116, WUZHOU ROAD, YUHANG ECONOMIC DEVELOPMENT ZONE, HANGZHOU 311100, ZHEJIANG PROVINCE, P.R.CHINA',
  CHINA_TAXID:        '91330100757206158J',
  FROM_PORT:          'Laredo',
  TO_PORT:            'Kansas',
  VIA:                'By Truck',
  AGENT:              'JAMCO NUEVO LAREDO',
  AGENT_CONTACT:      'HECTOR DE LA MIYAR',
  AGENT_PATENTE:      '1647',
  AGENT_TEL:          '(867) 719-4810',
  IMPORTER_CODE:      '26733',
  SHIPPER_CODE:       '26672',
  ORIGIN:             'MX',
  RULING:             'N318685',
  INCOTERM:           'FCA',
  PEDIMENTO_CLAVE:    'RT',
  FRACCION_DEFAULT:   '8703219900',
  TRANSPORT:          'TERRESTTE',
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] || 'SIN_GRUPO');
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r =>
    r.map(c => { const s = String(c ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function downloadTXT(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ─── Tab definitions ────────────────────────────────────────────────────────
const TABS = [
  { id: 'formato',       label: 'Formato',              short: 'FORMATO',         icon: FileText },
  { id: 'proforma',      label: 'Proforma Vehículos',   short: 'PROFORMA',        icon: Receipt },
  { id: 'bol',           label: 'Bill of Lading',       short: 'B/L',             icon: Truck },
  { id: 'instrucciones', label: 'CFM Instructions',     short: 'INSTRUCCIONES',   icon: ClipboardList },
  { id: 'cfc_cfp',       label: 'CFC → CFP Invoice',    short: 'CFC→CFP',         icon: FileCheck },
  { id: 'in_cfp',        label: 'Invoice CFM → CFP',    short: 'IN-CFM→CFP',      icon: Receipt },
  { id: 'pl_cfp',        label: 'Packing List',         short: 'PL-CFM→CFP',      icon: Package },
  { id: 'ccp',           label: 'LAY OUT CCP',          short: 'CCP',             icon: Map },
  { id: 'cfmoto_csv',    label: 'CFMOTO CSV',           short: 'CSV',             icon: Table },
];

// ─── Component ──────────────────────────────────────────────────────────────
interface Props {
  enrichedPayload: any[];
  infoEnvio: { invoiceNo: string; cfpContractNo: string };
}

export const CaptureDocumentTabs: React.FC<Props> = ({ enrichedPayload, infoEnvio }) => {
  const [activeTab, setActiveTab] = useState('formato');

  // ── Pre-computed data ──────────────────────────────────────────────────
  const data = useMemo(() => {
    const invoiceNo    = infoEnvio.invoiceNo;
    const asnNo        = infoEnvio.cfpContractNo;
    const invoiceSerie = 'CFM-';
    const invoiceFolio = invoiceNo.replace(/^CFM-/, '');
    const vins         = enrichedPayload;
    const invoiceDate  = vins[0]?.outDate || '';
    const totalUnits   = vins.length;
    const totalValUsd  = vins.reduce((s: number, v: any) => s + Number(v.valorUsd || 0), 0);
    const totalBruto   = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
    const totalNeto    = vins.reduce((s: number, v: any) => s + Number(v.pesoNeto || 0), 0);

    const containerGroups = groupBy(vins, 'containerNo');
    const modelGroups     = groupBy(vins, 'modelo');
    const containers      = Object.keys(containerGroups);

    return {
      invoiceNo, asnNo, invoiceSerie, invoiceFolio, invoiceDate,
      totalUnits, totalValUsd, totalBruto, totalNeto,
      vins, containerGroups, modelGroups, containers,
    };
  }, [enrichedPayload, infoEnvio]);

  // ── Shared header chip ────────────────────────────────────────────────
  const DocHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-4 pb-4 border-b border-slate-200">
      <h3 className="text-lg font-black text-slate-800">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );

  const FieldRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex gap-3 py-1 border-b border-slate-50">
      <span className="text-xs font-bold text-slate-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-mono">{value}</span>
    </div>
  );

  // ─── TAB: FORMATO (CFDI per VIN) ────────────────────────────────────────
  const renderFormato = () => {
    const inv = `${data.invoiceSerie}${data.invoiceFolio}`;
    return (
      <div className="space-y-6">
        <DocHeader title="FORMATO — Complemento de Comercio Exterior (CFDI por VIN)" subtitle={`Factura ${inv} · ${data.totalUnits} vehículos`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="font-bold text-slate-500 uppercase text-[10px]">Exportador</p>
            <p className="font-bold mt-1">{CFM.SHIPPER_NAME}</p>
            <p className="text-slate-500">RFC: {CFM.SHIPPER_RFC}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="font-bold text-slate-500 uppercase text-[10px]">Destinatario</p>
            <p className="font-bold mt-1">{CFM.CONSIGNEE_NAME}</p>
            <p className="text-slate-500">TAX ID: {CFM.CONSIGNEE_TAXID}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="font-bold text-slate-500 uppercase text-[10px]">Folio / Fecha</p>
            <p className="font-bold mt-1">{inv}</p>
            <p className="text-slate-500">{data.invoiceDate}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="font-bold text-slate-500 uppercase text-[10px]">Incoterm / Pedimento</p>
            <p className="font-bold mt-1">{CFM.INCOTERM} {CFM.FROM_PORT}</p>
            <p className="text-slate-500">Clave {CFM.PEDIMENTO_CLAVE} · {CFM.FRACCION_DEFAULT}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-[10px] whitespace-nowrap">
            <thead className="bg-slate-800 text-white text-[9px] uppercase">
              <tr>
                {['SERIE','FOLIO','CANT','OBJ. IMPUESTO','U.M. SAT','USO CFDI','CLAVE PROD SAT','DESCRIPCIÓN','NO. PARTE','P.U.','SUBTOTAL','IVA','RET','DESC','TOTAL','FRACCIÓN', 'U.M. ADUANA','CANT. ADU','PU ADUANA'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.vins.map((v: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-2 py-1.5 font-mono">{data.invoiceSerie}</td>
                  <td className="px-2 py-1.5 font-mono">{data.invoiceFolio}</td>
                  <td className="px-2 py-1.5 text-center">1</td>
                  <td className="px-2 py-1.5">{v.objetoImpuesto || '01- No objeto de impuesto'}</td>
                  <td className="px-2 py-1.5">H87 Pieza</td>
                  <td className="px-2 py-1.5">S01 Sin Efectos fiscales</td>
                  <td className="px-2 py-1.5 font-mono">{v.claveProductoSat || '25101503'}</td>
                  <td className="px-2 py-1.5 max-w-xs truncate" title={`VEHICULO UTILITARIO ( VIN ${v.vin} / ENGINE ${v.engine} / PESO NETO ${v.pesoNeto} KG / PESO BRUTO ${v.pesoBruto}) MODELO ${v.modelo}`}>
                    VEH. UTIL. VIN:{v.vin} / ENG:{v.engine} / {v.modelo}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{v.productNo || ''}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtUSD(Number(v.valorUsd || 0))}</td>
                  <td className="px-2 py-1.5 text-right">{fmtUSD(Number(v.valorUsd || 0))}</td>
                  <td className="px-2 py-1.5 text-center">0</td>
                  <td className="px-2 py-1.5 text-center">0</td>
                  <td className="px-2 py-1.5 text-center">0</td>
                  <td className="px-2 py-1.5 text-right font-bold">{fmtUSD(Number(v.valorUsd || 0))}</td>
                  <td className="px-2 py-1.5 font-mono">{v.taric || CFM.FRACCION_DEFAULT}</td>
                  <td className="px-2 py-1.5">{v.unidadAduana || '06 PIEZA'}</td>
                  <td className="px-2 py-1.5 text-center">{v.cantidadAduana ?? 1}</td>
                  <td className="px-2 py-1.5 text-right">{fmtUSD(Number(v.valorUsd || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 text-white text-[10px] font-bold">
              <tr>
                <td colSpan={9} className="px-2 py-2">TOTAL {data.totalUnits} VEH.</td>
                <td className="px-2 py-2 text-right">${fmtUSD(data.totalValUsd)}</td>
                <td className="px-2 py-2 text-right">${fmtUSD(data.totalValUsd)}</td>
                <td colSpan={3} className="px-2 py-2 text-center">0</td>
                <td className="px-2 py-2 text-right">${fmtUSD(data.totalValUsd)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button onClick={() => {
          const rows = [
            ['SERIE','FOLIO','CANTIDAD','OBJETO_IMPUESTO','UNIDAD_MEDIDA_SAT','USO_CFDI','CLAVE_PRODUCTO_SAT','DESCRIPCION','NO_PARTE','PRECIO_UNITARIO','SUBTOTAL','IVA','RETENCION','DESCUENTO','TOTAL','FRACCION_ARANCELARIA','UNIDAD_ADUANA','CANTIDAD_ADUANA','PU_ADUANA'],
            ...data.vins.map((v: any) => [
              data.invoiceSerie, data.invoiceFolio, 1,
              v.objetoImpuesto || '01- No objeto de impuesto', 'H87 Pieza', 'S01 Sin Efectos fiscales',
              v.claveProductoSat || '25101503',
              `VEHICULO UTILITARIO ( VIN ${v.vin} / ENGINE ${v.engine} / PESO NETO ${v.pesoNeto} KG / PESO BRUTO ${v.pesoBruto})  MODELO ${v.modelo}`,
              v.productNo || '', Number(v.valorUsd || 0).toFixed(2),
              Number(v.valorUsd || 0).toFixed(2), 0, 0, 0,
              Number(v.valorUsd || 0).toFixed(2),
              v.taric || CFM.FRACCION_DEFAULT,
              v.unidadAduana || '06 PIEZA', v.cantidadAduana ?? 1,
              Number(v.valorUsd || 0).toFixed(2)
            ]),
            [`${data.totalUnits}`, '', '', '', '', '', '', '', '', data.totalValUsd.toFixed(2), data.totalValUsd.toFixed(2), 0, 0, 0, data.totalValUsd.toFixed(2), '', '', '', ''],
          ];
          downloadCSV(rows, `formato_cfdi_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors">
          <Download size={16} /> Descargar FORMATO CSV
        </button>
      </div>
    );
  };

  // ─── TAB: PROFORMA VEHICULOS ────────────────────────────────────────────
  const renderProforma = () => {
    const modelGroups = data.modelGroups;
    return (
      <div className="space-y-6">
        <DocHeader title="PROFORMA DE VEHÍCULOS" subtitle={`Invoice ${data.invoiceNo} · ${data.totalUnits} unidades`} />
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <FieldRow label="Exportador" value={CFM.SHIPPER_NAME} />
            <FieldRow label="RFC" value={CFM.SHIPPER_RFC} />
            <FieldRow label="Dirección" value={CFM.SHIPPER_ADDR} />
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <FieldRow label="Destinatario" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="Tax ID" value={CFM.CONSIGNEE_TAXID} />
            <FieldRow label="Invoce No." value={data.invoiceNo} />
            <FieldRow label="Fecha" value={data.invoiceDate} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                {['Modelo','BOM/Expo','Año','Qty','U.M.','Precio Unit. USD','Total USD','Peso Neto KG','Peso Bruto KG','Fracción','Incoterm'].map(h => (
                  <th key={h} className="px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(modelGroups).map(([modelo, vins]: [string, any]) => {
                const sample = vins[0];
                const qty = vins.length;
                const unitVal = Number(sample?.valorUsd || 0);
                const total = qty * unitVal;
                const totalNeto = vins.reduce((s: number, v: any) => s + Number(v.pesoNeto || 0), 0);
                const totalBruto = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
                const year = sample?.outDate ? new Date(sample.outDate).getFullYear() : new Date().getFullYear();
                return (
                  <tr key={modelo}>
                    <td className="px-3 py-2 font-semibold">{modelo}</td>
                    <td className="px-3 py-2 font-mono text-indigo-700">{sample?.productNo || '—'}</td>
                    <td className="px-3 py-2">{year}</td>
                    <td className="px-3 py-2 text-center font-bold">{qty}</td>
                    <td className="px-3 py-2">UNIT</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">${fmtUSD(unitVal)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">${fmtUSD(total)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(totalNeto)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(totalBruto)}</td>
                    <td className="px-3 py-2 font-mono">{sample?.taric || CFM.FRACCION_DEFAULT}</td>
                    <td className="px-3 py-2">{sample?.incoterm || CFM.INCOTERM}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-xs">
              <tr>
                <td colSpan={3} className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-center">{data.totalUnits}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right text-emerald-700">${fmtUSD(data.totalValUsd)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(data.totalNeto)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(data.totalBruto)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => {
          const rows = [['MODELO','BOM_EXPO','AÑO','CANTIDAD','UM','PRECIO_UNIT_USD','TOTAL_USD','PESO_NETO_KG','PESO_BRUTO_KG','FRACCION','INCOTERM']];
          Object.entries(data.modelGroups).forEach(([modelo, vins]: [string, any]) => {
            const s = vins[0]; const qty = vins.length; const unitVal = Number(s?.valorUsd || 0);
            const year = s?.outDate ? new Date(s.outDate).getFullYear() : '';
            rows.push([modelo, s?.productNo||'', String(year), qty, 'UNIT', unitVal.toFixed(2), (qty*unitVal).toFixed(2),
              vins.reduce((a:number,v:any)=>a+Number(v.pesoNeto||0),0).toFixed(2),
              vins.reduce((a:number,v:any)=>a+Number(v.pesoBruto||0),0).toFixed(2),
              s?.taric||CFM.FRACCION_DEFAULT, s?.incoterm||CFM.INCOTERM]);
          });
          downloadCSV(rows, `proforma_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar Proforma CSV
        </button>
      </div>
    );
  };

  // ─── TAB: BILL OF LADING ────────────────────────────────────────────────
  const renderBOL = () => {
    return (
      <div className="space-y-6">
        <DocHeader title="BILL OF LADING" subtitle={`Invoice ${data.invoiceNo}`} />
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1.5">
            <p className="font-black text-blue-800 uppercase text-[10px] tracking-wider mb-2">SHIP FROM</p>
            <FieldRow label="Name" value={CFM.SHIPPER_NAME} />
            <FieldRow label="RFC" value={CFM.SHIPPER_RFC} />
            <FieldRow label="Address" value={CFM.SHIPPER_ADDR} />
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs space-y-1.5">
            <p className="font-black text-green-800 uppercase text-[10px] tracking-wider mb-2">SHIP TO</p>
            <FieldRow label="Name" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="Tax ID" value={CFM.CONSIGNEE_TAXID} />
            <FieldRow label="Warehouse" value={CFM.CONSIGNEE_WAREHOUSE} />
          </div>
        </div>

        {Object.entries(data.containerGroups).map(([containerNo, vins]: [string, any]) => {
          const sample = vins[0];
          const qty = vins.length;
          const modelGroups = groupBy(vins, 'modelo');
          const totalBruto = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
          const totalBrutoLb = totalBruto * 2.20462;
          return (
            <div key={containerNo} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-800 text-white px-5 py-3 flex justify-between">
                <span className="font-black font-mono text-lg">📦 {containerNo}</span>
                <span className="text-slate-300 text-sm">Sello: {sample?.sealNo || '—'}</span>
              </div>
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div><p className="text-slate-400 font-bold">INVOICE NO.</p><p className="font-mono font-bold">{data.invoiceNo}</p></div>
                <div><p className="text-slate-400 font-bold">ORDER NO. (ASN)</p><p className="font-mono font-bold">{data.asnNo}</p></div>
                <div><p className="text-slate-400 font-bold">ISSUE DATE</p><p className="font-mono font-bold">{data.invoiceDate}</p></div>
                <div><p className="text-slate-400 font-bold">AGENT</p><p className="font-bold">{CFM.AGENT}</p></div>
                {Object.entries(modelGroups).map(([modelo, mvins]: [string, any]) => (
                  <div key={modelo}><p className="text-slate-400 font-bold">MODELO</p><p className="font-semibold">{modelo}</p><p className="font-bold text-blue-700">{mvins.length} PCS</p></div>
                ))}
                <div><p className="text-slate-400 font-bold">TOTAL PCS</p><p className="font-mono font-bold text-xl text-blue-700">{qty}</p></div>
                <div><p className="text-slate-400 font-bold">G.W. (KG)</p><p className="font-mono font-bold">{fmtNum(totalBruto)} Kg</p></div>
                <div><p className="text-slate-400 font-bold">G.W. (LBS)</p><p className="font-mono font-bold">{fmtNum(totalBrutoLb)} Lbs</p></div>
              </div>
              <div className="border-t border-slate-100 p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">VINs en este contenedor</p>
                <div className="flex flex-wrap gap-1.5">
                  {vins.map((v: any) => (
                    <span key={v.vin} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">{v.vin}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <button onClick={() => {
          const rows = [['INVOICE_NO','ASN_NO','EMISION_DATE','MODELO','PCS','GW_KG','GW_LBS','CONTAINER_NO','SEAL_NO','SHIP_FROM','SHIP_TO','AGENT']];
          Object.entries(data.containerGroups).forEach(([containerNo, vins]: [string, any]) => {
            const s = vins[0]; const qty = vins.length;
            const totalBruto = vins.reduce((a:number,v:any) => a+Number(v.pesoBruto||0), 0);
            const modelSummary = Object.entries(groupBy(vins,'modelo')).map(([m,mv]:any) => `${m}(${mv.length})`).join('; ');
            rows.push([data.invoiceNo, data.asnNo, data.invoiceDate, modelSummary, qty, totalBruto.toFixed(2), (totalBruto*2.20462).toFixed(2), containerNo, s?.sealNo||'', CFM.SHIPPER_NAME, CFM.CONSIGNEE_NAME, CFM.AGENT]);
          });
          downloadCSV(rows, `bill_of_lading_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar B/L CSV
        </button>
      </div>
    );
  };

  // ─── TAB: CFM INSTRUCTIONS LETTER ───────────────────────────────────────
  const renderInstrucciones = () => {
    const firstContainer = data.containers[0] || '';
    const firstSeal = data.containerGroups[firstContainer]?.[0]?.sealNo || '';
    const fraccion = data.vins[0]?.taric || CFM.FRACCION_DEFAULT;
    const incoterm = data.vins[0]?.incoterm || CFM.INCOTERM;
    return (
      <div className="space-y-6">
        <DocHeader title="CARTA DE INSTRUCCIONES — EXPORTACIÓN" subtitle={`Factura ${data.invoiceNo}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3 tracking-wider">Información General</p>
            <FieldRow label="Exportador" value={CFM.SHIPPER_NAME} />
            <FieldRow label="Fecha" value={data.invoiceDate} />
            <FieldRow label="Factura(s)" value={data.invoiceNo} />
            <FieldRow label="No. Caja/Trailer" value={firstContainer} />
            <FieldRow label="Sello" value={firstSeal} />
            <FieldRow label="Packing List" value="SÍ" />
            <FieldRow label="B/L(s)" value="SÍ" />
            <FieldRow label="Vinculación" value="SÍ" />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3 tracking-wider">Tipo de Pedimento</p>
            <FieldRow label="Régimen" value="DEFINITIVO" />
            <FieldRow label="Clave" value={CFM.PEDIMENTO_CLAVE} />
            <FieldRow label="Fracción" value={fraccion} />
            <FieldRow label="Descripción" value="VEHICULO UTILITARIO" />
            <FieldRow label="Incoterms" value={incoterm} />
            <FieldRow label="Instrucciones especiales" value="DECLARAR VIN AND ENGINE NUMBERS OBSERVACIONES NIVEL PARTIDA" />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3 tracking-wider">Importador</p>
            <FieldRow label="Empresa" value={`${CFM.CHINA_NAME} / TAX ID: ${CFM.CHINA_TAXID}`} />
            <FieldRow label="Dirección" value={CFM.CHINA_ADDR} />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3 tracking-wider">Agente Aduanal</p>
            <FieldRow label="Agencia" value={CFM.AGENT} />
            <FieldRow label="Contacto" value={CFM.AGENT_CONTACT} />
            <FieldRow label="Patente" value={CFM.AGENT_PATENTE} />
            <FieldRow label="Teléfono" value={CFM.AGENT_TEL} />
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs">
          <p className="font-bold text-amber-800 mb-1">Contenedores incluidos en este envío:</p>
          <div className="flex gap-2 flex-wrap mt-1">
            {data.containers.map((c: string) => (
              <span key={c} className="font-mono bg-amber-100 text-amber-800 px-2 py-1 rounded-lg border border-amber-200 font-bold">{c} — Sello: {data.containerGroups[c]?.[0]?.sealNo || '—'}</span>
            ))}
          </div>
        </div>
        <button onClick={() => {
          const content = `CARTA DE INSTRUCCIONES - EXPORTACION\n${'='.repeat(50)}\nEXPORTADOR: ${CFM.SHIPPER_NAME}\nFECHA: ${data.invoiceDate}\nFACTURA(S): ${data.invoiceNo}\nNO. CAJA/TRAILER: ${firstContainer}\nSELLO: ${firstSeal}\n\nTIPO DE PEDIMENTO: DEFINITIVO\nCLAVE: ${CFM.PEDIMENTO_CLAVE}\nFRACCION: ${fraccion}\nDESCRIPCION: VEHICULO UTILITARIO\nINCOTERMS: ${incoterm}\n\nINSTRUCCIONES ESPECIALES:\nDECLARAR VIN AND ENGINE NUMBERS OBSERVACIONES NIVEL PARTIDA\n\nAGENTE ADUANAL: ${CFM.AGENT}\nCONTACTO: ${CFM.AGENT_CONTACT}\nPATENTE: ${CFM.AGENT_PATENTE}\nTEL: ${CFM.AGENT_TEL}\n\nIMPORTADOR: ${CFM.CHINA_NAME}\nTAX ID: ${CFM.CHINA_TAXID}\n`;
          downloadTXT(content, `instrucciones_${data.invoiceNo}.txt`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar Carta Instrucciones
        </button>
      </div>
    );
  };

  // ─── TAB: CFC → CFP (Chinese parent → US) ──────────────────────────────
  const renderCfcCfp = () => {
    return (
      <div className="space-y-6">
        <DocHeader title="COMMERCIAL INVOICE — CFC invoiced to CFP" subtitle="浙江春风动力股份有限公司 → CFMOTO Powersports Inc." />
        <div className="grid grid-cols-2 gap-6 text-xs">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5">
            <p className="font-black text-red-800 uppercase text-[10px] mb-2">SELLER</p>
            <FieldRow label="Company" value={CFM.CHINA_NAME} />
            <FieldRow label="Address" value={CFM.CHINA_ADDR} />
            <FieldRow label="Tax ID" value={CFM.CHINA_TAXID} />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
            <p className="font-black text-blue-800 uppercase text-[10px] mb-2">BUYER / TO</p>
            <FieldRow label="Company" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="Address" value={CFM.CONSIGNEE_ADDR} />
            <FieldRow label="INV NO." value={data.invoiceNo} />
            <FieldRow label="DATE" value={data.invoiceDate} />
            <FieldRow label="FROM → VIA → TO" value={`${CFM.FROM_PORT} → ${CFM.VIA} → ${CFM.TO_PORT}`} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                {['Marks & Numbers','DESCRIPTION','QUANTITY','U.M.','UNIT PRICE USD','AMOUNT USD'].map(h => (
                  <th key={h} className="px-4 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50 text-xs">
                <td colSpan={4} className="px-4 py-1.5 text-slate-400 italic">{CFM.INCOTERM} {CFM.FROM_PORT}</td>
                <td colSpan={2}></td>
              </tr>
              {Object.entries(data.modelGroups).map(([modelo, vins]: [string, any]) => {
                const qty = vins.length;
                const unitVal = Number(vins[0]?.valorUsd || 0);
                return (
                  <tr key={modelo}>
                    <td className="px-4 py-2 text-xs text-slate-500">Country of origin Mexico<br />REF. RULING {CFM.RULING}</td>
                    <td className="px-4 py-2 font-semibold">{modelo}</td>
                    <td className="px-4 py-2 text-center font-bold">{qty}</td>
                    <td className="px-4 py-2">UNIT</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-700">USD {fmtUSD(unitVal)}</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-700">USD {fmtUSD(qty * unitVal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-800 text-white font-bold text-xs">
              <tr>
                <td colSpan={3} className="px-4 py-2">TOTAL: {data.totalUnits} UNITS</td>
                <td className="px-4 py-2">USD</td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2 text-right">{fmtUSD(data.totalValUsd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => {
          const rows = [['SELLER','BUYER','INV_NO','DATE','FROM','VIA','TO','DESCRIPTION','QUANTITY','UM','UNIT_PRICE_USD','AMOUNT_USD']];
          Object.entries(data.modelGroups).forEach(([modelo, vins]: [string, any]) => {
            const qty = vins.length; const unitVal = Number(vins[0]?.valorUsd || 0);
            rows.push([CFM.CHINA_NAME, CFM.CONSIGNEE_NAME, data.invoiceNo, data.invoiceDate, CFM.FROM_PORT, CFM.VIA, CFM.TO_PORT, modelo, qty, 'UNIT', unitVal.toFixed(2), (qty*unitVal).toFixed(2)]);
          });
          rows.push(['','','','','','','','TOTAL', data.totalUnits, '', '', data.totalValUsd.toFixed(2)]);
          downloadCSV(rows, `cfc_cfp_invoice_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar CFC → CFP Invoice CSV
        </button>
      </div>
    );
  };

  // ─── TAB: IN — Invoice CFMOTO Mexico → CFP ──────────────────────────────
  const renderInCfp = () => {
    return (
      <div className="space-y-6">
        <DocHeader title="INVOICE — CFMOTO Mexico with CFM title to CFP" subtitle={`${CFM.SHIPPER_NAME} → ${CFM.CONSIGNEE_NAME}`} />
        <div className="grid grid-cols-2 gap-6 text-xs">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
            <p className="font-black text-orange-800 uppercase text-[10px] mb-2">SHIPPER (FROM)</p>
            <FieldRow label="Company" value={CFM.SHIPPER_NAME} />
            <FieldRow label="RFC" value={CFM.SHIPPER_RFC} />
            <FieldRow label="Address" value={CFM.SHIPPER_ADDR} />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
            <p className="font-black text-blue-800 uppercase text-[10px] mb-2">TO</p>
            <FieldRow label="Company" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="Address" value={CFM.CONSIGNEE_ADDR} />
            <FieldRow label="INV NO." value={data.invoiceNo} />
            <FieldRow label="DATE" value={data.invoiceDate} />
            <FieldRow label="Route" value={`${CFM.FROM_PORT} → ${CFM.VIA} → ${CFM.TO_PORT}`} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                {['Marks & Numbers','DESCRIPTION','QTY','UM','UNIT PRICE USD','TOTAL USD'].map(h => (
                  <th key={h} className="px-4 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="text-[10px] bg-slate-50">
                <td className="px-4 py-1 text-slate-400" colSpan={5}>{CFM.INCOTERM} {CFM.FROM_PORT}</td><td></td>
              </tr>
              {Object.entries(data.modelGroups).map(([modelo, vins]: [string, any]) => {
                const qty = vins.length;
                const s = vins[0];
                const unitVal = Number(s?.valorUsd || 0);
                const valAcero = Number(s?.valAcero ?? 0);
                const nonSteelUnit = valAcero > 0 ? (unitVal - valAcero) : unitVal;
                const year = s?.outDate ? new Date(s.outDate).getFullYear() : '';
                return (
                  <React.Fragment key={modelo}>
                    <tr className="font-semibold">
                      <td className="px-4 py-2 text-slate-500 text-[10px]">Country of origin Mexico<br />REF. RULING {CFM.RULING}</td>
                      <td className="px-4 py-2">{modelo} MODEL {year}</td>
                      <td className="px-4 py-2 text-center">{qty}</td>
                      <td className="px-4 py-2">UNIT</td>
                      <td className="px-4 py-2 text-right text-emerald-700">USD {fmtUSD(unitVal)}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">USD {fmtUSD(qty * unitVal)}</td>
                    </tr>
                    {valAcero > 0 && (<>
                      <tr className="bg-slate-50 text-slate-600">
                        <td className="px-4 py-1.5 text-[10px]">Steel Country of Melt/Pour: China</td>
                        <td className="px-4 py-1.5">Non-Steel Content</td>
                        <td colSpan={2}></td>
                        <td className="px-4 py-1.5 text-right">USD {fmtUSD(nonSteelUnit)}</td>
                        <td className="px-4 py-1.5 text-right">USD {fmtUSD(qty * nonSteelUnit)}</td>
                      </tr>
                      <tr className="bg-slate-50 text-slate-600">
                        <td className="px-4 py-1.5"></td>
                        <td className="px-4 py-1.5">Steel Content</td>
                        <td colSpan={2}></td>
                        <td className="px-4 py-1.5 text-right">USD {fmtUSD(valAcero)}</td>
                        <td className="px-4 py-1.5 text-right">USD {fmtUSD(qty * valAcero)}</td>
                      </tr>
                    </>)}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-800 text-white font-bold text-xs">
              <tr>
                <td colSpan={4} className="px-4 py-2">TOTAL</td>
                <td className="px-4 py-2 text-right">USD</td>
                <td className="px-4 py-2 text-right">{fmtUSD(data.totalValUsd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
          <FieldRow label="DESTINATARIO" value={`${CFM.CONSIGNEE_NAME} / TAX ID: ${CFM.CONSIGNEE_TAXID}`} />
          <FieldRow label="Dirección" value={CFM.CONSIGNEE_ADDR} />
          <FieldRow label="Incoterm" value={CFM.INCOTERM} />
        </div>

        <button onClick={() => {
          const rows = [['SHIPPER','TO','INV_NO','DATE','FROM','VIA','TO_PORT','DESCRIPTION','QTY','UM','UNIT_PRICE_USD','TOTAL_USD','TYPE']];
          Object.entries(data.modelGroups).forEach(([modelo, vins]: [string, any]) => {
            const s = vins[0]; const qty = vins.length; const unitVal = Number(s?.valorUsd||0);
            const year = s?.outDate ? new Date(s.outDate).getFullYear() : '';
            rows.push([CFM.SHIPPER_NAME, CFM.CONSIGNEE_NAME, data.invoiceNo, data.invoiceDate, CFM.FROM_PORT, CFM.VIA, CFM.TO_PORT, `${modelo} MODEL ${year}`, qty, 'UNIT', unitVal.toFixed(2), (qty*unitVal).toFixed(2), 'TOTAL']);
          });
          rows.push(['','','','','','','','GRAND TOTAL', data.totalUnits, '', '', data.totalValUsd.toFixed(2), '']);
          downloadCSV(rows, `in_cfm_cfp_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar IN-CFM→CFP CSV
        </button>
      </div>
    );
  };

  // ─── TAB: PL — Packing List CFM → CFP ───────────────────────────────────
  const renderPlCfp = () => {
    return (
      <div className="space-y-6">
        <DocHeader title="PACKING LIST — CFMOTO Mexico with CFM title to CFP" />
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
            <FieldRow label="Shipper" value={CFM.SHIPPER_NAME} />
            <FieldRow label="RFC" value={CFM.SHIPPER_RFC} />
            <FieldRow label="INV NO." value={data.invoiceNo} />
            <FieldRow label="DATE" value={data.invoiceDate} />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
            <FieldRow label="TO" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="Address" value={CFM.CONSIGNEE_ADDR} />
            <FieldRow label="SHIP FROM" value={CFM.FROM_PORT} />
            <FieldRow label="TO" value={CFM.TO_PORT} />
            <FieldRow label="VIA" value={CFM.VIA} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                {['Marks & Nos.','Description','QTY (CTNs)','QTY (UNIT)','G.W. (KGS)','N.W. (KGS)','MEAS (CBM)','NOTES'].map(h => (
                  <th key={h} className="px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(data.modelGroups).map(([modelo, vins]: [string, any]) => {
                const qty = vins.length;
                const s = vins[0];
                const pesoAcero = Number(s?.pesoAceroUnit ?? 0);
                const totalBruto = vins.reduce((a: number, v: any) => a + Number(v.pesoBruto || 0), 0);
                const totalNeto  = vins.reduce((a: number, v: any) => a + Number(v.pesoNeto || 0), 0);
                const steelTotal  = qty * pesoAcero;
                const nonSteelTotal = totalBruto - steelTotal;
                const vol = Number(s?.volumenUnitario || 0) * qty;
                const year = s?.outDate ? new Date(s.outDate).getFullYear() : '';
                return (
                  <React.Fragment key={modelo}>
                    <tr className="font-semibold">
                      <td className="px-3 py-2 text-[10px] text-slate-500">Country of origin Mexico<br />REF. RULING {CFM.RULING}</td>
                      <td className="px-3 py-2">{modelo} MODEL {year}</td>
                      <td className="px-3 py-2 text-center">{qty} CTNS</td>
                      <td className="px-3 py-2 text-center">{qty} UNIT</td>
                      <td className="px-3 py-2 text-right">{fmtNum(totalBruto)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(totalNeto)}</td>
                      <td className="px-3 py-2 text-right">{vol > 0 ? fmtNum(vol) : '—'}</td>
                      <td className="px-3 py-2"></td>
                    </tr>
                    {pesoAcero > 0 && (<>
                      <tr className="bg-slate-50 text-slate-600">
                        <td className="px-3 py-1.5 text-[10px]">Steel Country of Melt/Pour: China</td>
                        <td className="px-3 py-1.5">Non-Steel Content</td>
                        <td colSpan={2}></td>
                        <td className="px-3 py-1.5 text-right">{fmtNum(nonSteelTotal)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtNum(nonSteelTotal)}</td>
                        <td colSpan={2}></td>
                      </tr>
                      <tr className="bg-slate-50 text-slate-600">
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5">Steel Content</td>
                        <td colSpan={2}></td>
                        <td className="px-3 py-1.5 text-right">{fmtNum(steelTotal)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtNum(steelTotal)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </>)}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-800 text-white font-bold text-xs">
              <tr>
                <td colSpan={2} className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-center">{data.totalUnits} CTNS</td>
                <td className="px-3 py-2 text-center">{data.totalUnits} UNIT</td>
                <td className="px-3 py-2 text-right">{fmtNum(data.totalBruto)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(data.totalNeto)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => {
          const rows = [['SHIPPER','TO','INV_NO','DATE','FROM','VIA','TO_PORT','DESCRIPTION','QTY_CTN','QTY_UNIT','GW_KGS','NW_KGS','MEAS_CBM','TYPE']];
          Object.entries(data.modelGroups).forEach(([modelo, vins]: [string, any]) => {
            const s = vins[0]; const qty = vins.length;
            const pesoAcero = Number(s?.pesoAceroUnit ?? 0);
            const totalBruto = vins.reduce((a:number,v:any)=>a+Number(v.pesoBruto||0),0);
            const totalNeto  = vins.reduce((a:number,v:any)=>a+Number(v.pesoNeto||0),0);
            const vol = Number(s?.volumenUnitario||0)*qty;
            const year = s?.outDate ? new Date(s.outDate).getFullYear() : '';
            rows.push([CFM.SHIPPER_NAME, CFM.CONSIGNEE_NAME, data.invoiceNo, data.invoiceDate, CFM.FROM_PORT, CFM.VIA, CFM.TO_PORT, `${modelo} MODEL ${year}`, qty, qty, totalBruto.toFixed(2), totalNeto.toFixed(2), vol.toFixed(2), 'TOTAL']);
            if (pesoAcero > 0) {
              rows.push(['','','','','','','','Non-Steel Content','','', (totalBruto-qty*pesoAcero).toFixed(2),(totalNeto-qty*pesoAcero).toFixed(2),'','STEEL_DETAIL']);
              rows.push(['','','','','','','','Steel Content','','',(qty*pesoAcero).toFixed(2),(qty*pesoAcero).toFixed(2),'','STEEL_DETAIL']);
            }
          });
          rows.push(['','','','','','','','TOTAL',data.totalUnits,data.totalUnits,data.totalBruto.toFixed(2),data.totalNeto.toFixed(2),'','GRAND_TOTAL']);
          downloadCSV(rows, `packing_list_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar Packing List CSV
        </button>
      </div>
    );
  };

  // ─── TAB: LAY OUT CCP ────────────────────────────────────────────────────
  const renderCCP = () => {
    const firstContainer = data.containers[0] || '';
    const firstSeal = data.containerGroups[firstContainer]?.[0]?.sealNo || '';
    return (
      <div className="space-y-6">
        <DocHeader title="LAY OUT ARCBETS — Datos Carta Porte (CCP)" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3">Datos Origen (Remitente)</p>
            <FieldRow label="Empresa" value={CFM.SHIPPER_NAME} />
            <FieldRow label="RFC Remitente" value={CFM.SHIPPER_RFC} />
            <FieldRow label="Estado" value={CFM.SHIPPER_STATE} />
            <FieldRow label="País" value="MEXICO" />
            <FieldRow label="Código Postal" value={CFM.SHIPPER_CP} />
            <FieldRow label="Fecha/Hora de Salida" value={data.invoiceDate} />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3">Datos Destino (Destinatario)</p>
            <FieldRow label="Empresa" value={CFM.CONSIGNEE_NAME} />
            <FieldRow label="RFC/Tax ID" value={CFM.CONSIGNEE_TAXID.replace('-','')} />
            <FieldRow label="Estado" value={CFM.CONSIGNEE_STATE} />
            <FieldRow label="País" value="USA" />
            <FieldRow label="Código Postal" value={CFM.CONSIGNEE_CP} />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs space-y-2 md:col-span-2">
            <p className="font-black text-slate-700 uppercase text-[10px] mb-3">Mercancías</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-slate-400 font-bold">Total Unidades</p><p className="font-bold text-xl">{data.totalUnits}</p></div>
              <div><p className="text-slate-400 font-bold">Valor Mercancias USD</p><p className="font-bold text-xl text-emerald-700">${fmtUSD(data.totalValUsd)}</p></div>
              <div><p className="text-slate-400 font-bold">Peso Bruto KG</p><p className="font-bold text-xl">{fmtNum(data.totalBruto)}</p></div>
              <div><p className="text-slate-400 font-bold">No. Caja/Trailer</p><p className="font-mono font-bold text-xl">{firstContainer}</p></div>
            </div>
            <div className="mt-4">
              <p className="font-bold text-slate-500 mb-2 text-[10px] uppercase">Detalle por VIN</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] whitespace-nowrap border border-slate-200">
                  <thead className="bg-slate-200 text-slate-700">
                    <tr>
                      {['#','Modelo','VIN','Motor','Peso Bruto KG','Peso Neto KG','Contenedor'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.vins.map((v: any, i: number) => (
                      <tr key={i} className={i%2===0?'bg-white':'bg-slate-50'}>
                        <td className="px-2 py-1">{i+1}</td>
                        <td className="px-2 py-1">{v.modelo}</td>
                        <td className="px-2 py-1 font-mono font-bold">{v.vin}</td>
                        <td className="px-2 py-1 font-mono">{v.engine}</td>
                        <td className="px-2 py-1 text-right">{v.pesoBruto}</td>
                        <td className="px-2 py-1 text-right">{v.pesoNeto}</td>
                        <td className="px-2 py-1 font-mono">{v.containerNo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => {
          const rows = [
            ['CAMPO','DATO'],
            ['DATOS ORIGEN',''],['Empresa',CFM.SHIPPER_NAME],['RFC Remitente',CFM.SHIPPER_RFC],['Estado',CFM.SHIPPER_STATE],['País','MEXICO'],['Código Postal',CFM.SHIPPER_CP],['Fecha Salida',data.invoiceDate],
            ['DATOS DESTINO',''],['Empresa',CFM.CONSIGNEE_NAME],['RFC/Tax ID',CFM.CONSIGNEE_TAXID.replace('-','')],['Estado',CFM.CONSIGNEE_STATE],['País','USA'],['Código Postal',CFM.CONSIGNEE_CP],
            ['MERCANCIAS',''],['Total Unidades',data.totalUnits],['Valor USD',data.totalValUsd.toFixed(2)],['Peso Bruto KG',data.totalBruto.toFixed(2)],['No. Contenedor',firstContainer],['No. Sello',firstSeal],
            ['',''],
            ['#','MODELO','VIN','MOTOR','PESO_BRUTO_KG','PESO_NETO_KG','CONTENEDOR'],
            ...data.vins.map((v: any, i: number) => [i+1, v.modelo, v.vin, v.engine, Number(v.pesoBruto||0).toFixed(2), Number(v.pesoNeto||0).toFixed(2), v.containerNo])
          ];
          downloadCSV(rows, `layout_ccp_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Download size={16} /> Descargar LAY OUT CCP CSV
        </button>
      </div>
    );
  };

  // ─── TAB: CFMOTO CSV (US Customs) ───────────────────────────────────────
  const renderCfmotoCSV = () => {
    const headers = ['INVOICE','ASN NUMBER','LINE','IMPORTER','CONSIGNEE','SHIPPER','INV-DATE','HTS DUT/VALUE','WEIGHT-KILOS','PART DESC','QTY','ORIGIN','PART-NO.','PART-NO. CFMOTO','MID','TRLR-NO.','NO.-PALLETS','UOM','P.O-NO.','HTS','RELATED','SPI','Import Code','Industry Code','Model','Model Year','MFG Month/Yr','Date Location Code','Item ID No Type','Item ID No','Test Group Name/No'];
    const rows = data.vins.map((v: any, i: number) => {
      const isFirst = i === 0;
      const mfgMonth = v.productionDate ? String(v.productionDate).slice(0, 6) : '';
      const mfgYr = mfgMonth || (v.outDate ? `01${new Date(v.outDate).getFullYear()}` : '');
      const modelYear = v.outDate ? new Date(v.outDate).getFullYear() : '';
      const modelCode = v.modelo ? ' ' + v.modelo : '';
      return [
        isFirst ? data.invoiceNo : '',
        isFirst ? data.asnNo : '',
        i + 1,
        isFirst ? CFM.IMPORTER_CODE : '',
        isFirst ? CFM.IMPORTER_CODE : '',
        isFirst ? CFM.SHIPPER_CODE : '',
        isFirst ? data.invoiceDate : '',
        isFirst ? data.totalValUsd.toFixed(2) : '',
        isFirst ? data.totalBruto.toFixed(2) : '',
        'UTV VEHICLES',
        isFirst ? data.totalUnits : '',
        CFM.ORIGIN,
        v.modelo || '',
        v.modelo || '',
        v.mid || '',
        v.containerNo || '',
        1,
        'PCS',
        v.htsus || '',
        v.htsus || '',
        'Y',
        '1',
        'F',
        '',
        modelCode,
        modelYear,
        mfgYr,
        'Vehicle',
        'VIN',
        v.vin,
        v.testGroupNameNo || '',
      ];
    });

    return (
      <div className="space-y-6">
        <DocHeader title="CFMOTO CSV — US Customs Import Format" subtitle={`${data.totalUnits} VINs · Invoice ${data.invoiceNo}`} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-[10px] whitespace-nowrap">
            <thead className="bg-slate-800 text-white text-[9px] uppercase sticky top-0 z-10">
              <tr>
                {headers.map(h => <th key={h} className="px-2 py-2 text-left font-bold border-r border-slate-700 last:border-0">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {row.map((cell, j) => (
                    <td key={j} className={`px-2 py-1.5 border-r border-slate-50 last:border-0 ${j >= 28 ? 'font-mono font-bold text-blue-700' : j === 0 ? 'font-mono font-bold text-slate-800' : 'text-slate-600'}`}>
                      {cell !== '' && cell !== undefined && cell !== null ? String(cell) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => {
          downloadCSV([headers, ...rows], `cfmoto_csv_${data.invoiceNo}.csv`);
        }} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg shadow-blue-500/25">
          <Download size={16} /> Descargar CFMOTO CSV (US Customs)
        </button>
      </div>
    );
  };

  // ─── Tab renderer ────────────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case 'formato':       return renderFormato();
      case 'proforma':      return renderProforma();
      case 'bol':           return renderBOL();
      case 'instrucciones': return renderInstrucciones();
      case 'cfc_cfp':       return renderCfcCfp();
      case 'in_cfp':        return renderInCfp();
      case 'pl_cfp':        return renderPlCfp();
      case 'ccp':           return renderCCP();
      case 'cfmoto_csv':    return renderCfmotoCSV();
      default:              return null;
    }
  };

  const activeIdx = TABS.findIndex(t => t.id === activeTab);

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab strip */}
      <div className="bg-slate-900 px-4 pt-4 flex items-end gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                isActive
                  ? 'bg-white text-slate-800 border-white shadow-sm'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon size={12} />
              {tab.short}
            </button>
          );
        })}
        <div className="flex ml-auto pb-2 gap-1">
          <button onClick={() => setActiveTab(TABS[Math.max(0, activeIdx-1)].id)} disabled={activeIdx === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setActiveTab(TABS[Math.min(TABS.length-1, activeIdx+1)].id)} disabled={activeIdx === TABS.length-1}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {renderTab()}
      </div>
    </div>
  );
};

export default CaptureDocumentTabs;
