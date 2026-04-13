/**
 * excelGeneratorService.ts
 * Genera archivos .xlsx con estilo EXACTO al template LOUT-8LK MACROS 2.7
 * Fuente, anchos de columna, alto de fila, bordes y merges extraídos del Excel original.
 */
import ExcelJS from 'exceljs';

// ─── Tipografías base ─────────────────────────────────────────────────────
const F_CALIBRI   = (size = 11, bold = false, color?: string): Partial<ExcelJS.Font> =>
  ({ name: 'Calibri',         size, bold, ...(color ? { color: { argb: color } } : {}) });
const F_TNR       = (size = 10, bold = false, color?: string): Partial<ExcelJS.Font> =>
  ({ name: 'Times New Roman', size, bold, ...(color ? { color: { argb: color } } : {}) });
const F_ARIAL     = (size = 10, bold = false): Partial<ExcelJS.Font> =>
  ({ name: 'Arial',           size, bold });

// ─── Bordes ───────────────────────────────────────────────────────────────
type BS = ExcelJS.BorderStyle;
const brd = (style: BS, color = 'FF000000') =>
  ({ style, color: { argb: color } } as ExcelJS.Border);
const THIN   = brd('thin');
const MEDIUM = brd('medium');
const allThin   = (): Partial<ExcelJS.Borders> => ({ top: THIN,   bottom: THIN,   left: THIN,   right: THIN   });
const allMedium = (): Partial<ExcelJS.Borders> => ({ top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });
const topThin   = (): Partial<ExcelJS.Borders> => ({ top: THIN   });
const topMedium = (): Partial<ExcelJS.Borders> => ({ top: MEDIUM });
const sideMedium= (): Partial<ExcelJS.Borders> => ({ left: MEDIUM, right: MEDIUM });
const topSideMedium = (): Partial<ExcelJS.Borders> => ({ left: MEDIUM, right: MEDIUM, top: MEDIUM });

// ─── Rellenos (Fills) ─────────────────────────────────────────────────────
const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const WHITE       = solidFill('FFFFFFFF');
const GREY_HEADER = solidFill('FFD9D9D9');
const GREY_LIGHT  = solidFill('FFF2F2F2');
const YELLOW_FILL = solidFill('FFFFFF00');
const GREEN_FILL  = solidFill('FF00B050');
const BLUE_FILL   = solidFill('FF0070C0');
const RED_FILL    = solidFill('FFFF0000');
const ORANGE_FILL = solidFill('FFED7D31');
const NAVY_FILL   = solidFill('FF1F3864');

// ─── Alineación ───────────────────────────────────────────────────────────
const AL_CC  : Partial<ExcelJS.Alignment> = { horizontal: 'center',  vertical: 'middle', wrapText: true  };
const AL_LC  : Partial<ExcelJS.Alignment> = { horizontal: 'left',    vertical: 'middle', wrapText: true  };
const AL_RC  : Partial<ExcelJS.Alignment> = { horizontal: 'right',   vertical: 'middle', wrapText: false };
const AL_LT  : Partial<ExcelJS.Alignment> = { horizontal: 'left',    vertical: 'top',    wrapText: true  };
const AL_LW  : Partial<ExcelJS.Alignment> = { horizontal: 'left',    vertical: 'middle', wrapText: true  };

// ─── Constantes CFMOTO ───────────────────────────────────────────────────
const CF = {
  SHIPPER:      'CFMOTO MEXICO POWER, S. DE R.L. DE C.V.',
  SHIPPER_RFC:  'CMP220712ND9',
  SHIPPER_ADDR: 'Tecnología 107, VYNMSA Apodaca Industrial Park, Apodaca, Nuevo León C.P. 66628',
  SHIPPER_FULL: 'CALLE TECNOLOGIA NO. 107, COL.VYNMSA APODACA INDUSTRIAL PARK, APODACA, NUEVO LEÓN C.P. 66628 RFC: CMP220712ND9',
  SHIPPER_TEL:  'Lizeth Sanchéz 462 332 4336',
  SHIPPER_EMAIL:'lizeth.flores@cfmoto.com',
  SHIPPER_STATE:'NUEVO LEON',
  SHIPPER_CP:   '66628',

  CONSIGNEE:    'CFMOTO POWERSPORTS INC.',
  CONSIGNEE_ADDR:'5005 Nathan Lane N, Plymouth MN 55442',
  CONSIGNEE_WH: 'Smart Warehouse 19351 Montrose ST Edgerton, KS 66021',
  CONSIGNEE_TEL:'913-802-2663',
  CONSIGNEE_TAX:'22-3962475',
  CONSIGNEE_ST: 'KANSAS',
  CONSIGNEE_CP: '66021',

  CHINA_NAME:   'ZHEJIANG CFMOTO POWER CO.,LTD',
  CHINA_ADDR:   'WUZHOU ROAD, YUHANG\nECONOMIC DEVELOPMENT ZONE NUM. EXT.116 C.P.311100 HANGZHOU ZHEJIANG, CHINA',
  CHINA_TAXID:  '91330100757206158J',
  CHINA_NAME_ZH:'浙江春风动力股份有限公司',

  FROM_PORT:    'Laredo',
  TO_PORT:      'Kansas',
  VIA:          'By Truck',
  VIA_UP:       'BY TRUCK',
  AGENT:        'Arcbest',
  AGENT_ADUANAL:'JAMCO NUEVO LAREDO',
  AGENT_PATENTE:'1647',
  AGENT_CONTACTO:'HECTOR DE LA MIYAR',
  AGENT_TEL:    '(867) 719-4810 o 719-47-99  Ext.5261',
  CUSTOMS_CONTACT:'J. AUGUSTO LAZO',

  IMPORT_CODE:  '26733',
  SHIPPER_CODE: '26672',
  ORIGIN:       'MX',
  RULING:       'N318685',
  INCOTERM:     'FCA',
  PED_CLAVE:    'RT',
  FRACCION_DEF: '8703219900',
  DESC_MERCH:   'VEHICULO UTILITARIO',
  BRAND:        'CFMOTO',
  CLAVE_PROD:   '25101503',
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, it) => {
    const k = String(it[key] ?? 'X');
    (acc[k] = acc[k] || []).push(it); return acc;
  }, {} as Record<string, T[]>);
}

function amountToWords(amount: number): string {
  const O = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN',
    'ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const T = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  function h(n: number): string {
    if (!n) return '';
    let s = '';
    if (n >= 100) { s += O[Math.floor(n/100)] + ' HUNDRED '; n %= 100; }
    if (n >= 20)  { s += T[Math.floor(n/10)]; if (n%10) s += ' ' + O[n%10]; }
    else if (n>0) s += O[n];
    return s.trim();
  }
  const d = Math.floor(amount);
  const parts: string[] = [];
  if (d >= 1000000) parts.push(h(Math.floor(d/1000000)) + ' MILLION');
  if (d >= 1000)    parts.push(h(Math.floor((d%1000000)/1000)) + ' THOUSAND');
  const r = h(d % 1000); if (r) parts.push(r);
  return (parts.join(' ').trim() || 'ZERO') + ' DOLLAR' + (d !== 1 ? 'S' : '');
}

function modelCode(modelo: string): string { return modelo.split(' ').pop() || modelo; }

/** Escribe un valor en la celda y opcionalmente aplica estilo */
function sc(
  ws: ExcelJS.Worksheet,
  row: number, col: number,
  value: ExcelJS.CellValue,
  opts?: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.Fill;
    border?: Partial<ExcelJS.Borders>;
    align?: Partial<ExcelJS.Alignment>;
    numFmt?: string;
  }
) {
  const cell = ws.getCell(row, col);
  if (value !== null && value !== undefined && value !== '') cell.value = value;
  if (opts?.font)   cell.font      = opts.font;
  if (opts?.fill)   cell.fill      = opts.fill;
  if (opts?.border) cell.border    = opts.border;
  if (opts?.align)  cell.alignment = opts.align;
  if (opts?.numFmt) cell.numFmt    = opts.numFmt;
}

/** Aplica estilo a un rango de celdas (sin modificar valores) */
function styleRange(
  ws: ExcelJS.Worksheet,
  r1: number, c1: number, r2: number, c2: number,
  opts: { font?: Partial<ExcelJS.Font>; fill?: ExcelJS.Fill; border?: Partial<ExcelJS.Borders>; align?: Partial<ExcelJS.Alignment> }
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      if (opts.font)   cell.font      = opts.font;
      if (opts.fill)   cell.fill      = opts.fill;
      if (opts.border) cell.border    = opts.border;
      if (opts.align)  cell.alignment = opts.align;
    }
  }
}

/** Setea anchos de columna (1-indexed) desde un objeto {0-indexed: width} */
function setCols(ws: ExcelJS.Worksheet, widths: Record<number, number>) {
  Object.entries(widths).forEach(([ci, w]) => {
    ws.getColumn(Number(ci) + 1).width = Number(w);
  });
}

/** Setea alto de fila (1-indexed) desde un objeto {0-indexed: pt} */
function setRows(ws: ExcelJS.Worksheet, heights: Record<number, number>) {
  Object.entries(heights).forEach(([ri, h]) => {
    ws.getRow(Number(ri) + 1).height = Number(h);
  });
}

