/**
 * exportDashboardPpt.ts
 * Genera un PowerPoint editable con los datos del Dashboard usando pptxgenjs.
 * Excluye: GID Accumulated Savings YTD y Operaciones asignadas a especialistas.
 */
import PptxGenJS from 'pptxgenjs';

// ─── Layout constants ──────────────────────────────────────────────────────
const SLIDE_W  = 13.33;
const SLIDE_H  = 7.5;
const HEADER_H = 0.62;
const CONTENT_Y = HEADER_H + 0.22;
const CONTENT_H = SLIDE_H - CONTENT_Y - 0.28;
const HALF_W   = (SLIDE_W - 0.9) / 2;  // for 2-column layouts

// ─── Brand colours (hex, no #) ────────────────────────────────────────────
const C_DARK   = '1e293b';
const C_MID    = '334155';
const C_GRAY   = '64748b';
const C_LGRAY  = 'e2e8f0';
const C_XLGRAY = 'f1f5f9';
const C_WHITE  = 'FFFFFF';

const PALETTE_IMPORT  = ['3b82f6','93c5fd','f59e0b'];
const PALETTE_IMPORT_VAL = ['1d4ed8','f59e0b'];
const PALETTE_EXPORT  = ['10b981'];
const PALETTE_CONT    = ['0ea5e9','14b8a6'];
const PALETTE_DUTIES  = ['ef4444','ea580c','fb923c','f59e0b','3b82f6','06b6d4','0ea5e9'];
const PALETTE_SPECIAL = ['8b5cf6','f43f5e','f97316','14b8a6','3b82f6'];
const PALETTE_REV_BAR = ['3b82f6'];
const PALETTE_REV_LINE= ['f43f5e'];

// ─── KPI colour per card ──────────────────────────────────────────────────
const KPI_COLORS = ['3b82f6','6366f1','8b5cf6','10b981','0ea5e9','14b8a6','06b6d4','7c3aed'];

export interface PptExportParams {
  t: (key: string) => string;
  rangeLabel: string;
  hasLiveData: boolean;
  // KPIs
  totalImport: number;
  totalExport: number;
  totalImportUSD: string;
  totalExportUSD: string;
  totalImportContainers: number;
  totalExportContainers: number;
  totalImportInvoices: number;
  totalExportInvoices: number;
  // Charts
  containerVolumeData: any[];
  importVolumeData: any[];
  exportVolumeData: any[];
  importValueData: any[];
  exportValueData: any[];
  dutiesData: any[];
  specialOpsData: any[];
  revisionsData: any[];
  hasLiveSpecial: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
/** Shared axis / legend defaults */
const CHART_BASE = {
  catAxisLabelColor:    C_GRAY,
  catAxisLabelFontSize: 7,
  catAxisLabelRotate:   -45,
  valAxisLabelColor:    C_GRAY,
  valAxisLabelFontSize: 8,
  showLegend:   true,
  legendPos:    'b' as const,
  legendFontSize: 8,
  showTitle: false,
  plotAreaFillColor:   C_WHITE,
  plotAreaBorderColor: C_LGRAY,
};

/** Convert Recharts row array → pptxgenjs series array */
function toSeries(
  rows: any[],
  keys: string[],
  names: string[],
  divisor = 1,
): { name: string; labels: string[]; values: number[] }[] {
  const labels = rows.map(r => String(r.name));
  return keys.map((key, i) => ({
    name: names[i] ?? key,
    labels,
    values: rows.map(r => {
      const v = ((r[key] as number) || 0) / divisor;
      return parseFloat(v.toFixed(2));
    }),
  }));
}

/** Add a dark header band with title + right-aligned subtitle */
function addHeader(slide: PptxGenJS.Slide, title: string, sub = '') {
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
    fill: { color: C_DARK },
    line: { color: C_DARK, width: 0 },
  });
  slide.addText(title, {
    x: 0.28, y: 0, w: SLIDE_W - (sub ? 3.4 : 0.6), h: HEADER_H,
    fontSize: 15, bold: true, color: C_WHITE, valign: 'middle',
  });
  if (sub) {
    slide.addText(sub, {
      x: SLIDE_W - 3.2, y: 0, w: 3.0, h: HEADER_H,
      fontSize: 7.5, color: '94a3b8', align: 'right', valign: 'middle',
    });
  }
}

