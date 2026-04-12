/**
 * CaptureDocumentTabs.tsx
 * Genera los 9 documentos del motor de captura con formato EXACTO al Excel LOUT-8LK MACROS 2.7
 * Cada pestaña → CSV que replica columna por columna el sheet correspondiente.
 */
import React, { useState, useMemo } from 'react';
import {
  Download, FileText, FileCheck, Package, Truck, ClipboardList,
  Receipt, PackageOpen, Map, Table2, ChevronLeft, ChevronRight
} from 'lucide-react';

// ─── Constantes estáticas CFMOTO ─────────────────────────────────────────
const C = {
  SHIPPER_NAME:        'CFMOTO MEXICO POWER, S. DE R.L. DE C.V.',
  SHIPPER_RFC:         'CMP220712ND9',
  SHIPPER_ADDR:        'Tecnología 107, VYNMSA Apodaca Industrial Park, Apodaca, Nuevo León, México C.P. 66628',
  SHIPPER_ADDR_FULL:   'CALLE TECNOLOGIA NO. 107, COL.VYNMSA APODACA INDUSTRIAL PARK, APODACA, NUEVO LEÓN C.P. 66628 RFC: CMP220712ND9',
  SHIPPER_STATE:       'NUEVO LEON',
  SHIPPER_CP:          '66628',
  SHIPPER_TEL:         'Lizeth Sanchéz 462 332 4336',
  SHIPPER_EMAIL:       'lizeth.flores@cfmoto.com',

  CONSIGNEE_NAME:      'CFMOTO POWERSPORTS INC.',
  CONSIGNEE_ADDR:      '5005 Nathan Lane N, Plymouth MN 55442',
  CONSIGNEE_ADDR_SHORT:'5005 Nathan Lane N Plymouth, MN 55442',
  CONSIGNEE_WAREHOUSE: 'Smart Warehouse 19351 Montrose ST Edgerton, KS 66021',
  CONSIGNEE_TEL:       '913-802-2663',
  CONSIGNEE_TAXID:     '22-3962475',
  CONSIGNEE_STATE:     'KANSAS',
  CONSIGNEE_CP:        '66021',

  CHINA_NAME:          'ZHEJIANG CFMOTO POWER CO.,LTD',
  CHINA_ADDR:          'WUZHOU ROAD, YUHANG\nECONOMIC DEVELOPMENT ZONE NUM.\nEXT. 116 C.P. 311100 HANGZHOU\nZHEJIANG, CHINA (REPUBLICA POPULAR)',
  CHINA_TAXID:         '91330100757206158J',

  FROM_PORT:           'Laredo',
  TO_PORT:             'Kansas',
  VIA:                 'By Truck',
  VIA_UPPER:           'BY TRUCK',
  AGENT:               'Arcbest',
  AGENT_ADUANAL:       'JAMCO NUEVO LAREDO',
  AGENT_CONTACTO:      'HECTOR DE LA MIYAR',
  AGENT_PATENTE:       '1647',
  AGENT_TEL:           '(867) 719-4810 o 719-47-99  Ext.5261',
  CUSTOMS_CONTACTO:    'J. AUGUSTO LAZO',

  IMPORTER_CODE:       '26733',
  SHIPPER_CODE:        '26672',
  ORIGIN:              'MX',
  RULING:              'N318685',
  INCOTERM:            'FCA',
  PEDIMENTO_CLAVE:     'RT',
  FRACCION_DEFAULT:    '8703219900',
  DESC_MERCH:          'VEHICULO UTILITARIO',
  BRAND:               'CFMOTO',
  MARCA_SAT:           '25101503',  // Clave producto SAT default
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] ?? 'SIN_GRUPO');
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/** Formatea número con separador de miles y 2 decimales (estilo US) */
function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Crea una fila de ncols sin valores, luego llena las posiciones indicadas */
function mkrow(ncols: number, vals: Record<number, string | number>): string[] {
  const r: string[] = Array(ncols).fill('');
  Object.entries(vals).forEach(([ci, v]) => { r[Number(ci)] = v === null || v === undefined ? '' : String(v); });
  return r;
}