// ─── Configuraciones de página exactas por sheet (extraídas del Excel) ────
interface PageCfg {
  orientation: 'portrait' | 'landscape';
  scale?: number;      // % (1-100), use cuando fitToPage es false
  fitToPage?: boolean;
  fitToWidth?: number;
  fitToHeight?: number;
  hCenter?: boolean;
  left: number; right: number; top: number; bottom: number;
  header: number; footer: number;
}

const PAGE: Record<string, PageCfg> = {
  // FORMATO: A4, vertical, 100%, márgenes 1.78cm/1.91cm
  FORMATO: {
    orientation:'portrait', scale:100,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
  // PROFORMA: A4, horizontal, 46% escala, fitToPage=true, centrado horizontal
  PROFORMA: {
    orientation:'landscape', scale:46, fitToPage:true, fitToWidth:1, fitToHeight:1, hCenter:true,
    left:0.23622047244094499, right:0.23622047244094499,
    top:0.74803149606299202, bottom:0.74803149606299202,
    header:0.31496062992126, footer:0.31496062992126,
  },
  // BILL OF LADING: A4, horizontal, 96%, fitToPage=true, márgenes 1.91cm/2.54cm
  BOL: {
    orientation:'landscape', scale:96, fitToPage:true, fitToWidth:1, fitToHeight:1,
    left:0.75, right:0.75, top:1.0, bottom:1.0, header:0.5, footer:0.5,
  },
  // CFM_INSTRUCTIONS: A4, vertical, 100%, márgenes estándar
  INSTRUCCIONES: {
    orientation:'portrait', scale:100,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
  // CFC invoiced to CFP: A4, horizontal, 100%, márgenes estándar
  CFC_CFP: {
    orientation:'landscape', scale:100,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
  // IN-with CFM: A4, horizontal, 100%, márgenes estándar
  IN_CFP: {
    orientation:'landscape', scale:100,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
  // Packing List: A4, horizontal, 97%, márgenes ajustados 0.92cm todos lados
  PL_CFP: {
    orientation:'landscape', scale:97,
    left:0.36111111111111099, right:0.36111111111111099,
    top:0.36111111111111099, bottom:0.36111111111111099,
    header:0.5, footer:0.5,
  },
  // LAY OUT CCP: A4, vertical, 80%, fitToPage=true (1 página de ancho)
  CCP: {
    orientation:'portrait', scale:80, fitToPage:true, fitToWidth:1, fitToHeight:0,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
  // CFMOTO CSV: A4, vertical, 100%, márgenes estándar
  CSV: {
    orientation:'portrait', scale:100,
    left:0.7, right:0.7, top:0.75, bottom:0.75, header:0.3, footer:0.3,
  },
};

function applyPageSetup(ws: ExcelJS.Worksheet, cfg: PageCfg) {
  ws.pageSetup.paperSize   = 9; // A4
  ws.pageSetup.orientation = cfg.orientation;

  if (cfg.fitToPage) {
    ws.pageSetup.fitToPage   = true;
    ws.pageSetup.fitToWidth  = cfg.fitToWidth  ?? 1;
    ws.pageSetup.fitToHeight = cfg.fitToHeight ?? 1;
    // ExcelJS: cuando fitToPage=true NO setear scale (se ignora)
  } else {
    ws.pageSetup.scale = cfg.scale ?? 100;
  }

  if (cfg.hCenter) ws.pageSetup.horizontalCentered = true;

  // Márgenes en pulgadas (ExcelJS acepta el objeto margins directamente)
  (ws.pageSetup as any).margins = {
    left:   cfg.left,
    right:  cfg.right,
    top:    cfg.top,
    bottom: cfg.bottom,
    header: cfg.header,
    footer: cfg.footer,
  };
}

export async function downloadWB(wb: ExcelJS.Workbook, filename: string) {

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. CFMOTO CSV — Calibri 11pt, anchos exactos, sin estilos especiales
// ════════════════════════════════════════════════════════════════════════════
export async function generateCfmotoXLSX(vins: any[], invoiceNo: string, asnNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics'; wb.created = new Date();
  const ws = wb.addWorksheet('CFMOTO CSV');
  applyPageSetup(ws, PAGE.CSV);

  // Anchos exactos del Excel original (0-indexed → 1-indexed)
  setCols(ws, {
    0:19.8,1:24.2,2:4.5,3:9.5,4:10.5,5:7.5,6:10.7,7:14.2,8:13.0,9:12.5,
    10:4.2,11:6.8,12:23.8,13:23.8,14:18.5,15:8.5,16:11.5,17:5.2,18:7.5,
    19:10.8,20:8.2,21:3.3,22:12.0,23:12.5,24:14.3,25:10.5,26:13.5,
    27:17.0,28:14.2,29:17.8,30:18.5,
  });

  const HEADERS = [
    'INVOICE','ASN NUMBER','LINE','IMPORTER','CONSIGNEE','SHIPPER','INV-DATE',
    'HTS DUT/VALUE','WEIGHT-KILOS','PART DESC','QTY','ORIGIN',
    'PART-NO.','PART-NO. CFMOTO','MID','TRLR-NO.','NO.-PALLETS','UOM',
    'P.O-NO.','HTS','RELATED','SPI','Import Code','Industry Code',
    'Model','Model Year','MFG Month/Yr','Date Location Code',
    'Item ID No Type','Item ID No','Test Group Name/No',
  ];

  // Fila 1: headers
  const hRow = ws.getRow(1);
  HEADERS.forEach((h, i) => {
    hRow.getCell(i + 1).value = h;
    hRow.getCell(i + 1).font  = F_CALIBRI(11, false);
  });

  const totalUnits  = vins.length;
  const totalValUsd = vins.reduce((s: number, v: any) => s + Number(v.valorUsd || 0), 0);
  const totalBruto  = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
  const invoiceDate = vins[0]?.outDate || '';
  const htsus       = vins[0]?.htsus  || '';
  const mid         = vins[0]?.mid    || '';

  vins.forEach((v: any, i: number) => {
    const r     = ws.getRow(i + 2);
    const isF   = i === 0;
    const code  = ' ' + modelCode(v.modelo); // Leading space as in original
    const year  = v.outDate ? String(new Date(v.outDate).getFullYear()) : '';
    let mfgYr   = '';
    if (v.productionDate) {
      const pd = String(v.productionDate).replace(/[^0-9]/g,'');
      mfgYr = pd.length >= 6 ? pd.slice(0, 6) : pd;
    } else if (v.outDate) {
      const d = new Date(v.outDate);
      mfgYr = String(d.getMonth()+1).padStart(2,'0') + d.getFullYear();
    }

    const vals: Record<number, any> = {
      2:  i + 1,          // C - LINE
      9:  'UTV VEHICLES', // J - PART DESC
      14: v.mid || mid,   // O - MID
      20: 'Y',            // U - RELATED
                          // V (21) - SPI = vacío
      22: '1',            // W - Import Code
      23: 'F',            // X - Industry Code
      24: code,           // Y - Model (código corto, leading space)
      25: year,           // Z - Model Year
      26: mfgYr,          // AA - MFG Month/Yr (centered in original)
      27: 'Vehicle',      // AB
      28: 'VIN',          // AC
      29: v.vin,          // AD
      30: v.testGroupNameNo || '', // AE
    };
    if (isF) {
      Object.assign(vals, {
        0:  invoiceNo, 1: asnNo, 3: CF.IMPORT_CODE,
        4:  CF.IMPORT_CODE, 5: CF.SHIPPER_CODE,
        6:  invoiceDate, 7: totalValUsd, 8: totalBruto,
        10: totalUnits, 11: CF.ORIGIN,
        12: v.modelo, 13: v.modelo,
        15: v.containerNo || '', 16: totalUnits, 17: 'PCS',
        19: v.htsus || htsus,
      });
    } else {
      vals[16] = 0; // NO.-PALLETS = 0 en filas siguientes
    }
    Object.entries(vals).forEach(([ci, val]) => {
      if (val !== '' && val !== null && val !== undefined) {
        const cell = r.getCell(Number(ci) + 1);
        cell.value = val;
        cell.font  = F_CALIBRI(11);
        if (Number(ci) === 26) cell.alignment = { horizontal: 'center' }; // MFG centered
      }
    });
  });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 1b. FORMATO — Tabla simple VIN, 9 columnas A-I
// ════════════════════════════════════════════════════════════════════════════
export async function generateFormatoXLSX(vins: any[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('FORMATO');
  applyPageSetup(ws, PAGE.FORMATO);

  // Anchos exactos extraídos del XML
  setCols(ws, { 0:10.82, 1:20.18, 2:18.54, 3:15, 4:10.82, 5:12.18, 6:24.82, 7:13.27, 8:162.18 });

  const BF = F_CALIBRI(10,true); const NF = F_CALIBRI(10,false);

  // Row 3: Encabezados — mismos colores del Excel original
  const headers: [number, string, ExcelJS.Fill][] = [
    [2, 'DESCRIPCION',   GREY_HEADER],
    [3, 'VIN NO',        YELLOW_FILL],
    [4, 'ENGINE NO',     YELLOW_FILL],
    [5, 'PESO NETO',     YELLOW_FILL],
    [6, 'PESO BRUTO',    YELLOW_FILL],
    [7, 'MODELO',        YELLOW_FILL],
    [8, 'Val. Agregado', YELLOW_FILL],
    [9, 'FORMULA',       GREY_HEADER],
  ];
  headers.forEach(([ci, label, fill]) => {
    const cell = ws.getCell(3, ci);
    cell.value = label; cell.font = BF; cell.fill = fill;
    cell.border = allThin(); cell.alignment = AL_CC;
  });

  // Una fila por VIN a partir de row 4
  vins.forEach((v: any, i: number) => {
    const row = 4 + i;
    const formula = `VEHICULO UTILITARIO | VIN ${v.vin} / ENGINE ${v.engine || ''} / PESO NETO ${v.pesoNeto} KG / PESO BRUTO ${v.pesoBruto} KG MODELO ${v.modelo}`;
    const valAgregado = Number(v.valAgregado || v.valAcero || 0);
    [
      [2, CF.DESC_MERCH, NF, AL_LW ],
      [3, v.vin,         NF, AL_CC ],
      [4, v.engine || '',NF, AL_CC ],
      [5, Number(v.pesoNeto || 0),  NF, AL_CC ],
      [6, Number(v.pesoBruto || 0), NF, AL_CC ],
      [7, v.modelo,      NF, AL_CC ],
      [8, valAgregado,   NF, AL_CC ],
      [9, formula,       NF, AL_LW ],
    ].forEach(([ci, val, font, align]) => {
      const cell = ws.getCell(row, ci as number);
      cell.value = val; cell.font = font as Partial<ExcelJS.Font>;
      cell.alignment = align as Partial<ExcelJS.Alignment>;
      if ((ci as number) <= 8) cell.border = allThin();
    });
  });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. PROFORMA VEHICULOS — Times New Roman 10pt Bold, bordes thin
// ════════════════════════════════════════════════════════════════════════════
export async function generateProformaXLSX(
  vins: any[], invoiceNo: string, isFormato = false
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const sheetName = isFormato ? 'FORMATO' : 'PROFORMA VEHICULOS';
  const ws = wb.addWorksheet(sheetName);
  applyPageSetup(ws, isFormato ? PAGE.FORMATO : PAGE.PROFORMA);

  // Anchos de columna (cols A-V = 1-22)
  setCols(ws, {
    0:4.0, 1:8.0, 2:10.5, 3:5.5, 4:14.5, 5:10.5, 6:11.0, 7:11.0,
    8:40.0, 9:15.0, 10:10.0, 11:9.5, 12:7.0, 13:9.5, 14:7.0, 15:9.5,
    16:2.5, 17:14.0, 18:13.0, 19:11.5, 20:10.5, 21:10.0,
  });

  // Altos de fila (0-indexed keys)
  setRows(ws, {1:33.0,2:23.25,4:8.25,14:10.5,15:12.75,16:7.5,17:10.5,18:7.5,
    23:21.0,24:18.0,25:21.75,26:20.25,27:21.0});

  const BASE_FONT = F_TNR(10, true);
  const BASE_BORDER = allThin();

  // ── Cabecera PROFORMA ──
  if (!isFormato) {
    ws.mergeCells('B2:V2'); sc(ws,2,2, `Folio: ${invoiceNo}`, { font: F_TNR(10,true), align: AL_LC });
    ws.mergeCells('B3:V3'); sc(ws,3,2, 'PROFORMA DE FACTURACION Y DEPÓSITOS', { font: F_TNR(12,true), align: AL_CC });
    ws.mergeCells('C5:G5'); sc(ws,5,3, 'Proyecto',            { font: BASE_FONT, align: AL_LC });
    ws.mergeCells('H5:V5'); sc(ws,5,8, 'CFMOTO',              { font: BASE_FONT });
    ws.mergeCells('C6:G6'); sc(ws,6,3, 'Cliente',             { font: BASE_FONT, align: AL_LC });
    ws.mergeCells('H6:V6'); sc(ws,6,8, CF.CHINA_NAME,         { font: BASE_FONT });
    ws.mergeCells('C7:G7'); sc(ws,7,3, 'Régimen Fiscal',      { font: BASE_FONT });
    ws.mergeCells('H7:V7'); sc(ws,7,8, '616 Sin obligaciones fiscales', { font: BASE_FONT });
    ws.mergeCells('C8:V8'); sc(ws,8,3, `DIRECCION: NO.116 WUZHOU ROAD,YUHANG ECONOMIC DEVELOPMENT ZONE, HANGZHOU, ZHEJIANG, CHINA`, { font: BASE_FONT });
    ws.mergeCells('C9:G9'); sc(ws,9,3, 'CP',   { font: BASE_FONT }); sc(ws,9,8,'311100',    { font: BASE_FONT });
    ws.mergeCells('C10:G10');sc(ws,10,3,'TAX ID',{ font: BASE_FONT }); sc(ws,10,8,CF.CHINA_TAXID, { font: BASE_FONT });
    ws.mergeCells('C11:G11');sc(ws,11,3,'EMISOR',{ font: BASE_FONT }); sc(ws,11,8,'CFMOTO MEXICO POWER', { font: BASE_FONT });
    ws.mergeCells('C12:G12');sc(ws,12,3,'TAX ID',{ font: BASE_FONT }); sc(ws,12,8,CF.SHIPPER_RFC, { font: BASE_FONT });
    ws.mergeCells('C13:G13');sc(ws,13,3,'Método de pago', { font: BASE_FONT }); sc(ws,13,8,'PUE',{ font: BASE_FONT });
    ws.mergeCells('C14:G14');sc(ws,14,3,'Moneda', { font: BASE_FONT }); sc(ws,14,8,'USD', { font: BASE_FONT });
    ws.mergeCells('B19:V19');sc(ws,19,2,'EXPORTACION: 04 Definitiva con clave distinta', { font: BASE_FONT });
    ws.mergeCells('C23:V23');sc(ws,23,3,'Incoterm: FCA FRANCO TRANSPORTISTA (LUGAR DESIGNADO).', { font: BASE_FONT });
  } else {
    // Cabecera FORMATO (Complemento Comercio Exterior)
    ws.mergeCells('B2:V2'); sc(ws,2,2, CF.SHIPPER, { font: F_TNR(11,true), align: AL_CC });
    ws.mergeCells('B3:V3'); sc(ws,3,2, CF.SHIPPER_FULL, { font: F_TNR(9,false), align: AL_LC });
    ws.mergeCells('B5:V5'); sc(ws,5,2, 'COMPLEMENTO DE COMERCIO EXTERIOR — EXPORTACIÓN DEFINITIVA', { font: F_TNR(11,true), align: AL_CC });
    ws.mergeCells('C7:G7'); sc(ws,7,3,'EXPORTADOR RFC:',{ font: BASE_FONT });
    ws.mergeCells('H7:V7'); sc(ws,7,8, `${CF.SHIPPER}  RFC: ${CF.SHIPPER_RFC}`, { font: BASE_FONT });
    ws.mergeCells('C8:G8'); sc(ws,8,3,'PEDIMENTO:',{ font: BASE_FONT });
    ws.mergeCells('H8:V8'); sc(ws,8,8, `DEFINITIVO  Clave: ${CF.PED_CLAVE}  Fracción: ${vins[0]?.taric || CF.FRACCION_DEF}`, { font: BASE_FONT });
    ws.mergeCells('C9:G9'); sc(ws,9,3,'INCOTERM:',{ font: BASE_FONT });
    ws.mergeCells('H9:V9'); sc(ws,9,8,'FCA FRANCO TRANSPORTISTA (LUGAR DESIGNADO).', { font: BASE_FONT });
    ws.mergeCells('C10:G10');sc(ws,10,3,'DESCRIPCIÓN:',{ font: BASE_FONT });
    ws.mergeCells('H10:V10');sc(ws,10,8,CF.DESC_MERCH, { font: BASE_FONT });
  }

  // ── Fila de encabezado de columnas (R27 en PROFORMA = fila 27 en ExcelJS) ──
  const HR = isFormato ? 23 : 27;
  const colHeaders = ['','SERIE','FOLIO','Cantidad','Objeto de impuesto (SAT)',
    'Unidad de Medida (SAT)','Uso de CFDI (SAT)','Clave Producto (SAT)',
    'Descripción','No. Parte','Precio Unitario','Subtotal ','Iva',
    'Retención','Descuento','Total','','Fracción arancelaria',
    '**Unidad Aduana','**Cantidad Aduana','**PU Aduana','Total'];
  colHeaders.forEach((h, ci) => {
    const cell = ws.getCell(HR, ci + 1);
    cell.value  = h;
    cell.font   = BASE_FONT;
    cell.fill   = GREY_HEADER;
    cell.border = BASE_BORDER;
    cell.alignment = AL_CC;
  });

  // Merges en fila de encabezado PROFORMA
  if (!isFormato) {
    ws.mergeCells(`A${HR}:J${HR}`); ws.mergeCells(`K${HR}:U${HR}`); ws.mergeCells(`V${HR}:W${HR}`);
  }

  // ── Filas de datos por VIN ──
  const invoiceDate = vins[0]?.outDate || '';
  const totalPuAdu  = vins.reduce((s: number, v: any) => s + Number(v.puAduana || v.valorUsd || 0), 0);
  const totalNeto   = vins.reduce((s: number, v: any) => s + Number(v.pesoNeto  || 0), 0);
  const totalBruto  = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
  const folio       = invoiceNo.replace(/^CFM-/, '');

  vins.forEach((v: any, i: number) => {
    const DR  = HR + 1 + i;
    const pu  = Number(v.puAduana || v.valorUsd || 0);
    const expo= v.expo || v.productNo || '';
    const desc= `${CF.DESC_MERCH} ( VIN ${v.vin} / ENGINE ${v.engine || ''} / PESO NETO ${v.pesoNeto} KG / PESO BRUTO ${v.pesoBruto})  MODELO ${v.modelo}`;

    const rowData: [number, any][] = [
      [2,  'CFM-'],[3, folio],[4,1],
      [5,  v.objetoImpuesto || '01- No objeto de impuesto'],
      [6,  v.unidadMedidaSat || 'H87 Pieza'],
      [7,  v.usoCfdi || 'S01 Sin Efectos fiscales'],
      [8,  v.claveProductoSat || CF.CLAVE_PROD],
      [9,  desc],[10, expo],[11, pu],[12, pu],
      [13, 0],[14, 0],[15, 0],[16, pu],
      [18, v.taric || CF.FRACCION_DEF],
      [19, v.unidadAduana || '06 PIEZA'],
      [20, v.cantidadAduana ?? 1],
      [21, pu],[22, pu],
    ];
    rowData.forEach(([ci, val]) => {
      const cell = ws.getCell(DR, ci);
      cell.value = val; cell.font = BASE_FONT;
      cell.border = BASE_BORDER; cell.fill = WHITE;
      if (ci >= 11 && ci <= 16) cell.alignment = AL_RC;
      else                        cell.alignment = AL_LW;
    });
    if (!isFormato) {
      ws.mergeCells(`A${DR}:J${DR}`);
      ws.mergeCells(`K${DR}:W${DR}`);
    }
  });

  // ── Fila de totales ──
  const TR = HR + 1 + vins.length;
  [[4, vins.length],[11,totalPuAdu],[12,0],[13,0],[14,0],[16,totalPuAdu],[22,totalPuAdu]].forEach(([ci,val]) => {
    const cell = ws.getCell(TR, ci as number);
    cell.value = val; cell.font = F_TNR(10,true);
    cell.border = BASE_BORDER; cell.fill = GREY_LIGHT;
    cell.alignment = AL_RC;
  });

  // ── Footer ──
  const FR = TR + 2;
  ws.mergeCells(`B${FR}:V${FR}`); sc(ws,FR,2,'OBSERVACIONES', { font: BASE_FONT });
  sc(ws,FR+2,2,'Total added value', { font: BASE_FONT });
  sc(ws,FR+2,3, 0, { font: BASE_FONT }); // val agregado (0 si no disponible)
  sc(ws,FR+3,2,'GRAND TOTAL (USD)', { font: BASE_FONT });
  sc(ws,FR+3,3, totalPuAdu, { font: F_TNR(10,true) });
  sc(ws,FR+5,2,'Destinatario', { font: BASE_FONT });
  sc(ws,FR+5,3, `${CF.CONSIGNEE} / TAX ID: ${CF.CONSIGNEE_TAX}`, { font: BASE_FONT });
  sc(ws,FR+6,3, CF.CONSIGNEE_ADDR, { font: BASE_FONT });
  sc(ws,FR+7,2,'Incoterm', { font: BASE_FONT }); sc(ws,FR+7,3,CF.INCOTERM,{ font: BASE_FONT });
  sc(ws,FR+8,2,'Brand / Marca: ', { font: BASE_FONT }); sc(ws,FR+8,3,CF.BRAND,{ font: BASE_FONT });

  const modelGroups = groupBy(vins, 'modelo');
  let fOffset = FR+9;
  Object.entries(modelGroups).forEach(([modelo, mv]: [string, any]) => {
    sc(ws,fOffset,2,'Model / Modelo: ',{ font: BASE_FONT }); sc(ws,fOffset,3,modelo,{ font: BASE_FONT }); fOffset++;
    sc(ws,fOffset,2,'BOM / Part Number',{ font: BASE_FONT }); sc(ws,fOffset,3,mv[0]?.expo||'',{ font: BASE_FONT }); fOffset++;
  });
  sc(ws,fOffset,2,'PESO NETO TOTAL',  { font: BASE_FONT }); sc(ws,fOffset,3,`${totalNeto} KG`, { font: BASE_FONT });
  sc(ws,fOffset+1,2,'PESO BRUTO TOTAL',{ font: BASE_FONT }); sc(ws,fOffset+1,3,`${totalBruto} KG`,{ font: BASE_FONT });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. BILL OF LADING — Arial/Calibri, bordes medium, anchos A-G
// ════════════════════════════════════════════════════════════════════════════
export async function generateBOLXLSX(vins: any[], invoiceNo: string, asnNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('BILL OF LADING');
  applyPageSetup(ws, PAGE.BOL);

  setCols(ws, { 0:22, 1:45, 2:3, 3:3, 4:3, 5:3, 6:25 });
  setRows(ws, { 1:30 });

  const BF = F_CALIBRI(11, true);
  const NF = F_CALIBRI(11, false);

  // ── Row 1: Título principal ──
  ws.mergeCells('A1:G1');
  sc(ws,1,1,'BILL OF LADING', { font: F_CALIBRI(18,true), align: AL_CC });

  // ── Rows 2-6: espacio para logo + separador ──
  for (let r=2;r<=6;r++) { ws.getRow(r).height = r===4 ? 40 : 8; }
  // Row 4: "CFMOTO" como sustituto de imagen
  ws.mergeCells('A4:G4'); sc(ws,4,1,'⊕  CFMOTO', { font: F_CALIBRI(16,true), align: AL_CC });

  // ── Row 7: SHIP FROM ──
  ws.mergeCells('A7:G7');
  sc(ws,7,1,'SHIP FROM', { font: BF, fill: GREY_HEADER, border: allThin(), align: AL_CC });
  [
    [8,'NAME',           `${CF.SHIPPER} / RFC: ${CF.SHIPPER_RFC}`],
    [9,'ADDRESS',        CF.SHIPPER_ADDR],
    [10,'Telephone / Fax No.', CF.SHIPPER_TEL],
    [11,'E-MAIL ADDRESS',CF.SHIPPER_EMAIL],
    [12,'ISSUE DATE: ',  vins[0]?.outDate || ''],
  ].forEach(([rn,lbl,val]) => {
    sc(ws,rn as number,1,lbl, { font: BF, border: allThin(), align: AL_LC });
    ws.mergeCells(`B${rn}:G${rn}`);
    sc(ws,rn as number,2,val, { font: NF, border: allThin(), align: AL_LW });
  });

  // ── Row 13: SHIP TO ──
  ws.mergeCells('A13:G13');
  sc(ws,13,1,'SHIP TO', { font: BF, fill: GREY_HEADER, border: allThin(), align: AL_CC });
  [
    [14,'NAME',              CF.CONSIGNEE],
    [15,'WAREHOUSE ADDRESS', CF.CONSIGNEE_WH],
    [16,'Telephone / Fax No.',CF.CONSIGNEE_TEL],
  ].forEach(([rn,lbl,val]) => {
    sc(ws,rn as number,1,lbl, { font: BF, border: allThin(), align: AL_LC });
    ws.mergeCells(`B${rn}:G${rn}`);
    sc(ws,rn as number,2,val, { font: NF, border: allThin(), align: AL_LW });
  });

  // ── Row 17: blank ── Row 18: SHPPING DETAILS ──
  ws.getRow(17).height = 8;
  ws.mergeCells('A18:G18');
  sc(ws,18,1,'SHPPING DETAILS', { font: BF, fill: GREY_HEADER, border: allThin(), align: AL_CC }); // typo intencional

  const containerGroups = groupBy(vins, 'containerNo');
  let curRow = 19;
  Object.entries(containerGroups).forEach(([containerNo, cvins]: [string, any]) => {
    const qty      = cvins.length;
    const sealNo   = cvins[0]?.sealNo || '';
    const brutoSum = cvins.reduce((s: number, v: any) => s + Number(v.pesoBruto||0), 0);
    const lbsSum   = cvins.reduce((s: number, v: any) => s + Number(v.pesoBrutoLb||0), 0);
    const modelo   = Object.keys(groupBy(cvins,'modelo')).join(' / ');
    const details: [string, any][] = [
      ['INVOICE NO.', invoiceNo],
      ['ORDER NO.',   asnNo],
      ['MODLE ',      modelo],
      ['PCS',         qty],
      ['G.W. Kg',     `${brutoSum.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g,',')} Kg`],
      ['G.W. Lbs',    `${(lbsSum||brutoSum*2.20462).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')} Lbs`],
      ['CONTAINER NO.',containerNo],
      ['SEAL NO.',    sealNo],
      ['AGENT',       CF.AGENT],
    ];
    details.forEach(([lbl, val]) => {
      sc(ws,curRow,1,lbl, { font: BF, border: allThin(), align: AL_LC });
      ws.mergeCells(`B${curRow}:G${curRow}`);
      sc(ws,curRow,2,val,  { font: NF, border: allThin(), fill: GREY_LIGHT, align: AL_CC });
      curRow++;
    });
    curRow++;
  });

  // Firma
  curRow++;
  sc(ws,curRow,1,'TRUCKER\' s Signature:', { font: BF });
  sc(ws,curRow,7,'CFMOTO\' s Signature:', { font: BF });
  curRow++;
  sc(ws,curRow,1,'SHIPMENT DATE: ', { font: NF });
  sc(ws,curRow,7,'SHIPMENT DATE: ',  { font: NF });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. CFM INSTRUCTIONS LETTER — Calibri, estructura forma
// ════════════════════════════════════════════════════════════════════════════
export async function generateInstruccionesXLSX(vins: any[], invoiceNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('CFM_INSTRUCTIONS LETTER');
  applyPageSetup(ws, PAGE.INSTRUCCIONES);

  setCols(ws, { 0:2, 1:14, 2:14, 3:22, 4:10, 5:10, 6:10, 7:14, 8:22, 9:12 });

  const BF  = F_CALIBRI(10, true);
  const NF  = F_CALIBRI(10, false);
  const fraccion = vins[0]?.taric || CF.FRACCION_DEF;
  const containerGroups = groupBy(vins, 'containerNo');
  const invoiceDate     = vins[0]?.outDate || '';

  let r = 1;
  ws.mergeCells(`B${r}:J${r}`);
  sc(ws,r,2,'CARTA    DE    INSTRUCCIONES      -       EXPORTACION', { font: F_CALIBRI(12,true), align: AL_CC, fill: GREY_HEADER, border: allThin() }); r+=2;

  sc(ws,r,2,'EXPORTADOR', { font: BF }); ws.mergeCells(`C${r}:J${r}`);
  sc(ws,r,3,CF.SHIPPER, { font: NF }); r++;
  sc(ws,r,8,'Fecha', { font: BF }); sc(ws,r,9,invoiceDate,{ font: NF }); r+=2;

  // Embarque
  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'EMBARQUE', { font: BF, fill: GREY_HEADER, border: topThin(), align: AL_CC }); r++;
  sc(ws,r,3,'Terrestre :',{ font: NF }); sc(ws,r,4,'(   X     )',{ font: NF });
  sc(ws,r,6,'Ferrocarril :',{ font: NF }); sc(ws,r,7,'(        )',{ font: NF });
  sc(ws,r,9,'Virtual :',{ font: NF }); sc(ws,r,10,'(        )',{ font: NF }); r++;
  sc(ws,r,3,'Programa', { font: NF }); sc(ws,r,9,'Original',{ font: NF }); sc(ws,r,10,'Copia',{ font: NF }); r+=2;

  // Documentos
  ws.mergeCells(`C${r}:J${r}`); sc(ws,r,3,'Factura (s)', { font: BF }); r++;
  sc(ws,r,3,'Factura Nro.', { font: NF }); sc(ws,r,4,invoiceNo,{ font: BF,border: allThin() }); sc(ws,r,10,'(  X  )',{font:NF}); r++;
  sc(ws,r,3,'Identificadores generales',{ font: NF }); r+=2;
  sc(ws,r,3,'Packing List',{ font: NF }); sc(ws,r,4,'SI',{ font: BF }); r++;
  sc(ws,r,3,'B / L (s)',   { font: NF }); sc(ws,r,4,'SI',{ font: BF }); sc(ws,r,9,'(      )'); sc(ws,r,10,'(      )'); r++;

  Object.entries(containerGroups).forEach(([containerNo,cvins]: [string, any]) => {
    const sealNo = cvins[0]?.sealNo || '';
    sc(ws,r,3,'No. Caja Trailer ',{ font: NF }); sc(ws,r,4,containerNo,{ font: BF, border: allThin() }); r++;
    sc(ws,r,3,'Sello ',{ font: NF }); sc(ws,r,4,sealNo,{ font: BF, border: allThin() });
    sc(ws,r,6,'SI',{ font: NF }); sc(ws,r,7,'NO ',{ font: NF }); r++;
  });

  sc(ws,r,4,'Vinculacion ',{ font: NF }); sc(ws,r,6,'(X)',{ font: NF }); sc(ws,r,7,'(   )',{ font: NF }); r++;

  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'DOCUMENTOS', { font: BF, fill: GREY_HEADER }); r++;
  ws.mergeCells(`B${r}:C${r}`); sc(ws,r,2,'INSTRUCCIONES',{ font: BF });
  ws.mergeCells(`D${r}:H${r}`); sc(ws,r,4,'DECLARAR VIN AND ENGINE NUMBERS',{ font: NF }); r++;
  ws.mergeCells(`B${r}:C${r}`); sc(ws,r,2,'ESPECIALES',{ font: BF }); r+=2;

  // Tipo de Pedimento
  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'TIPO DE PEDIMENTO', { font: BF, fill: GREY_HEADER, border: topThin() }); r++;
  sc(ws,r,3,'Regimen',{ font: BF, border: allThin() }); sc(ws,r,4,'Clave',{ font: BF, border: allThin() });
  sc(ws,r,5,'Fraccion',{ font: BF, border: allThin() }); sc(ws,r,7,'Descripcion',{ font: BF, border: allThin() }); r++;
  sc(ws,r,3,'DEFINITIVO',{ font: NF, border: allThin() }); sc(ws,r,4,CF.PED_CLAVE,{ font: NF, border: allThin() });
  sc(ws,r,5,fraccion,{ font: NF, border: allThin() });
  ws.mergeCells(`G${r}:J${r}`); sc(ws,r,7,CF.DESC_MERCH,{ font: NF, border: allThin() }); r+=3;

  sc(ws,r,2,'INCOTERMS',{ font: BF }); sc(ws,r,3,CF.INCOTERM,{ font: NF, border: allThin() }); r+=4;

  // Transporte
  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'TRANSPORTE', { font: BF, fill: GREY_HEADER }); r++;
  sc(ws,r,3,'Por el cliente',{ font: NF }); sc(ws,r,8,'Agente aduanal',{ font: NF }); r++;
  sc(ws,r,3,'Linea Mexicana', { font: NF }); sc(ws,r,8,'Americano',{ font: NF }); r++;
  sc(ws,r,3,'Lienea Americana',{ font: NF }); sc(ws,r,8,'Contacto',{ font: NF }); r+=2;

  // IMPORTADOR
  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'IMPORTADOR / COMPRADOR', { font: BF, fill: GREY_HEADER, border: allThin() }); r++;
  sc(ws,r,2,'Empresa', { font: BF }); ws.mergeCells(`C${r}:G${r}`);
  sc(ws,r,3,`${CF.CHINA_NAME} / TAX ID: ${CF.CHINA_TAXID}`, { font: NF }); sc(ws,r,8,'Agente aduanal',{ font: BF }); sc(ws,r,9,CF.AGENT_ADUANAL,{ font: NF }); r++;
  sc(ws,r,2,'Dirección', { font: BF }); ws.mergeCells(`C${r}:G${r}`);
  sc(ws,r,3,CF.CHINA_ADDR.replace(/\n/g,' '),{ font: NF }); sc(ws,r,9,CF.AGENT_CONTACTO,{ font: NF }); r++;
  sc(ws,r,2,'Tax-ID', { font: BF }); sc(ws,r,3,CF.CHINA_TAXID,{ font: NF }); sc(ws,r,9,`PATENTE ${CF.AGENT_PATENTE}`,{ font: NF }); r++;
  sc(ws,r,2,'Contacto:',{ font: BF }); sc(ws,r,9,CF.CUSTOMS_CONTACT,{ font: NF }); r++;
  sc(ws,r,2,'Telefono/correo',{ font: BF }); sc(ws,r,9,CF.AGENT_TEL,{ font: NF }); r+=2;

  // DESTINATARIO
  ws.mergeCells(`B${r}:J${r}`); sc(ws,r,2,'DESTINATARIO', { font: BF, fill: GREY_HEADER, border: allThin() }); r++;
  sc(ws,r,2,'Empresa',  { font: BF }); ws.mergeCells(`C${r}:H${r}`); sc(ws,r,3,CF.CONSIGNEE,{ font: NF }); r++;
  sc(ws,r,2,'Dirección',{ font: BF }); ws.mergeCells(`C${r}:H${r}`); sc(ws,r,3,CF.CONSIGNEE_ADDR,{ font: NF }); r++;
  sc(ws,r,2,'Tax-ID',   { font: BF }); sc(ws,r,3,CF.CONSIGNEE_TAX,{ font: NF }); r++;
  sc(ws,r,2,'Ciudad o Estado', { font: BF }); sc(ws,r,3,'MN',{ font: NF }); r+=2;

  const totalNeto  = vins.reduce((s: number, v: any) => s + Number(v.pesoNeto  || 0), 0);
  const totalBruto = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
  sc(ws,r,2,'SE ENTREGA EN:',{ font: BF }); sc(ws,r,3,CF.AGENT,{ font: NF });
  sc(ws,r,8,'Peso Bruto',{ font: BF }); sc(ws,r,9,totalBruto,{ font: NF }); sc(ws,r,10,'KGS',{ font: NF }); r++;
  sc(ws,r,8,'Peso Neto', { font: BF }); sc(ws,r,9,totalNeto, { font: NF }); sc(ws,r,10,'KGS',{ font: NF }); r+=2;
  sc(ws,r,2,'Atentamente', { font: BF });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. CFC invoiced to CFP — Times New Roman, bordes exact, 14 cols A-N
// ════════════════════════════════════════════════════════════════════════════

export async function generateCfcCfpXLSX(vins: any[], invoiceNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('CFC invoiced to CFP');
  applyPageSetup(ws, PAGE.CFC_CFP);

  setCols(ws, {
    0:1.54, 1:10, 2:12, 3:12.54, 4:4, 5:6.54, 6:10.18,
    7:8.82, 8:8, 9:6.45, 10:10, 11:2.54, 12:5, 13:20.27,
  });
  setRows(ws, { 0:20,1:15,2:15,3:25,4:25,5:8,6:12,7:12,8:12,9:8,10:12,11:12,12:8,
                13:18,14:12,15:8,16:25,17:12,18:30,19:12,20:12 });

  const BF = F_TNR(10,true); const NF = F_TNR(10,false);
  const invoiceDate = vins[0]?.outDate || '';

  // ── Cabecera empresa China — filas 1-5 mergeadas B:N ──
  ws.mergeCells('B1:N1'); sc(ws,1,2,CF.CHINA_NAME_ZH,          { font: F_TNR(14,true), align: AL_CC });
  ws.mergeCells('B2:N2'); sc(ws,2,2,' ZHEJIANG CFMOTO POWER CO.,LTD ', { font: F_TNR(11,true), align: AL_CC });
  ws.mergeCells('B3:N3'); sc(ws,3,2,'NO.116,WUZHOU ROAD,YUHANG ECONOMIC DEVELOPMENT ZONE,\nHANGZHOU 311100,ZHEJIANG PROVINCE,P.R.CHINA', { font: NF, align: AL_CC });
  ws.mergeCells('B4:N4'); sc(ws,4,2,'商 业 发 票',              { font: F_TNR(14,true), align: AL_CC });
  ws.mergeCells('B5:N5'); sc(ws,5,2,'COMMERCIAL INVOICE',        { font: F_TNR(12,true), align: AL_CC });

  // ── Fila 6: 发票号码 en I6:J6 y vacío k6:M6 ──
  ws.mergeCells('I6:J6'); sc(ws,6,9,'发票号码', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells('K6:M6');

  // ── Fila 7: 至 | INV NO.: en I7:J7 | número en K7:N7 ──
  sc(ws,7,2,'至', { font: BF });
  ws.mergeCells('I7:J7'); sc(ws,7,9,'INV NO.:', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells('K7:N7'); sc(ws,7,11,invoiceNo,  { font: BF, border: allThin(), align: AL_LC });

  // ── Fila 8: TO: + consignee en C8:G8 | 日期 en I8:J8 ──
  sc(ws,8,2,'TO:', { font: BF });
  ws.mergeCells('C8:G8'); sc(ws,8,3,CF.CONSIGNEE, { font: BF, border: allThin(), align: AL_LC });
  ws.mergeCells('I8:J8'); sc(ws,8,9,'日期', { font: BF, border: allThin(), align: AL_CC });

  // ── Fila 9: Address + addr en C9:G9 | Date en I9:J9 | fecha en K9:M9 ──
  sc(ws,9,2,'Address', { font: NF });
  ws.mergeCells('C9:G9'); sc(ws,9,3,CF.CONSIGNEE_ADDR, { font: NF, border: allThin(), align: AL_LW });
  ws.mergeCells('I9:J9'); sc(ws,9,9,'Date', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells('K9:M9'); sc(ws,9,11,invoiceDate, { font: NF, border: allThin(), align: AL_LC });

  // ── Fila 11-12: COMMENTS ──
  sc(ws,11,3,'COMMENTS:', { font: BF });
  ws.mergeCells('D11:N11');
  sc(ws,11,4,`Direct Shipment from Mexico to CFMOTO Powersports Inc. of Mexico origin vehicles produced by CFMOTO MEXICO POWER, S. DE R.L. DE C.V. for Zhejiang CFMOTO Power Co. Ltd.`, { font: NF, align: AL_LW });
  sc(ws,12,4,`REF.  RULING ${CF.RULING}`, { font: NF });

  // ── Fila 14: Route — posiciones exactas del Excel ──
  //   C14=装船口岸/From | D14:E14=Laredo | F14=经/Via | G14=BY TRUCK | H14:I14=目的地/To | J14:N14=Kansas
  sc(ws,14,3,'装船口岸\nFrom', { font: BF, border: allThin(), align: AL_CC });
  // Table headers
  const TH = 17;
  ws.mergeCells(`B${TH}:C${TH}`); sc(ws,TH,2,'唛头及包/箱号\nMarks & Numbers', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells(`D${TH}:G${TH}`); sc(ws,TH,4,'货 品 名 称\nDESCRIPTIONS',       { font: BF, border: allThin(), align: AL_CC });
  sc(ws,TH,8,'数量\nQUANTITY',     { font: BF, border: allThin(), align: AL_CC });
  sc(ws,TH,10,'单  价\nUNIT PRICE', { font: BF, border: allThin(), align: AL_CC });
  sc(ws,TH,13,`金  额\nAMOUNT`,    { font: BF, border: allThin(), align: AL_CC });
  sc(ws,TH+1,13,`${CF.INCOTERM} ${CF.FROM_PORT}`, { font: NF, border: allThin(), align: AL_CC });

  // Data rows per model
  const modelGroups = groupBy(vins, 'modelo');
  let dr = TH + 2;
  let grandTotal = 0;
  Object.entries(modelGroups).forEach(([modelo,mvins]: [string, any]) => {
    const qty     = mvins.length;
    const unitVal = Number(mvins[0]?.valorUsd || 0);
    const total   = qty * unitVal;
    grandTotal   += total;

    ws.mergeCells(`B${dr}:C${dr}`);
    sc(ws,dr,2,`Country of origin Mexico                    REF. RULING ${CF.RULING}`, { font: NF, border: allThin(), align: AL_LW });
    ws.mergeCells(`D${dr}:G${dr}`);
    sc(ws,dr,4,modelo,               { font: BF, border: allThin() });
    sc(ws,dr,8,qty,                  { font: NF, border: allThin(), align: AL_CC });
    sc(ws,dr,9,'UNIT',               { font: NF, border: allThin() });
    sc(ws,dr,10,'USD',               { font: NF, border: allThin() });
    sc(ws,dr,11,unitVal,             { font: NF, border: allThin(), align: AL_RC });
    sc(ws,dr,13,total,               { font: NF, border: allThin(), align: AL_RC });
    dr++;
  });

  // TOTAL
  ws.mergeCells(`B${dr}:G${dr}`); sc(ws,dr,2,'TOTAL:',{ font: BF, border: allThin() });
  sc(ws,dr,8,'USD', { font: BF, border: allThin() });
  sc(ws,dr,13,grandTotal, { font: BF, border: allThin(), align: AL_RC }); dr++;
  ws.mergeCells(`B${dr}:G${dr}`); sc(ws,dr,2,'SAY TOTAL ：', { font: BF });
  ws.mergeCells(`H${dr}:M${dr}`); sc(ws,dr,8,amountToWords(grandTotal), { font: BF, align: AL_LW });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. IN-with CFM title to CFP — Calibri/TNR, bordes thin, 22 cols A-V
// ════════════════════════════════════════════════════════════════════════════
export async function generateInCfpXLSX(vins: any[], invoiceNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('IN-with CFM title to CFP');
  applyPageSetup(ws, PAGE.IN_CFP);

  setCols(ws, { 0:3,1:3,2:3,3:18,4:2,5:2,6:2,7:8,8:2,9:2,10:7,11:2,12:2,13:2,14:5,15:5,16:3,17:10,18:2,19:2,20:2,21:14 });
  setRows(ws, { 0:20,1:15,2:35,3:12,4:8,5:20,6:20,7:12,8:8,9:12,10:12,11:8,12:18,13:12,14:8,15:8,16:8,17:8,18:25,19:15,20:15,21:20,22:20,23:15,24:15,25:15,26:15,27:15 });

  const BF = F_CALIBRI(10,true); const NF = F_CALIBRI(10,false);
  const invoiceDate = vins[0]?.outDate || '';

  // Header empresa CFMOTO Mexico
  ws.mergeCells('A2:V2'); sc(ws,2,1,CF.SHIPPER, { font: F_CALIBRI(12,true), align: AL_CC, border: topMedium() });
  ws.mergeCells('A3:V3'); sc(ws,3,1,CF.SHIPPER_FULL, { font: NF, align: AL_CC });
  ws.mergeCells('A6:V6'); sc(ws,6,1,'INVOICE', { font: F_CALIBRI(16,true), align: AL_CC });

  // Consignee + Invoice No
  ws.mergeCells('B7:T7'); sc(ws,7,2,`${CF.CONSIGNEE}\n${CF.CONSIGNEE_ADDR}`, { font: BF, align: AL_LW });
  sc(ws,7,21,invoiceNo,  { font: BF, border: allThin() });
  sc(ws,8,1,'TO:',       { font: BF }); sc(ws,8,13,'INV NO.:',{ font: BF });
  sc(ws,10,21,invoiceDate,{ font: NF, border: allThin() }); sc(ws,11,13,'Date:',{ font: BF });

  // Route
  sc(ws,13,3,CF.FROM_PORT,{ font: NF, border: allThin() });
  sc(ws,13,8,CF.VIA,      { font: NF, border: allThin() });
  sc(ws,13,17,CF.TO_PORT, { font: NF, border: allThin() });
  sc(ws,14,1,'From:',     { font: BF }); sc(ws,14,5,'Via',{ font: BF }); sc(ws,14,14,'To:',{ font: BF });
  sc(ws,16,1,'L/C No.', { font: NF }); sc(ws,16,14,'Drawn Under',{ font: NF });

  // Table headers
  ws.mergeCells('D20:J20'); sc(ws,20,4,'DESCRIPTIONS',  { font: BF, border: allThin(), align: AL_CC });
  sc(ws,20,11,'QUANTITY', { font: BF, border: allThin(), align: AL_CC });
  sc(ws,20,16,'UNIT PRICE',{ font: BF, border: allThin(), align: AL_CC });
  sc(ws,20,22,'AMOUNT',   { font: BF, border: allThin(), align: AL_CC });
  sc(ws,21,1,'Marks & Numbers', { font: BF });
  sc(ws,22,22,`${CF.INCOTERM}  ${CF.FROM_PORT}`, { font: NF, border: allThin(), align: AL_CC });

  // Data rows per model
  const modelGroups = groupBy(vins, 'modelo');
  let dr = 23; let grandTotal = 0;
  Object.entries(modelGroups).forEach(([modelo,mvins]: [string, any]) => {
    const s       = mvins[0];
    const qty     = mvins.length;
    const unitVal = Number(s?.valorUsd || 0);
    const valAcero= Number(s?.valAcero || 0);
    const nonSteel= valAcero > 0 ? (unitVal - valAcero) : 0;
    const total   = qty * unitVal; grandTotal += total;
    const year    = s?.outDate ? new Date(s.outDate).getFullYear() : '';

    ws.mergeCells(`A${dr}:C${dr}`);
    sc(ws,dr,1,`Country of origin Mexico    REF. RULING ${CF.RULING}`, { font: NF, border: allThin(), align: AL_LW });
    ws.mergeCells(`D${dr}:J${dr}`);
    sc(ws,dr,4,`${modelo}                       MODEL ${year}`, { font: BF, border: allThin() });
    sc(ws,dr,11,qty,      { font: NF, border: allThin(), align: AL_CC });
    sc(ws,dr,15,'UNIT',  { font: NF, border: allThin() });
    sc(ws,dr,16,'USD',   { font: NF, border: allThin() });
    sc(ws,dr,18,unitVal, { font: NF, border: allThin(), align: AL_RC });
    sc(ws,dr,22,total,   { font: NF, border: allThin(), align: AL_RC });
    dr++;

    if (valAcero > 0) {
      ws.mergeCells(`A${dr}:C${dr}`);
      sc(ws,dr,1,'Steel Country of Melt/Pour: China', { font: NF, border: allThin() });
      ws.mergeCells(`D${dr}:J${dr}`);
      sc(ws,dr,4,'Non-Steel Content',{ font: NF, border: allThin() });
      sc(ws,dr,16,'USD',   { font: NF, border: allThin() });
      sc(ws,dr,18,nonSteel,{ font: NF, border: allThin(), align: AL_RC });
      sc(ws,dr,22,qty*nonSteel,{ font: NF, border: allThin(), align: AL_RC }); dr++;
      ws.mergeCells(`D${dr}:J${dr}`);
      sc(ws,dr,4,'Steel Content',{ font: NF, border: allThin() });
      sc(ws,dr,16,'USD',    { font: NF, border: allThin() });
      sc(ws,dr,18,valAcero, { font: NF, border: allThin(), align: AL_RC });
      sc(ws,dr,22,qty*valAcero,{ font: NF, border: allThin(), align: AL_RC }); dr++;
    }
  });

  ws.mergeCells(`A${dr}:C${dr}`); sc(ws,dr,1,'TOTAL:', { font: BF, border: allThin() });
  sc(ws,dr,11,'USD',{ font: BF, border: allThin() });
  sc(ws,dr,22,grandTotal, { font: BF, border: allThin(), align: AL_RC }); dr++;
  ws.mergeCells(`A${dr}:C${dr}`); sc(ws,dr,1,'SAY TOTAL ：',{ font: BF });
  ws.mergeCells(`D${dr}:V${dr}`); sc(ws,dr,4,amountToWords(grandTotal), { font: BF, align: AL_LW });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 7. PL-with CFM title to CFP — Calibri bold, merges complejos, 14 cols A-N
// ════════════════════════════════════════════════════════════════════════════
export async function generatePlCfpXLSX(vins: any[], invoiceNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('PL-with CFM title to CFP');
  applyPageSetup(ws, PAGE.PL_CFP);

  setCols(ws, { 0:0.2,1:0.5,2:22,3:9.8,4:2,5:14.3,6:6.5,7:5.8,8:3.5,9:3.8,10:5.5,11:9.5,12:9.5,13:17,14:8.8 });
  setRows(ws, { 0:39,1:26.15,2:36.75,3:16,4:21,5:42,6:35.15,7:24.65,8:24.65,9:26.15,10:22.5,11:37.4,12:40.5,13:23.5,14:23.5 });

  const BF = F_CALIBRI(10,true); const NF = F_CALIBRI(10,false);
  const invoiceDate = vins[0]?.outDate || '';

  // Header
  ws.mergeCells('E1:N1'); sc(ws,1,5,CF.SHIPPER, { font: F_CALIBRI(12,true), align: AL_CC });
  ws.mergeCells('C2:N2'); sc(ws,2,3,CF.SHIPPER, { font: BF, align: AL_CC, border: allThin() });
  ws.mergeCells('A3:N3'); sc(ws,3,1,`CALLE TECNOLOGIA NO. 107, COL. VYNMSA APODACA INDUSTRIAL PARK, NUEVO LEÓN C.P. 66628  RFC: ${CF.SHIPPER_RFC}`, { font: NF, align: AL_CC });
  ws.mergeCells('C4:N4'); sc(ws,4,3,' ', { font: NF });
  ws.mergeCells('C6:N6'); sc(ws,6,3,'PACKING LIST', { font: F_CALIBRI(14,true), align: AL_CC, border: allThin() });

  // TO / Invoice info
  ws.mergeCells('C7:I7'); sc(ws,7,3,`TO:${CF.CONSIGNEE}\n${CF.CONSIGNEE_ADDR}`, { font: BF, align: AL_LW, border: allThin() });
  ws.mergeCells('M7:N7'); sc(ws,7,13,invoiceNo, { font: NF, border: allThin() });
  ws.mergeCells('J7:L7'); sc(ws,7,10,'INV  NO.:', { font: BF, border: allThin() });
  ws.mergeCells('J8:L8'); sc(ws,8,10,'DATE:', { font: BF, border: allThin() });
  ws.mergeCells('M8:N8'); sc(ws,8,13,invoiceDate, { font: NF, border: allThin() });

  // SHIPPED FROM/TO
  ws.mergeCells('C9:E9'); sc(ws,9,3,'SHIPPED FROM:', { font: BF, border: allThin() });
  ws.mergeCells('F9:I9'); sc(ws,9,6,CF.FROM_PORT, { font: NF, border: allThin() });
  ws.mergeCells('J9:L9'); sc(ws,9,10,'TO:', { font: BF, border: allThin() });
  ws.mergeCells('M9:N9'); sc(ws,9,13,CF.TO_PORT, { font: NF, border: allThin() });
  ws.mergeCells('J10:L10');sc(ws,10,10,'VIA:', { font: BF, border: allThin() });
  ws.mergeCells('M10:N10');sc(ws,10,13,CF.VIA, { font: NF, border: allThin() });

  // ── Row 11: separador ── Row 12: headers EXACTOS del Excel ──
  ws.mergeCells('C11:N11'); ws.getRow(11).height = 6;
  // C12 = Marks&Nos. (standalone) | D12:F12 = Description | G12:K12 = Quantity | L12=G.W. | M12=N.W. | N12=MEAS
  sc(ws,12,3,'Marks\nNos.', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells('D12:F12'); sc(ws,12,4,'Description of Goods and Package', { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells('G12:K12'); sc(ws,12,7,'Quantity', { font: BF, border: allThin(), align: AL_CC });
  sc(ws,12,12,'G.W.\n(KGS)', { font: BF, border: allThin(), align: AL_CC });
  sc(ws,12,13,'N.W.\n(KGS)', { font: BF, border: allThin(), align: AL_CC });
  sc(ws,12,14,'MEAS (CBM)',  { font: BF, border: allThin(), align: AL_CC });

  // ── Data rows per model — merges exactos del Excel ──
  const modelGroups = groupBy(vins, 'modelo');
  let dr = 13;
  let gTotalBruto = 0; let gTotalNeto = 0; let gQty = 0;
  Object.entries(modelGroups).forEach(([modelo,mvins]: [string, any]) => {
    const s         = mvins[0];
    const qty       = mvins.length;
    const pesoAcero = Number(s?.pesoAcero || 0);
    const brutoSum  = mvins.reduce((a: number, v: any) => a + Number(v.pesoBruto||0), 0);
    const netoSum   = mvins.reduce((a: number, v: any) => a + Number(v.pesoNeto||0), 0);
    const steelW    = qty * pesoAcero;
    const nonSteelW = pesoAcero > 0 ? brutoSum - steelW : 0;
    const volTotal  = (Number(s?.volumen||0) * qty) || '';
    const year      = s?.outDate ? new Date(s.outDate).getFullYear() : '';
    gTotalBruto += brutoSum; gTotalNeto += netoSum; gQty += qty;

    // Data row: C13 standalone, D13:F13 merged (model), G13 qty, H13 CTNS, I13:J13 qty, K13 UNIT, L13 GW, M13 NW, N13 vol
    const countryText = `Country of origin Mexico                           REF.  RULING ${CF.RULING}`;
    sc(ws,dr,3,countryText, { font: { ...NF, color:{argb:'FFFF0000'} }, border: allThin(), align: AL_LW });
    ws.mergeCells(`D${dr}:F${dr}`);
    sc(ws,dr,4,`${modelo} MODEL ${year}`, { font: BF, border: allThin(), align: AL_CC });
    sc(ws,dr,7,qty,      { font: NF, border: allThin(), align: AL_CC });
    sc(ws,dr,8,'CTNS',   { font: NF, border: allThin(), align: AL_CC });
    ws.mergeCells(`I${dr}:J${dr}`);
    sc(ws,dr,9,qty,      { font: NF, border: allThin(), align: AL_CC });
    sc(ws,dr,11,'UNIT',  { font: NF, border: allThin(), align: AL_CC });
    sc(ws,dr,12,brutoSum,{ font: NF, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
    sc(ws,dr,13,netoSum, { font: NF, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
    if (volTotal) sc(ws,dr,14,volTotal, { font: NF, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
    dr++;

    if (pesoAcero > 0) {
      // Steel row 1 (non-steel) — C14:C15 merged vertically
      ws.mergeCells(`C${dr}:C${dr+1}`);
      sc(ws,dr,3,'Steel Country of Melt/Pour: China', { font: { ...NF, color:{argb:'FFFF0000'} }, border: allThin(), align: AL_CC });
      ws.mergeCells(`D${dr}:K${dr}`);
      sc(ws,dr,4,'Non-Steel Content', { font: BF, border: allThin(), align: AL_CC });
      sc(ws,dr,12,nonSteelW, { font: { ...NF, color:{argb:'FF0070C0'} }, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
      sc(ws,dr,13,nonSteelW, { font: { ...NF, color:{argb:'FF0070C0'} }, border: allThin(), align: AL_RC, numFmt:'#,##0.00' }); dr++;
      // Steel row 2 (steel content)
      ws.mergeCells(`D${dr}:K${dr}`);
      sc(ws,dr,4,'Steel Content', { font: BF, border: allThin(), align: AL_CC });
      sc(ws,dr,12,steelW, { font: { ...NF, color:{argb:'FF0070C0'} }, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
      sc(ws,dr,13,steelW, { font: { ...NF, color:{argb:'FF0070C0'} }, border: allThin(), align: AL_RC, numFmt:'#,##0.00' }); dr++;
    }
  });

  // TOTAL row — C16:F16, G16, H16=CTNS, I16:J16, K16=UNIT, L16=GW, M16=NW
  ws.mergeCells(`C${dr}:F${dr}`); sc(ws,dr,3,'TOTAL:', { font: BF, border: allThin() });
  sc(ws,dr,7,gQty,        { font: BF, border: allThin(), align: AL_CC });
  sc(ws,dr,8,'CTNS',      { font: BF, border: allThin(), align: AL_CC });
  ws.mergeCells(`I${dr}:J${dr}`);
  sc(ws,dr,9,gQty,        { font: BF, border: allThin(), align: AL_CC });
  sc(ws,dr,11,'UNIT',     { font: BF, border: allThin(), align: AL_CC });
  sc(ws,dr,12,gTotalBruto,{ font: BF, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });
  sc(ws,dr,13,gTotalNeto, { font: BF, border: allThin(), align: AL_RC, numFmt:'#,##0.00' });

  return wb;
}

// ════════════════════════════════════════════════════════════════════════════
// 8. LAY OUT CCP — Calibri bold, bordes medium en col B, 4 cols A-D
// ════════════════════════════════════════════════════════════════════════════
export async function generateCCPXLSX(vins: any[], invoiceNo: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CFMOTO Logistics';
  const ws = wb.addWorksheet('LAY OUT CCP');
  applyPageSetup(ws, PAGE.CCP);

  setCols(ws, { 0:22.8, 1:47.5, 2:1.7, 3:40.5 });

  const BF = F_CALIBRI(10,true); const NF = F_CALIBRI(10,false);
  const totalValUsd = vins.reduce((s: number, v: any) => s + Number(v.valorUsd || 0), 0);
  const totalBruto  = vins.reduce((s: number, v: any) => s + Number(v.pesoBruto || 0), 0);
  const invoiceDate = vins[0]?.outDate || '';
  const fraccion    = vins[0]?.taric || CF.FRACCION_DEF;
  const claveProd   = vins[0]?.claveProductoSat || CF.CLAVE_PROD;

  // ── helper: cell de categoría con fill de color ──
  const catFill = (label: string): ExcelJS.Fill => {
    if (label === 'REQUERIDO')          return RED_FILL;
    if (label === 'CONDICIONAL')        return ORANGE_FILL;
    if (label === 'EN CASO DE DEVOLUCIÓN') return YELLOW_FILL;
    return solidFill('FFD9D9D9');
  };
  const catFont = (label: string): Partial<ExcelJS.Font> => {
    const white = label === 'REQUERIDO' || label === 'CONDICIONAL';
    return { ...BF, color: white ? { argb:'FFFFFFFF' } : { argb:'FF000000' } };
  };

  function row(r: number, reqLabel: string, bLabel: string, val: any, dangerousField = false) {
    sc(ws,r,1,reqLabel, { font: catFont(reqLabel), fill: catFill(reqLabel), align: AL_CC, border: allThin() });
    const bFill = dangerousField ? RED_FILL : WHITE;
    sc(ws,r,2,bLabel, { font: BF, fill: bFill, border: allThin(), align: AL_LW });
    sc(ws,r,4,(val||''), { font: NF, border: allThin() });
  }

  const sectionHdr = (r: number, label: string, val: any) => {
    sc(ws,r,2,label, { font: { ...BF, color:{argb:'FFFFFFFF'} }, fill: NAVY_FILL, border: allThin(), align: AL_LC });
    sc(ws,r,4,val,   { font: NF, border: allThin() });
  };

  let r = 1;
  sc(ws,r,2,'LAYOUT ARCBETS', { font: F_CALIBRI(12,true) }); r+=3;
  sectionHdr(r,'DATOS ORIGEN', CF.SHIPPER); r++;
  row(r,'REQUERIDO','RFC REMITENTE',        CF.SHIPPER_RFC);  r++;
  row(r,'REQUERIDO','ESTADO',               CF.SHIPPER_STATE); r++;
  row(r,'REQUERIDO','PAIS',                 'MEXICO');         r++;
  row(r,'REQUERIDO','CODIGO POSTAL',        CF.SHIPPER_CP);    r++;
  row(r,'REQUERIDO','FECHA/HORA DE SALIDA', invoiceDate);      r++;
  r++;
  sectionHdr(r,'DATOS DESTINO', CF.CONSIGNEE); r++;
  row(r,'REQUERIDO','RFC DESTINATARIO',     CF.CONSIGNEE_TAX.replace('-','')); r++;
  row(r,'REQUERIDO','ESTADO',               CF.CONSIGNEE_ST); r++;
  row(r,'REQUERIDO','PAIS',                 'USA');            r++;
  row(r,'REQUERIDO','CODIGO POSTAL',        CF.CONSIGNEE_CP); r++;
  row(r,'REQUERIDO','FECHA/HORA DE SALIDA', '');               r++;
  row(r,'REQUERIDO','DISTANCIA RECORRIDA',  '');               r++;
  r++;
  sectionHdr(r,'MERCANCIAS', 1); r++;
  sc(ws,r,2,'Valor de la mercancia USD', { font: NF, border: allThin() });
  sc(ws,r,4,`$${totalValUsd.toLocaleString('en-US',{minimumFractionDigits:2})}`, { font: NF, border: allThin() }); r++;
  row(r,'REQUERIDO','Peso Bruto Total',                  totalBruto); r++;
  row(r,'REQUERIDO','Unidad de Peso',                    'kg');       r++;
  row(r,'REQUERIDO','Número total de Mercancías',         vins.length); r++;
  row(r,'EN CASO DE DEVOLUCIÓN','Logistica Inversa Recolección Devolución','no aplica'); r++;
  row(r,'REQUERIDO','Bienes Transportados (clave SAT)',  claveProd); r++;
  row(r,'REQUERIDO','Descripción bienes transportados (SAT)',CF.DESC_MERCH); r++;
  row(r,'REQUERIDO','Cantidad',                           vins.length); r++;
  row(r,'REQUERIDO','Clave de la Unidad (Clave SAT)',    'H87 PIEZA'); r++;
  row(r,'REQUERIDO','Peso en KG',                         totalBruto); r++;
  row(r,'CONDICIONAL','Material Peligroso',               'no aplica', true); r++;
  row(r,'CONDICIONAL','Clave Material Peligroso',         'no aplica', true); r++;
  row(r,'REQUERIDO','Tipo de Materia',                   '\'03'); r++;
  r++;
  sectionHdr(r,'DOCUMENTACIÓN ADUANERA',''); r++;
  row(r,'REQUERIDO','Fracción Arancelaria (Clave SAT)',  fraccion); r++;
  row(r,'CONDICIONAL','UUID del comprobante de comercio exterior (expo)',''); r++;
  row(r,'REQUERIDO','Tipo de documento',                 'PEDIMENTO'); r++;
  row(r,'CONDICIONAL','Numero de Pedimento',              ''); r++;
  row(r,'CONDICIONAL','RFC Importador',                   ''); r++;

  return wb;
}