/** Add a full-width section label row below header */
function addSectionLabel(slide: PptxGenJS.Slide, text: string, y: number) {
  slide.addText(text, {
    x: 0.28, y, w: SLIDE_W - 0.56, h: 0.22,
    fontSize: 7.5, bold: true, color: C_GRAY, charSpacing: 1.5,
  });
}

// ─── Main export function ─────────────────────────────────────────────────
export async function exportDashboardPpt(params: PptExportParams): Promise<void> {
  const { t, rangeLabel, hasLiveData } = params;
  const prs = new PptxGenJS();

  prs.layout  = 'LAYOUT_WIDE';
  prs.title   = t('dash.title');
  prs.subject = `${t('dash.title')} · ${rangeLabel}`;
  prs.author  = 'LogiMaster — CFMoto';
  prs.company = 'CFMoto Compliance';

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 1 — KPI Summary
  // ══════════════════════════════════════════════════════════════════════
  const s1 = prs.addSlide();
  addHeader(s1, t('dash.title'), rangeLabel);
  addSectionLabel(s1, t('dash.sec_ytd').toUpperCase(), HEADER_H + 0.1);

  const kpis = [
    { label: t('dash.imp_ped'),  value: params.totalImport.toLocaleString(),            sub: t('dash.ytd_sub') },
    { label: t('dash.exp_ped'),  value: params.totalExport.toLocaleString(),            sub: 'RT · F1 · F2 · H1' },
    { label: t('dash.imp_val'),  value: `$${params.totalImportUSD}M USD`,               sub: t('dash.usd_acc') },
    { label: t('dash.exp_val'),  value: `$${params.totalExportUSD}M USD`,               sub: t('dash.usd_acc') },
    { label: t('dash.cont_imp'), value: params.totalImportContainers.toLocaleString(), sub: t('dash.cont_imp_sub') },
    { label: t('dash.cont_exp'), value: params.totalExportContainers.toLocaleString(), sub: t('dash.cont_exp_sub') },
    { label: t('dash.fact_imp'), value: params.totalImportInvoices.toLocaleString(),    sub: t('dash.fact_imp_sub') },
    { label: t('dash.fact_exp'), value: params.totalExportInvoices.toLocaleString(),    sub: t('dash.fact_exp_sub') },
  ];

  const cardW = (SLIDE_W - 0.56 - 0.21 * 3) / 4;
  const cardH = 2.45;
  const rowY  = [HEADER_H + 0.38, HEADER_H + 0.38 + cardH + 0.18];

  kpis.forEach((kpi, idx) => {
    const col  = idx % 4;
    const row  = Math.floor(idx / 4);
    const x    = 0.28 + col * (cardW + 0.21);
    const y    = rowY[row];
    const hex  = KPI_COLORS[idx];

    // Card shadow-effect: slightly offset grey rect
    s1.addShape('roundRect' as any, {
      x: x + 0.04, y: y + 0.04, w: cardW, h: cardH,
      fill: { color: 'dde3ee' }, line: { color: 'dde3ee', width: 0 },
      rectRadius: 0.1,
    });
    // Card body
    s1.addShape('roundRect' as any, {
      x, y, w: cardW, h: cardH,
      fill: { color: C_WHITE },
      line: { color: C_LGRAY, width: 0.6 },
      rectRadius: 0.1,
    });
    // Colour accent top strip
    s1.addShape('rect' as any, {
      x: x + 0.01, y, w: cardW - 0.02, h: 0.07,
      fill: { color: hex }, line: { color: hex, width: 0 },
    });
    // Label
    s1.addText(kpi.label, {
      x: x + 0.13, y: y + 0.14, w: cardW - 0.26, h: 0.32,
      fontSize: 7, bold: true, color: C_GRAY, charSpacing: 0.8,
    });
    // Big value
    s1.addText(kpi.value, {
      x: x + 0.1, y: y + 0.46, w: cardW - 0.2, h: 1.12,
      fontSize: 28, bold: true, color: hex,
      shrinkText: true, valign: 'middle',
    });
    // Sub label
    s1.addText(kpi.sub, {
      x: x + 0.1, y: y + cardH - 0.36, w: cardW - 0.2, h: 0.28,
      fontSize: 7, color: '94a3b8', italic: true,
    });
  });

  if (!hasLiveData) {
    s1.addText(t('dash.no_data_warn'), {
      x: 0.28, y: SLIDE_H - 0.34, w: SLIDE_W - 0.56, h: 0.26,
      fontSize: 7, color: 'f59e0b', italic: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 2 — Contenedores por Mes
  // ══════════════════════════════════════════════════════════════════════
  const s2 = prs.addSlide();
  addHeader(s2,
    t('dash.chart_cont_mes'),
    `DataStage 504×501 · ${params.containerVolumeData.length} ${t('dash.meses')} · ${t('dash.antiguo_izq')}`
  );

  const contSeries = toSeries(params.containerVolumeData, ['Imp.','Exp.'], [t('dash.imp'), t('dash.exp')]);
  s2.addChart('bar' as any, contSeries, {
    ...CHART_BASE,
    x: 0.28, y: CONTENT_Y, w: SLIDE_W - 0.56, h: CONTENT_H,
    barDir: 'col',
    barGrouping: 'clustered',
    chartColors: PALETTE_CONT,
    dataLabelFontSize: 7,
    showValue: false,
  });

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 3 — Import: Volume + Value
  // ══════════════════════════════════════════════════════════════════════
  const s3 = prs.addSlide();
  addHeader(s3, t('dash.sec_import'), rangeLabel);

  const ivSeries = toSeries(params.importVolumeData, ['IN','A1','AF'],
    [t('dash.bar_in'), t('dash.bar_a1'), t('dash.bar_af')]);
  s3.addChart('bar' as any, ivSeries, {
    ...CHART_BASE,
    x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
    barDir: 'col', barGrouping: 'stacked',
    chartColors: PALETTE_IMPORT,
    title: t('dash.chart_imp_vol'), showTitle: true, titleFontSize: 10, titleColor: C_MID,
  });

  const ivalSeries = toSeries(params.importValueData,
    ['Mat. Prima + Indir.','Activo Fijo'],
    [t('dash.bar_mat_prima'), t('dash.bar_activo_fijo')]);
  s3.addChart('bar' as any, ivalSeries, {
    ...CHART_BASE,
    x: 0.28 + HALF_W + 0.34, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
    barDir: 'col', barGrouping: 'stacked',
    chartColors: PALETTE_IMPORT_VAL,
    title: `${t('dash.chart_imp_val')} (M USD)`, showTitle: true, titleFontSize: 10, titleColor: C_MID,
    valAxisNumFmt: '0.000"M"',
  });

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 4 — Export: Volume + Value
  // ══════════════════════════════════════════════════════════════════════
  const s4 = prs.addSlide();
  addHeader(s4, t('dash.sec_export'), rangeLabel);

  const evSeries = toSeries(params.exportVolumeData, ['RT'], [t('dash.bar_rt')]);
  s4.addChart('bar' as any, evSeries, {
    ...CHART_BASE,
    x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
    barDir: 'col', barGrouping: 'clustered',
    chartColors: PALETTE_EXPORT,
    title: t('dash.chart_exp_vol'), showTitle: true, titleFontSize: 10, titleColor: C_MID,
  });

  const evalSeries = toSeries(params.exportValueData, ['Valor (M USD)'], [t('dash.bar_valor_exp')]);
  s4.addChart('bar' as any, evalSeries, {
    ...CHART_BASE,
    x: 0.28 + HALF_W + 0.34, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
    barDir: 'col', barGrouping: 'clustered',
    chartColors: PALETTE_EXPORT,
    title: `${t('dash.chart_exp_val')} (M USD)`, showTitle: true, titleFontSize: 10, titleColor: C_MID,
    valAxisNumFmt: '0.000"M"',
  });

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 5 — Contribuciones Pagadas (Taxes Paid) — M MXN
  // ══════════════════════════════════════════════════════════════════════
  if (params.dutiesData.length > 0) {
    const s5 = prs.addSlide();
    addHeader(s5, t('dash.chart_contrib'), t('dash.chart_contrib_sub_live'));

    const dutKeys  = ['IGI Import','IVA Import Efectivo','IVA Import Fianza','DTA Import','IGI Export','IVA Export','DTA Export'];
    const dutNames = [t('dash.bar_igi_imp'), t('dash.bar_iva_imp_ef'), t('dash.bar_iva_imp_fz'),
                      t('dash.bar_dta_imp'), t('dash.bar_igi_exp'), t('dash.bar_iva_exp'), t('dash.bar_dta_exp')];
    const dutSeries = toSeries(params.dutiesData, dutKeys, dutNames, 1e6);

    s5.addChart('bar' as any, dutSeries, {
      ...CHART_BASE,
      x: 0.28, y: CONTENT_Y, w: SLIDE_W - 0.56, h: CONTENT_H,
      barDir: 'col', barGrouping: 'clustered',
      chartColors: PALETTE_DUTIES,
      valAxisNumFmt: '0.00"M"',
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 6 — Operaciones Especiales + Revisiones Aduanales
  // ══════════════════════════════════════════════════════════════════════
  const s6 = prs.addSlide();
  addHeader(s6, t('dash.sec_special'), rangeLabel);

  const SPECIAL_CLAVES = ['A3','A4','F4','F5','V3'];
  if (params.specialOpsData.length > 0 && params.hasLiveSpecial) {
    const spSeries = toSeries(params.specialOpsData, SPECIAL_CLAVES, SPECIAL_CLAVES);
    s6.addChart('bar' as any, spSeries, {
      ...CHART_BASE,
      x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
      barDir: 'col', barGrouping: 'stacked',
      chartColors: PALETTE_SPECIAL,
      title: t('dash.chart_special'), showTitle: true, titleFontSize: 10, titleColor: C_MID,
    });
  }

  if (params.revisionsData.length > 0) {
    const revBarSeries  = toSeries(params.revisionsData, ['Import'], [t('dash.rev_import')]);
    const revLineSeries = toSeries(params.revisionsData, ['Export'], [t('dash.rev_export')]);

    const revXOffset = params.specialOpsData.length > 0 && params.hasLiveSpecial
      ? 0.28 + HALF_W + 0.34
      : 0.28;
    const revWidth   = params.specialOpsData.length > 0 && params.hasLiveSpecial
      ? HALF_W
      : SLIDE_W - 0.56;

    s6.addChart(
      [
        { type: 'bar'  as any, data: revBarSeries,  options: { chartColors: PALETTE_REV_BAR,  barGrouping: 'clustered' } },
        { type: 'line' as any, data: revLineSeries, options: { chartColors: PALETTE_REV_LINE } },
      ],
      {
        ...CHART_BASE,
        x: revXOffset, y: CONTENT_Y, w: revWidth, h: CONTENT_H,
        title: t('dash.chart_rev'), showTitle: true, titleFontSize: 10, titleColor: C_MID,
      } as any
    );
  }

  // ─── Save file ──────────────────────────────────────────────────────
  const dateStr = new Date().toISOString().slice(0, 10);
  await prs.writeFile({ fileName: `Dashboard_CFMoto_${dateStr}.pptx` });
}