/** Descarga un array de filas como CSV con BOM UTF-8 */
function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r =>
    r.map(c => {
      const s = String(c ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/** Convierte un monto USD a texto en inglés (e.g. 40440 → "FORTY THOUSAND FOUR HUNDRED AND FORTY DOLLARS") */
function amountToWords(amount: number): string {
  const ONES = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN',
    'ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const TENS = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  function hundreds(n: number): string {
    if (n === 0) return '';
    let s = '';
    if (n >= 100) { s += ONES[Math.floor(n/100)] + ' HUNDRED '; n %= 100; }
    if (n >= 20)  { s += TENS[Math.floor(n/10)]; if (n%10) s += ' ' + ONES[n%10]; }
    else if (n > 0) s += ONES[n];
    return s.trim();
  }
  const d = Math.floor(amount);
  const parts: string[] = [];
  if (d >= 1000000) parts.push(hundreds(Math.floor(d/1000000)) + ' MILLION');
  if (d >= 1000)    parts.push(hundreds(Math.floor((d%1000000)/1000)) + ' THOUSAND');
  const remain = hundreds(d % 1000);
  if (remain) parts.push(remain);
  const words = parts.join(' ').trim();
  return (words || 'ZERO') + ' DOLLAR' + (d !== 1 ? 'S' : '');
}

/** Extrae el código de modelo corto: '1000CC UTV CM1000UZ-8LK' → 'CM1000UZ-8LK' */
function modelCode(modelo: string): string {
  return modelo.split(' ').pop() || modelo;
}

// ─── Definición de pestañas ───────────────────────────────────────────────
const TABS = [
  { id: 'formato',       label: 'Formato (CFDI)',       short: 'FORMATO',       icon: FileText      },
  { id: 'proforma',      label: 'Proforma Vehículos',   short: 'PROFORMA',      icon: Receipt       },
  { id: 'bol',           label: 'Bill of Lading',       short: 'B/L',           icon: Truck         },
  { id: 'instrucciones', label: 'CFM Instructions',     short: 'INSTRUCCIONES', icon: ClipboardList },
  { id: 'cfc_cfp',       label: 'CFC → CFP Invoice',    short: 'CFC→CFP',       icon: FileCheck     },
  { id: 'in_cfp',        label: 'Invoice CFM → CFP',    short: 'IN-CFM→CFP',    icon: Receipt       },
  { id: 'pl_cfp',        label: 'Packing List',         short: 'PL-CFM→CFP',    icon: Package       },
  { id: 'ccp',           label: 'LAY OUT CCP',          short: 'CCP',           icon: Map           },
  { id: 'cfmoto_csv',    label: 'CFMOTO CSV',           short: 'CSV',           icon: Table2        },
];

// ─── Tipos ────────────────────────────────────────────────────────────────
interface Props {
  enrichedPayload: any[];
  infoEnvio: { invoiceNo: string; cfpContractNo: string };
}

// ─── Componente principal ─────────────────────────────────────────────────
export const CaptureDocumentTabs: React.FC<Props> = ({ enrichedPayload, infoEnvio }) => {
  const [activeTab, setActiveTab] = useState('cfmoto_csv');

  // ── Datos pre-calculados comunes ─────────────────────────────────────
  const D = useMemo(() => {
    const vins        = enrichedPayload;
    const invoiceNo   = infoEnvio.invoiceNo;       // e.g. "CFM-25CFTT405986-21"
    const asnNo       = infoEnvio.cfpContractNo;   // e.g. "CFM-25MX-CFM403586C-21"
    const serie       = 'CFM-';
    const folio       = invoiceNo.replace(/^CFM-/, '');
    const invoiceDate = vins[0]?.outDate || '';
    const totalUnits  = vins.length;
    const totalValUsd = vins.reduce((s: number, v: any) => s + Number(v.valorUsd || 0), 0);
    const totalPuAdu  = vins.reduce((s: number, v: any) => s + Number(v.puAduana || 0), 0);
    const totalBruto  = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
    const totalNeto   = vins.reduce((s: number, v: any) => s + Number(v.pesoNeto  || 0), 0);
    const totalBrutoLb= vins.reduce((s: number, v: any) => s + Number(v.pesoBrutoLb || 0), 0);
    const containerGroups = groupBy(vins, 'containerNo');
    const modelGroups     = groupBy(vins, 'modelo');
    const containers      = Object.keys(containerGroups);
    const firstContainer  = containers[0] || '';
    const firstSeal       = containerGroups[firstContainer]?.[0]?.sealNo || '';
    return {
      vins, invoiceNo, asnNo, serie, folio, invoiceDate,
      totalUnits, totalValUsd, totalPuAdu, totalBruto, totalNeto, totalBrutoLb,
      containerGroups, modelGroups, containers, firstContainer, firstSeal,
    };
  }, [enrichedPayload, infoEnvio]);

  // ════════════════════════════════════════════════════════════════════════
  // ─── GENERADORES CSV (columnas exactas = Excel) ──────────────────────
  // ════════════════════════════════════════════════════════════════════════

  // ── FORMATO / PROFORMA  (22 columnas: A=0..V=21) ─────────────────────
  // Estructura idéntica para ambos documentos, difieren en filas de cabecera.
  function genCFDIRows(isProforma: boolean): string[][] {
    const NC = 22; // A..V
    const rows: string[][] = [];

    if (isProforma) {
      // ── Cabecera PROFORMA VEHICULOS ──
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, { 1:'4_AYFO_06, Rev 3,', 3:'Folio:', 4:D.invoiceNo }));
      rows.push(mkrow(NC, { 1:'PROFORMA DE FACTURACION Y DEPÓSITOS' }));
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, { 2:'Proyecto', 3:'CFMOTO' }));
      rows.push(mkrow(NC, { 2:'Cliente', 3:C.CHINA_NAME, 8:'Forma de Pago', 10:'Transferencia' }));
      rows.push(mkrow(NC, { 2:'Régimen Fiscal', 3:'616 Sin obligaciones fiscales' }));
      rows.push(mkrow(NC, { 2:'DIRECCION', 3:'NO.116 WUZHOU ROAD,YUHANG ECONOMIC DEVELOPMENT ZONE, HANGZHOU, ZHEJIANG, CHINA' }));
      rows.push(mkrow(NC, { 2:'CP', 3:'311100' }));
      rows.push(mkrow(NC, { 2:'TAX ID', 3:C.CHINA_TAXID, 8:'Fecha de depósito', 10:D.invoiceDate }));
      rows.push(mkrow(NC, { 2:'EMISOR', 3:'CFMOTO MEXICO POWER' }));
      rows.push(mkrow(NC, { 2:'TAX ID', 3:C.SHIPPER_RFC, 8:'Monto cobrado', 10:'0' }));
      rows.push(mkrow(NC, { 2:'Método de pago', 3:'PUE', 8:'Comisión', 10:'0' }));
      rows.push(mkrow(NC, { 2:'Tipo', 3:'Factura' }));
      rows.push(mkrow(NC, { 2:'UUID Relacionado', 3:'(UUID Obligatorio en caso de ser Refactura o Nota de Crédito)' }));
      rows.push(mkrow(NC, { 2:'Condiciones (En caso de PPD)', 3:'Elige de Lista', 8:'Factura', 10:'(# de factura)', 11:'(Monto fact)', 12:'(moneda)' }));
      rows.push(mkrow(NC, { 2:'Moneda', 3:'USD', 8:'Factura', 10:'(# de factura)', 11:'(Monto fact)', 12:'(moneda)' }));
      rows.push(mkrow(NC, { 2:'Observaciones', 3:'(Datos que requieren se agregue a la factura)', 8:'NCT', 10:'(# de Nct)', 11:'(Monto Nct)', 12:'(moneda)' }));
      rows.push(mkrow(NC, { 1:'EXPORTACION', 3:'04 Definitiva con clave distinta', 8:'NCT', 10:'(# de Nct)', 11:'(Monto Nct)', 12:'(moneda)' }));
      rows.push(mkrow(NC, { 8:'Préstamo', 10:'(Monto préstamo)', 12:'(moneda)' }));
      rows.push(mkrow(NC, { 1:'***Llenar en caso de ser factura con complemento de comercio exterior' }));
      rows.push(mkrow(NC, { 2:'Pedimento' }));
      rows.push(mkrow(NC, { 2:'Incoterm', 3:'FCA FRANCO TRANSPORTISTA (LUGAR DESIGNADO).' }));
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, { 17:'               *** COMPLEMENTO DE COMERCIO EXTERIOR' }));
    } else {
      // ── Cabecera FORMATO (Carta de Instrucciones / CFDI Expo) ──
      rows.push(mkrow(NC, { 1:'FORMATO ADUANAL — COMPLEMENTO DE COMERCIO EXTERIOR' }));
      rows.push(mkrow(NC, { 1:'EXPORTADOR:', 2:C.SHIPPER_NAME, 7:'RFC:', 8:C.SHIPPER_RFC }));
      rows.push(mkrow(NC, { 1:'DESTINATARIO:', 3:`${C.CONSIGNEE_NAME} / TAX ID: ${C.CONSIGNEE_TAXID}` }));
      rows.push(mkrow(NC, { 1:'INCOTERM:', 2:'FCA FRANCO TRANSPORTISTA (LUGAR DESIGNADO).' }));
      rows.push(mkrow(NC, { 1:'PEDIMENTO:', 2:'DEFINITIVO', 3:'Clave:', 4:C.PEDIMENTO_CLAVE, 5:'Fracción:', 6:D.vins[0]?.taric || C.FRACCION_DEFAULT }));
      rows.push(mkrow(NC, { 1:'DESCRIPCIÓN:', 2:C.DESC_MERCH }));
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, {}));
    }

    // ── Fila de encabezado de columnas (idéntica en ambos) ──
    rows.push(mkrow(NC, {
      1:'SERIE', 2:'FOLIO', 3:'Cantidad', 4:'Objeto de impuesto (SAT)',
      5:'Unidad de Medida (SAT)', 6:'Uso de CFDI (SAT)', 7:'Clave Producto (SAT)',
      8:'Descripción', 9:'No. Parte', 10:'Precio Unitario', 11:'Subtotal ',
      12:'Iva', 13:'Retención', 14:'Descuento', 15:'Total',
      17:'Fracción arancelaria', 18:'**Unidad Aduana', 19:'**Cantidad Aduana',
      20:'**PU Aduana', 21:'Total',
    }));

    // ── Una fila por VIN ──
    D.vins.forEach((v: any) => {
      const pu   = Number(v.puAduana || v.valorUsd || 0);
      const expo = v.expo || v.productNo || '';
      const desc = `${C.DESC_MERCH} ( VIN ${v.vin} / ENGINE ${v.engine} / PESO NETO ${v.pesoNeto} KG / PESO BRUTO ${v.pesoBruto})  MODELO ${v.modelo}`;
      rows.push(mkrow(NC, {
        1: D.serie,
        2: D.folio,
        3: 1,
        4: v.objetoImpuesto || '01- No objeto de impuesto',
        5: v.unidadMedidaSat || 'H87 Pieza',
        6: v.usoCfdi || 'S01 Sin Efectos fiscales',
        7: v.claveProductoSat || C.MARCA_SAT,
        8: desc,
        9: expo,
        10: pu,
        11: pu,
        12: 0,
        13: 0,
        14: 0,
        15: pu,
        17: v.taric || C.FRACCION_DEFAULT,
        18: v.unidadAduana || '06 PIEZA',
        19: v.cantidadAduana ?? 1,
        20: pu,
        21: pu,
      }));
    });

    // ── Fila de totales ──
    rows.push(mkrow(NC, {
      3: D.totalUnits,
      10: D.totalPuAdu, 11: 0, 12: 0, 13: 0,
      15: D.totalPuAdu,
      21: D.totalPuAdu,
    }));

    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'OBSERVACIONES' }));
    rows.push(mkrow(NC, {}));

    // ── Footer - resumen por modelo ──
    Object.entries(D.modelGroups).forEach(([modelo, mvins]: [string, any]) => {
      const s = mvins[0];
      rows.push(mkrow(NC, { 1:'Brand / Marca: ', 2:C.BRAND }));
      rows.push(mkrow(NC, { 1:'Model / Modelo: ', 2:modelo }));
      rows.push(mkrow(NC, {}));
      rows.push(mkrow(NC, { 1:'BOM / Part Number', 2:s?.expo || s?.productNo || '' }));
    });

    const tBrutoStr = `${fmt(D.totalBruto, 0)} KG`;
    const tNetoStr  = `${fmt(D.totalNeto, 0)} KG`;
    rows.push(mkrow(NC, { 1:'PESO NETO TOTAL',  2:tNetoStr  }));
    rows.push(mkrow(NC, { 1:'PESO BRUTO TOTAL', 2:tBrutoStr }));
    rows.push(mkrow(NC, { 1:'Destinatario',     2:`${C.CONSIGNEE_NAME} / TAX ID: ${C.CONSIGNEE_TAXID}` }));
    rows.push(mkrow(NC, { 2:C.CONSIGNEE_ADDR_SHORT }));
    rows.push(mkrow(NC, { 1:'Incoterm', 2:C.INCOTERM }));

    return rows;
  }

  // ── BILL OF LADING (7 columnas: A=0..G=6) ────────────────────────────
  function genBOLRows(): string[][] {
    const NC = 7;
    const rows: string[][] = [];

    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'BILL OF LADING' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'SHIP FROM' }));
    rows.push(mkrow(NC, { 0:'NAME',               1:`${C.SHIPPER_NAME} / RFC: ${C.SHIPPER_RFC}` }));
    rows.push(mkrow(NC, { 0:'ADDRESS',             1:C.SHIPPER_ADDR }));
    rows.push(mkrow(NC, { 0:'Telephone / Fax No.', 1:C.SHIPPER_TEL }));
    rows.push(mkrow(NC, { 0:'E-MAIL ADDRESS',      1:C.SHIPPER_EMAIL }));
    rows.push(mkrow(NC, { 0:'ISSUE DATE: ',        1:D.invoiceDate }));
    rows.push(mkrow(NC, { 0:'SHIP TO' }));
    rows.push(mkrow(NC, { 0:'NAME',                1:C.CONSIGNEE_NAME }));
    rows.push(mkrow(NC, { 0:'WAREHOUSE ADDRESS',   1:C.CONSIGNEE_WAREHOUSE }));
    rows.push(mkrow(NC, { 0:'Telephone / Fax No.', 1:C.CONSIGNEE_TEL }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'SHPPING DETAILS' })); // typo intencional = como en Excel

    // Por contenedor (si hay múltiples, repetir sección)
    Object.entries(D.containerGroups).forEach(([containerNo, vins]: [string, any]) => {
      const qty     = vins.length;
      const sealNo  = vins[0]?.sealNo || '';
      const bruto   = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
      const brutoLb = vins.reduce((s: number, v: any) => s + Number(v.pesoBrutoLb || 0), 0);
      const modelo  = Object.keys(groupBy(vins, 'modelo')).join(' / ');

      rows.push(mkrow(NC, { 0:'INVOICE NO.',   1:D.invoiceNo }));
      rows.push(mkrow(NC, { 0:'ORDER NO.',     1:D.asnNo }));
      rows.push(mkrow(NC, { 0:'MODLE ',        1:modelo })); // typo intencional
      rows.push(mkrow(NC, { 0:'PCS',           1:qty }));
      rows.push(mkrow(NC, { 0:'G.W. Kg',       1:`${fmt(bruto, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Kg` }));
      rows.push(mkrow(NC, { 0:'G.W. Lbs',      1:`${fmt(brutoLb > 0 ? brutoLb : bruto * 2.20462, 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Lbs` }));
      rows.push(mkrow(NC, { 0:'CONTAINER NO.', 1:containerNo }));
      rows.push(mkrow(NC, { 0:'SEAL NO.',      1:sealNo }));
      rows.push(mkrow(NC, { 0:'AGENT',         1:C.AGENT }));
    });

    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'TRUCKER\'s Signature:', 6:'CFMOTO\'s Signature:' }));
    rows.push(mkrow(NC, { 0:'SHIPMENT DATE: ',       6:'SHIPMENT DATE: ' }));

    return rows;
  }

  // ── CFM_INSTRUCTIONS LETTER (10 columnas: A=0..J=9) ──────────────────
  function genInstruccionesRows(): string[][] {
    const NC = 10;
    const rows: string[][] = [];
    const fraccion = D.vins[0]?.taric || C.FRACCION_DEFAULT;

    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'CARTA    DE    INSTRUCCIONES      -       EXPORTACION' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'EXPORTADOR', 2:C.SHIPPER_NAME }));
    rows.push(mkrow(NC, { 7:'Fecha', 8:D.invoiceDate }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'EMBARQUE', 2:'Terrestre :', 3:'(   X     )', 5:'Ferrocarril :', 6:'(        )', 8:'Virtual :', 9:'(        )' }));
    rows.push(mkrow(NC, { 2:'Programa ', 8:'Original', 9:'Copia' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'Factura (s)', 3:D.invoiceNo, 9:'(  X  )' }));
    rows.push(mkrow(NC, { 2:'Identificadores generales' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'Packing List', 3:'SI' }));
    rows.push(mkrow(NC, { 2:'B / L (s)', 3:'SI', 8:'(      )', 9:'(      )' }));

    // Por contenedor
    D.containers.forEach((containerNo: string) => {
      const sealNo = D.containerGroups[containerNo]?.[0]?.sealNo || '';
      rows.push(mkrow(NC, { 2:'No. Caja Trailer ', 3:containerNo, 8:'(      )', 9:'(      )' }));
      rows.push(mkrow(NC, { 2:'Sello ', 3:sealNo, 5:'SI', 6:'NO ', 8:'(      )', 9:'(      )' }));
    });

    rows.push(mkrow(NC, { 1:' ', 2:' ', 3:'Vinculacion ', 5:'(X)', 6:'(   )' }));
    rows.push(mkrow(NC, { 1:'DOCUMENTOS ' }));
    rows.push(mkrow(NC, { 1:'INSTRUCCIONES', 3:'DECLARAR VIN AND ENGINE NUMBERS OBSERVACIONES NIVEL PARTIDA', 8:'(      )', 9:'(      )' }));
    rows.push(mkrow(NC, { 1:'ESPECIALES', 8:'(      )', 9:'(      )' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'TIPO DE ', 2:'Regimen', 3:'Clave', 4:'Fraccion', 5:'TLCAN', 6:'Descripcion de la mercancia en español' }));
    rows.push(mkrow(NC, { 1:'PEDIMENTO', 2:'DEFINITIVO', 3:'RT', 4:fraccion, 6:C.DESC_MERCH }));
    rows.push(mkrow(NC, { 1:'INDIVIDUAL' }));
    rows.push(mkrow(NC, { 1:'O' }));
    rows.push(mkrow(NC, { 1:'CONSOLIDADO' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'INCOTERMS', 2:C.INCOTERM }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'TRANSPORTE', 2:'   ', 3:'(      )', 4:'(    )', 6:'Transbordar en ', 7:'BODEGA' }));
    rows.push(mkrow(NC, { 2:' ', 3:' ', 7:'Agente aduanal' }));
    rows.push(mkrow(NC, { 2:'CRUCE POR EL CLIENTE', 3:'(   )' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:' ', 7:'Americano' }));
    rows.push(mkrow(NC, { 2:'Linea Mexicana', 3:' ', 7:'Contacto' }));
    rows.push(mkrow(NC, { 7:'Telefono' }));
    rows.push(mkrow(NC, { 2:'Lienea Americana', 7:'correo' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'IMPORTADOR', 2:'Empresa', 3:`${C.CHINA_NAME} / TAX ID: `, 7:'Agente aduanal', 8:C.AGENT_ADUANAL }));
    rows.push(mkrow(NC, { 1:'O', 2:'Dirección', 3:C.CHINA_ADDR.replace(/\n/g,' '), 8:C.AGENT_CONTACTO }));
    rows.push(mkrow(NC, { 1:'COMPRADOR', 2:'Tax-ID', 3:C.CHINA_TAXID, 8:`PATENTE ${C.AGENT_PATENTE}` }));
    rows.push(mkrow(NC, { 1:' ', 2:'Ciudad o Estado', 7:'Contacto', 8:C.CUSTOMS_CONTACTO }));
    rows.push(mkrow(NC, { 2:'Contacto:', 7:'Telefono', 8:C.AGENT_TEL }));
    rows.push(mkrow(NC, { 2:'Telefono', 7:'correo' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'DESTINATARIO', 2:'Empresa', 3:C.CONSIGNEE_NAME, 7:'Contacto de la bodega' }));
    rows.push(mkrow(NC, { 2:'Dirección', 3:C.CONSIGNEE_ADDR }));
    rows.push(mkrow(NC, { 2:'Tax-ID', 3:C.CONSIGNEE_TAXID }));
    rows.push(mkrow(NC, { 2:'Ciudad o Estado', 3:'MN' }));
    rows.push(mkrow(NC, { 2:'Contacto:' }));
    rows.push(mkrow(NC, { 2:'Telefono' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'SE CRUZA A', 2:'SE ENTREGA EN', 4:C.AGENT, 7:'Peso bruto', 8:fmt(D.totalBruto, 0), 9:'KGS' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'ESPECIALES', 7:'Peso Neto', 8:fmt(D.totalNeto, 0), 9:'KGS' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'Atentamente' }));

    return rows;
  }

  // ── CFC invoiced to CFP (13 columnas: A=0..M=12) ─────────────────────
  function genCfcCfpRows(): string[][] {
    const NC = 13;
    const rows: string[][] = [];

    rows.push(mkrow(NC, { 1:'浙江春风动力股份有限公司' }));
    rows.push(mkrow(NC, { 1:' ZHEJIANG CFMOTO POWER CO.,LTD ' }));
    rows.push(mkrow(NC, { 1:'NO.116,WUZHOU ROAD,YUHANG ECONOMIC DEVELOPMENT ZONE, HANGZHOU 311100,ZHEJIANG PROVINCE,P.R.CHINA' }));
    rows.push(mkrow(NC, { 1:'商 业 发 票' }));
    rows.push(mkrow(NC, { 1:'COMMERCIAL INVOICE' }));
    rows.push(mkrow(NC, { 8:'发票号码' }));
    rows.push(mkrow(NC, { 1:'至', 8:'INV NO.:', 10:D.invoiceNo }));
    rows.push(mkrow(NC, { 1:'TO:', 2:C.CONSIGNEE_NAME, 8:'日期' }));
    rows.push(mkrow(NC, { 1:'Address', 2:C.CONSIGNEE_ADDR, 8:'Date', 10:D.invoiceDate }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'COMMENTS:', 3:`Direct Shipment from Mexico to CFMOTO Powersports Inc. of Mexico origin vehicles produced by CFMOTO MEXICO POWER, S. DE R.L. DE C.V. for Zhejiang CFMOTO Power Co. Ltd.` }));
    rows.push(mkrow(NC, { 3:`REF.  RULING ${C.RULING}` }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'装船口岸\nFrom', 3:C.FROM_PORT, 5:'经\nVia', 6:C.VIA_UPPER, 7:'目的地\nTo', 9:C.TO_PORT }));
    rows.push(mkrow(NC, { 2:'信用证号码\nL/C No.', 7:'开证银行\nDrawn Under' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'唛头及包/箱号\nMarks & Numbers', 3:'货 品 名 称\nDESCRIPTIONS', 7:'数量\nQUANTITY', 9:'单  价\nUNIT PRICE', 12:'金  额\nAMOUNT' }));
    rows.push(mkrow(NC, { 12:`${C.INCOTERM} ${C.FROM_PORT}` }));

    // Por grupo de modelo
    Object.entries(D.modelGroups).forEach(([modelo, vins]: [string, any]) => {
      const qty = vins.length;
      const unitVal = Number(vins[0]?.valorUsd || 0);
      const total   = qty * unitVal;
      rows.push(mkrow(NC, {
        1: `Country of origin Mexico                                  REF.  RULING ${C.RULING}    `,
        3: modelo,
        7: qty,
        8: 'UNIT',
        9: 'USD',
        10: unitVal,
        12: total,
      }));
    });

    rows.push(mkrow(NC, { 1:'TOTAL:', 7:'USD', 12:D.totalValUsd }));
    rows.push(mkrow(NC, { 1:'SAY TOTAL ：', 7:amountToWords(D.totalValUsd) }));

    return rows;
  }

  // ── IN-with CFM title to CFP (22 columnas: A=0..V=21) ────────────────
  function genInCfpRows(): string[][] {
    const NC = 22;
    const rows: string[][] = [];

    rows.push(mkrow(NC, { 0:' ' + C.SHIPPER_NAME }));
    rows.push(mkrow(NC, { 0:C.SHIPPER_NAME }));
    rows.push(mkrow(NC, { 0:C.SHIPPER_ADDR_FULL }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'INVOICE' }));
    rows.push(mkrow(NC, { 1:`${C.CONSIGNEE_NAME}\n${C.CONSIGNEE_ADDR}`, 20:D.invoiceNo }));
    rows.push(mkrow(NC, { 0:'TO:', 12:'INV NO.:' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 20:D.invoiceDate }));
    rows.push(mkrow(NC, { 12:'Date:' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:C.FROM_PORT, 7:C.VIA, 16:C.TO_PORT }));
    rows.push(mkrow(NC, { 0:'From:', 4:'Via', 13:'To:' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 0:'L/C No.', 13:'Drawn Under' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 3:'DESCRIPTIONS', 10:'QUANTITY', 15:'UNIT PRICE', 21:'AMOUNT' }));
    rows.push(mkrow(NC, { 0:'Marks & Numbers' }));
    rows.push(mkrow(NC, { 21:`${C.INCOTERM}  ${C.FROM_PORT}` }));

    // Por grupo de modelo
    Object.entries(D.modelGroups).forEach(([modelo, vins]: [string, any]) => {
      const qty       = vins.length;
      const s         = vins[0];
      const unitVal   = Number(s?.valorUsd || 0);
      const valAcero  = Number(s?.valAcero || 0);
      const nonSteel  = valAcero > 0 ? (unitVal - valAcero) : 0;
      const total     = qty * unitVal;
      const year      = s?.outDate ? new Date(s.outDate).getFullYear() : '';

      rows.push(mkrow(NC, {
        0: `Country of origin Mexico                                      REF. RULING ${C.RULING}`,
        3: `${modelo}                       MODEL ${year}`,
        10: qty,
        14: 'UNIT',
        15: 'USD',
        17: unitVal,
        21: total,
      }));

      if (valAcero > 0) {
        rows.push(mkrow(NC, {
          0: 'Steel Country of Melt/Pour: China',
          3: 'Non-Steel Content',
          15: 'USD',
          17: nonSteel,
          21: qty * nonSteel,
        }));
        rows.push(mkrow(NC, {
          3: 'Steel Content',
          15: 'USD',
          17: valAcero,
          21: qty * valAcero,
        }));
      }
    });

    rows.push(mkrow(NC, { 0:'TOTAL:', 10:'USD', 21:D.totalValUsd }));
    rows.push(mkrow(NC, { 0:'SAY TOTAL ：', 10:amountToWords(D.totalValUsd) }));

    return rows;
  }

  // ── PL-with CFM title to CFP (14 columnas: A=0..N=13) ────────────────
  function genPlCfpRows(): string[][] {
    const NC = 14;
    const rows: string[][] = [];

    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:C.SHIPPER_NAME }));
    rows.push(mkrow(NC, { 0:'CALLE TECNOLOGIA NO. 107, COL. VYNMSA APODACA INDUSTRIAL PARK, NUEVO LEÓN C.P. 66628                                                         RFC: CMP220712ND9' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'PACKING LIST' }));
    rows.push(mkrow(NC, { 2:`TO:${C.CONSIGNEE_NAME}\n${C.CONSIGNEE_ADDR}`, 9:'INV  NO.:', 12:D.invoiceNo }));
    rows.push(mkrow(NC, { 9:'DATE:', 12:D.invoiceDate }));
    rows.push(mkrow(NC, { 2:'SHIPPED FROM:', 5:C.FROM_PORT, 9:'TO:', 12:C.TO_PORT }));
    rows.push(mkrow(NC, { 9:'VIA:', 12:C.VIA }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 2:'Marks&Nos.', 3:'Description of Goods and Package', 6:'Quantity', 11:'G.W.\n(KGS)', 12:'N.W.   \n(KGS)', 13:'MEAS (CBM)' }));

    // Por grupo de modelo
    Object.entries(D.modelGroups).forEach(([modelo, vins]: [string, any]) => {
      const qty       = vins.length;
      const s         = vins[0];
      const pesoAcero = Number(s?.pesoAcero || 0);
      const totalBruto= vins.reduce((a: number, v: any) => a + Number(v.pesoBruto || 0), 0);
      const totalNeto = vins.reduce((a: number, v: any) => a + Number(v.pesoNeto  || 0), 0);
      const steelW    = qty * pesoAcero;
      const nonSteelW = pesoAcero > 0 ? totalBruto - steelW : 0;
      const volTotal  = Number(s?.volumen || 0) * qty;
      const year      = s?.outDate ? new Date(s.outDate).getFullYear() : '';

      rows.push(mkrow(NC, {
        2: `Country of origin Mexico                                      REF.  RULING ${C.RULING}`,
        3: `${modelo} MODEL ${year}`,
        6: qty,
        7: 'CTNS',
        8: qty,
        10: 'UNIT',
        11: totalBruto,
        12: totalNeto,
        13: volTotal > 0 ? volTotal : '',
      }));

      if (pesoAcero > 0) {
        rows.push(mkrow(NC, { 2:'Steel Country of Melt/Pour: China', 3:'Non-Steel Content', 11:nonSteelW, 12:nonSteelW }));
        rows.push(mkrow(NC, { 3:'Steel Content', 11:steelW, 12:steelW }));
      }
    });

    rows.push(mkrow(NC, { 2:'TOTAL:', 6:D.totalUnits, 7:'CTNS', 8:D.totalUnits, 10:'UNIT', 11:D.totalBruto, 12:D.totalNeto }));

    return rows;
  }

  // ── LAY OUT CCP (4 columnas: A=0..D=3) ───────────────────────────────
  function genCCPRows(): string[][] {
    const NC = 4;
    const rows: string[][] = [];

    rows.push(mkrow(NC, { 1:'LAYOUT ARCBETS' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'DATOS ORIGEN', 3:C.SHIPPER_NAME }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'RFC REMITENTE', 3:C.SHIPPER_RFC }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'ESTADO', 3:C.SHIPPER_STATE }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'PAIS', 3:'MEXICO' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'CODIGO POSTAL', 3:C.SHIPPER_CP }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'FECHA/HORA DE SALIDA', 3:D.invoiceDate }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'DATOS DESTINO', 3:C.CONSIGNEE_NAME }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'RFC DESTINATARIO', 3:C.CONSIGNEE_TAXID.replace('-', '') }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'ESTADO', 3:C.CONSIGNEE_STATE }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'PAIS', 3:'USA' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'CODIGO POSTAL', 3:C.CONSIGNEE_CP }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'FECHA/HORA DE SALIDA' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'DISTANCIA RECORRIDA' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'MERCANCIAS', 3:'1' }));
    rows.push(mkrow(NC, { 1:'Valor de la mercancia USD', 3:D.totalValUsd }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Peso Bruto Total', 3:D.totalBruto }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Unidad de Peso', 3:'kg' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Número total de Mercancías', 3:D.totalUnits }));
    rows.push(mkrow(NC, { 0:'EN CASO DE DEVOLUCIÓN', 1:'Logistica Inversa Recolección Devolución', 3:'no aplica' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Bienes Transportados (clave SAT)', 3:D.vins[0]?.claveProductoSat || C.MARCA_SAT }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Descripción bienes transportados (SAT)', 3:C.DESC_MERCH }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Cantidad', 3:D.totalUnits }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Clave de la Unidad (Clave SAT)', 3:'H87 PIEZA' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Peso en KG', 3:D.totalBruto }));
    rows.push(mkrow(NC, { 0:'CONDICIONAL', 1:'Material Peligroso', 3:'no aplica' }));
    rows.push(mkrow(NC, { 0:'CONDICIONAL', 1:'Clave Material Peligroso', 3:'no aplica' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Tipo de Materia', 3:'´03' }));
    rows.push(mkrow(NC, {}));
    rows.push(mkrow(NC, { 1:'DOCUMENTACIÓN ADUANERA' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Fracción Arancelaria (Clave SAT)', 3:D.vins[0]?.taric || C.FRACCION_DEFAULT }));
    rows.push(mkrow(NC, { 0:'CONDICIONAL', 1:'UUID del comprobante de comercio exterior (expo)' }));
    rows.push(mkrow(NC, { 0:'REQUERIDO', 1:'Tipo de documento', 3:'PEDIMENTO' }));
    rows.push(mkrow(NC, { 0:'CONDICIONAL', 1:'Numero de Pedimento' }));
    rows.push(mkrow(NC, { 0:'CONDICIONAL', 1:'RFC Importador' }));

    return rows;
  }

  // ── CFMOTO CSV (31 columnas: A=0..AE=30) ─────────────────────────────
  function genCfmotoCSVRows(): string[][] {
    // Headers — exactamente como aparecen en fila 1 del sheet
    const headers = [
      'INVOICE','ASN NUMBER','LINE','IMPORTER','CONSIGNEE','SHIPPER','INV-DATE',
      'HTS DUT/VALUE','WEIGHT-KILOS','PART DESC','QTY','ORIGIN',
      'PART-NO.','PART-NO. CFMOTO','MID','TRLR-NO.','NO.-PALLETS','UOM',
      'P.O-NO.','HTS','RELATED','SPI','Import Code','Industry Code',
      'Model','Model Year','MFG Month/Yr','Date Location Code',
      'Item ID No Type','Item ID No','Test Group Name/No',
    ];
    const NC = 31;
    const rows: string[][] = [headers];

    D.vins.forEach((v: any, i: number) => {
      const isFirst  = i === 0;
      const code     = modelCode(v.modelo);
      const year     = v.outDate ? String(new Date(v.outDate).getFullYear()) : '';
      // MFG Month/Yr: MMYYYY from productionDate or outDate
      let mfgYr = '';
      if (v.productionDate) {
        const pd = String(v.productionDate).replace(/[^0-9]/g, '');
        mfgYr = pd.length >= 6 ? pd.slice(0, 6) : pd;
      } else if (v.outDate) {
        const d = new Date(v.outDate);
        mfgYr = String(d.getMonth() + 1).padStart(2, '0') + String(d.getFullYear());
      }

      const r = mkrow(NC, {
        // Campos solo en fila 1 (nivel factura)
        ...(isFirst ? {
          0:  D.invoiceNo,            // A - INVOICE
          1:  D.asnNo,                // B - ASN NUMBER
          3:  C.IMPORTER_CODE,        // D - IMPORTER
          4:  C.IMPORTER_CODE,        // E - CONSIGNEE
          5:  C.SHIPPER_CODE,         // F - SHIPPER
          6:  D.invoiceDate,          // G - INV-DATE
          7:  D.totalValUsd,          // H - HTS DUT/VALUE
          8:  D.totalBruto,           // I - WEIGHT-KILOS
          10: D.totalUnits,           // K - QTY
          11: C.ORIGIN,              // L - ORIGIN
          12: v.modelo,              // M - PART-NO.
          13: v.modelo,              // N - PART-NO. CFMOTO
          15: v.containerNo || '',   // P - TRLR-NO.
          16: D.totalUnits,          // Q - NO.-PALLETS (total en fila 1)
          17: 'PCS',                 // R - UOM
          19: v.htsus || '',         // T - HTS
        } : {
          16: '0',                   // Q - NO.-PALLETS = 0 en filas siguientes
        }),
        // Campos en todas las filas
        2:  i + 1,                   // C - LINE
        9:  'UTV VEHICLES',          // J - PART DESC
        14: v.mid || '',             // O - MID
        20: 'Y',                     // U - RELATED
                                     // V - SPI = vacío (col 21)
        22: '1',                     // W - Import Code
        23: 'F',                     // X - Industry Code
        24: code,                    // Y - Model (código corto)
        25: year,                    // Z - Model Year
        26: mfgYr,                   // AA - MFG Month/Yr
        27: 'Vehicle',               // AB - Date Location Code
        28: 'VIN',                   // AC - Item ID No Type
        29: v.vin,                   // AD - Item ID No
        30: v.testGroupNameNo || '', // AE - Test Group Name/No
      });
      rows.push(r);
    });

    return rows;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ─── PREVIEWS (tablas para la UI) ────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════

  const FieldRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex gap-3 py-1 border-b border-slate-50">
      <span className="text-xs font-bold text-slate-500 w-44 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-mono break-all">{value}</span>
    </div>
  );

  function PreviewTable({ rows, maxRows = 15, caption }: { rows: string[][]; maxRows?: number; caption?: string }) {
    if (!rows || rows.length < 2) return null;
    const headers = rows[0];
    const data    = rows.slice(1, maxRows + 1);
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 text-[10px]">
        {caption && <p className="px-3 py-1.5 bg-slate-100 text-slate-500 font-bold text-[9px] uppercase tracking-wider">{caption}</p>}
        <table className="w-full whitespace-nowrap">
          <thead className="bg-slate-800 text-white">
            <tr>
              {headers.filter((_, ci) => {
                // Mostrar solo columnas no vacías en el header o en los datos
                const colVals = [headers[ci], ...data.map(r => r[ci] || '')];
                return colVals.some(v => v !== '');
              }).map((h, ci) => (
                <th key={ci} className="px-2 py-1.5 text-left font-bold border-r border-slate-700 last:border-0">{h || `col${ci}`}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((row, ri) => {
              const nonEmpty = row.some(v => v !== '');
              if (!nonEmpty) return <tr key={ri}><td colSpan={headers.length} className="px-2 py-0.5 bg-slate-50"></td></tr>;
              // Filter same cols as headers
              const filteredHeaders = headers.filter((_, ci) => {
                const colVals = [headers[ci], ...data.map(r => r[ci] || '')];
                return colVals.some(v => v !== '');
              });
              return (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  {filteredHeaders.map((_, ci) => {
                    // Find actual col index
                    const actualCi = headers.indexOf(filteredHeaders[ci]);
                    const val = row[actualCi] || '';
                    return (
                      <td key={ci} className={`px-2 py-1 border-r border-slate-50 last:border-0 max-w-[200px] truncate ${
                        actualCi === 29 ? 'font-mono font-bold text-blue-700' :
                        actualCi === 0 ? 'font-mono text-slate-800' : 'text-slate-600'
                      }`} title={val}>{val}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > maxRows + 1 && (
          <p className="px-3 py-1.5 bg-slate-100 text-slate-400 text-[9px]">
            ... {rows.length - maxRows - 1} filas más en el CSV
          </p>
        )}
      </div>
    );
  }

  // ── Render por pestaña ─────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case 'formato': {
        const csvRows = genCFDIRows(false);
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">FORMATO — Complemento de Comercio Exterior (CFDI por VIN)</h3>
                <p className="text-xs text-slate-500">{D.invoiceNo} · {D.totalUnits} vehículos · Precio: puAduana por VIN</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `FORMATO_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Vista previa (columnas con datos)" />
          </div>
        );
      }

      case 'proforma': {
        const csvRows = genCFDIRows(true);
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">PROFORMA DE FACTURACIÓN Y DEPÓSITOS</h3>
                <p className="text-xs text-slate-500">{D.invoiceNo} · {D.totalUnits} vehículos · Dirigido a: {C.CHINA_NAME}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `PROFORMA_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Vista previa" />
          </div>
        );
      }

      case 'bol': {
        const csvRows = genBOLRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">BILL OF LADING</h3>
                <p className="text-xs text-slate-500">{D.invoiceNo} · {D.containers.length} contenedor(es)</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `BL_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Estructura B/L" />
          </div>
        );
      }

      case 'instrucciones': {
        const csvRows = genInstruccionesRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">CARTA DE INSTRUCCIONES — EXPORTACIÓN</h3>
                <p className="text-xs text-slate-500">Exportador: {C.SHIPPER_NAME} · Agente: {C.AGENT_ADUANAL}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `INSTRUCCIONES_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Carta de Instrucciones" />
          </div>
        );
      }

      case 'cfc_cfp': {
        const csvRows = genCfcCfpRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">COMMERCIAL INVOICE — CFC invoiced to CFP</h3>
                <p className="text-xs text-slate-500">{C.CHINA_NAME} → {C.CONSIGNEE_NAME} · {D.invoiceNo}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `CFC_CFP_Invoice_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Commercial Invoice China → US" />
          </div>
        );
      }

      case 'in_cfp': {
        const csvRows = genInCfpRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">INVOICE — CFMOTO Mexico with CFM title to CFP</h3>
                <p className="text-xs text-slate-500">{C.SHIPPER_NAME} → {C.CONSIGNEE_NAME} · {D.invoiceNo}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `IN_CFM_CFP_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Invoice CFM México → US" />
          </div>
        );
      }

      case 'pl_cfp': {
        const csvRows = genPlCfpRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">PACKING LIST — CFMOTO Mexico with CFM title to CFP</h3>
                <p className="text-xs text-slate-500">Peso neto total: {fmt(D.totalNeto)} kg · Peso bruto: {fmt(D.totalBruto)} kg</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `PL_CFM_CFP_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Packing List" />
          </div>
        );
      }

      case 'ccp': {
        const csvRows = genCCPRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">LAY OUT CCP — Datos Carta Porte (Arcbets)</h3>
                <p className="text-xs text-slate-500">RFC remitente: {C.SHIPPER_RFC} → RFC destinatario: {C.CONSIGNEE_TAXID.replace('-','')}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `LAY_OUT_CCP_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs shrink-0">
                <Download size={14}/> Descargar CSV
              </button>
            </div>
            <PreviewTable rows={csvRows.filter(r => r.some(v => v!==''))} caption="Layout CCP / Carta Porte" />
          </div>
        );
      }

      case 'cfmoto_csv': {
        const csvRows = genCfmotoCSVRows();
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800">CFMOTO CSV — US Customs Import Format</h3>
                <p className="text-xs text-slate-500">{D.totalUnits} VINs · 31 columnas · Importer: {C.IMPORTER_CODE} · Shipper: {C.SHIPPER_CODE}</p>
              </div>
              <button onClick={() => downloadCSV(csvRows, `CFMOTO_CSV_${D.invoiceNo}.csv`)}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-lg shadow-blue-500/25 shrink-0">
                <Download size={14}/> Descargar CFMOTO CSV
              </button>
            </div>
            {/* Muestra todas las columnas en vista horizontal con scroll */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 text-[10px]">
              <table className="w-full whitespace-nowrap">
                <thead className="bg-slate-800 text-white sticky top-0">
                  <tr>
                    {csvRows[0].map((h, ci) => (
                      <th key={ci} className="px-2 py-2 text-left font-bold border-r border-slate-700 last:border-0 min-w-[80px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {csvRows.slice(1).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      {row.map((cell, ci) => (
                        <td key={ci} className={`px-2 py-1 border-r border-slate-50 last:border-0 ${
                          ci === 29 ? 'font-mono font-bold text-blue-700' :
                          ci === 0  ? 'font-mono text-slate-700 font-bold' : 'text-slate-600'
                        }`}>
                          {cell !== '' ? cell : <span className="text-slate-200">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      default: return null;
    }
  };

  const activeIdx = TABS.findIndex(t => t.id === activeTab);

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab strip */}
      <div className="bg-slate-900 px-3 pt-3 flex items-end gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[11px] font-bold whitespace-nowrap transition-all border-b-2 ${
                isActive
                  ? 'bg-white text-slate-800 border-white shadow-sm'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800'
              }`}>
              <Icon size={11}/>
              {tab.short}
            </button>
          );
        })}
        <div className="ml-auto flex pb-1.5 gap-0.5 pl-2">
          <button onClick={() => setActiveTab(TABS[Math.max(0, activeIdx - 1)].id)}
            disabled={activeIdx === 0}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded">
            <ChevronLeft size={14}/>
          </button>
          <button onClick={() => setActiveTab(TABS[Math.min(TABS.length - 1, activeIdx + 1)].id)}
            disabled={activeIdx === TABS.length - 1}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded">
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {renderTab()}
      </div>
    </div>
  );
};

export default CaptureDocumentTabs;
