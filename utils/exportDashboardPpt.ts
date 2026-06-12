/**
 * exportDashboardPpt.ts
 * Genera un PowerPoint editable con KPIs + desglose por clave + gráficas nativas.
 * Excluye: GID Accumulated Savings YTD y Operaciones asignadas a especialistas.
 */
import PptxGenJS from 'pptxgenjs';

// ─── Layout constants ──────────────────────────────────────────────────────
const SLIDE_W  = 13.33;
const SLIDE_H  = 7.5;
const HEADER_H = 0.62;
const CONTENT_Y = HEADER_H + 0.22;
const CONTENT_H = SLIDE_H - CONTENT_Y - 0.28;
const HALF_W   = (SLIDE_W - 0.9) / 2;

const GAP       = 0.18;  // gap between cards
const CARD_COLS = 4;
const CARD_W    = (SLIDE_W - 0.56 - GAP * (CARD_COLS - 1)) / CARD_COLS;  // ~3.09"
// Two rows of cards that fill the slide
const CARD_ROWS_Y = [HEADER_H + 0.32, 0];  // row[1] computed below
const CARD_H    = (SLIDE_H - HEADER_H - 0.32 - GAP - 0.18) / 2;         // ~2.94"
CARD_ROWS_Y[1]  = CARD_ROWS_Y[0] + CARD_H + GAP;

// Inside the card
const TITLE_REL_Y  = 0.10;   // relative to card top
const VALUE_REL_Y  = 0.36;
const VALUE_H      = 0.76;
const SUB_REL_Y    = VALUE_REL_Y + VALUE_H + 0.04;
const SUB_H        = 0.20;
const DIV_REL_Y    = SUB_REL_Y + SUB_H + 0.08;
const BRKDN_START  = DIV_REL_Y + 0.06;
const BRKDN_ROW_H  = 0.265;
const BRKDN_MAX    = 6;

// ─── Brand colours (hex, no #) ─────────────────────────────────────────────
const C_DARK   = '1e293b';
const C_MID    = '334155';
const C_GRAY   = '64748b';
const C_LGRAY  = 'e2e8f0';
const C_XLGRAY = 'f1f5f9';
const C_WHITE  = 'FFFFFF';
const C_MUTED  = '94a3b8';
const C_BRKDN  = '0f172a';   // row clave text

const PALETTE_IMPORT     = ['3b82f6','93c5fd','f59e0b'];
const PALETTE_IMPORT_VAL = ['1d4ed8','f59e0b'];
const PALETTE_EXPORT     = ['10b981'];
const PALETTE_CONT       = ['0ea5e9','14b8a6'];
const PALETTE_DUTIES     = ['ef4444','ea580c','fb923c','f59e0b','3b82f6','06b6d4','0ea5e9'];
const PALETTE_SPECIAL    = ['8b5cf6','f43f5e','f97316','14b8a6','3b82f6'];
const PALETTE_REV_BAR    = ['3b82f6'];
const PALETTE_REV_LINE   = ['f43f5e'];

const KPI_COLORS = ['3b82f6','6366f1','8b5cf6','10b981','0ea5e9','14b8a6','06b6d4','7c3aed'];

// ─── Types ─────────────────────────────────────────────────────────────────
interface ClaveCount  { clave: string; count: number }
interface ClaveUsd    { clave: string; count: number; usd: number }

export interface PptExportParams {
  t: (key: string) => string;
  rangeLabel: string;
  hasLiveData: boolean;
  // KPI totals
  totalImport: number;
  totalExport: number;
  totalImportUSD: string;
  totalExportUSD: string;
  totalImportContainers: number;
  totalExportContainers: number;
  totalImportInvoices: number;
  totalExportInvoices: number;
  // Breakdowns per clave
  importByKey:          ClaveUsd[];
  exportByKey:          ClaveUsd[];
  importValueByKey:     ClaveUsd[];
  exportValueByKey:     ClaveUsd[];
  importContainersByKey: ClaveCount[];
  exportContainersByKey: ClaveCount[];
  importInvoicesByKey:  ClaveCount[];
  exportInvoicesByKey:  ClaveCount[];
  // Chart data arrays
  containerVolumeData: any[];
  importVolumeData:    any[];
  exportVolumeData:    any[];
  importValueData:     any[];
  exportValueData:     any[];
  dutiesData:          any[];
  specialOpsData:      any[];
  revisionsData:       any[];
  hasLiveSpecial: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const CHART_BASE = {
  catAxisLabelColor:    C_GRAY,
  catAxisLabelFontSize: 7,
  catAxisLabelRotate:   -45,
  valAxisLabelColor:    C_GRAY,
  valAxisLabelFontSize: 8,
  showLegend:    true,
  legendPos:     'b' as const,
  legendFontSize: 8,
  showTitle:  false,
  plotAreaFillColor:   C_WHITE,
  plotAreaBorderColor: C_LGRAY,
};

function toSeries(
  rows: any[], keys: string[], names: string[], divisor = 1,
): { name: string; labels: string[]; values: number[] }[] {
  const labels = rows.map(r => String(r.name));
  return keys.map((key, i) => ({
    name: names[i] ?? key,
    labels,
    values: rows.map(r => parseFloat(((Number(r[key]) || 0) / divisor).toFixed(2))),
  }));
}

function addHeader(slide: PptxGenJS.Slide, title: string, sub = '') {
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
    fill: { color: C_DARK }, line: { color: C_DARK, width: 0 },
  });
  slide.addText(title, {
    x: 0.28, y: 0, w: SLIDE_W - (sub ? 3.6 : 0.56), h: HEADER_H,
    fontSize: 15, bold: true, color: C_WHITE, valign: 'middle',
  });
  if (sub) {
    slide.addText(sub, {
      x: SLIDE_W - 3.4, y: 0, w: 3.2, h: HEADER_H,
      fontSize: 7.5, color: C_MUTED, align: 'right', valign: 'middle',
    });
  }
}

/** Render one KPI card with breakdown rows */
function addKpiCard(
  slide:    PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  hex:      string,
  label:    string,
  value:    string,
  sub:      string,
  breakdown: { clave: string; display: string }[],
) {
  // Shadow
  slide.addShape('roundRect' as any, {
    x: x + 0.04, y: y + 0.04, w, h,
    fill: { color: 'dde3ee' }, line: { color: 'dde3ee', width: 0 }, rectRadius: 0.1,
  });
  // Card body
  slide.addShape('roundRect' as any, {
    x, y, w, h,
    fill: { color: C_WHITE }, line: { color: C_LGRAY, width: 0.6 }, rectRadius: 0.1,
  });
  // Colour accent strip
  slide.addShape('rect' as any, {
    x: x + 0.01, y, w: w - 0.02, h: 0.07,
    fill: { color: hex }, line: { color: hex, width: 0 },
  });
  // Title
  slide.addText(label, {
    x: x + 0.13, y: y + TITLE_REL_Y, w: w - 0.26, h: 0.26,
    fontSize: 7, bold: true, color: C_GRAY, charSpacing: 0.6,
  });
  // Big value
  slide.addText(value, {
    x: x + 0.10, y: y + VALUE_REL_Y, w: w - 0.20, h: VALUE_H,
    fontSize: 24, bold: true, color: hex, shrinkText: true, valign: 'middle',
  });
  // Sub label
  slide.addText(sub, {
    x: x + 0.10, y: y + SUB_REL_Y, w: w - 0.20, h: SUB_H,
    fontSize: 6.5, color: C_MUTED, italic: true,
  });
  // Divider line
  slide.addShape('line' as any, {
    x: x + 0.10, y: y + DIV_REL_Y, w: w - 0.20, h: 0,
    line: { color: C_LGRAY, width: 0.6 },
  });
  // Breakdown rows
  const rows = breakdown.slice(0, BRKDN_MAX);
  rows.forEach((row, idx) => {
    const ry = y + BRKDN_START + idx * BRKDN_ROW_H;
    if (ry + BRKDN_ROW_H > y + h - 0.06) return; // clip
    // Clave chip (small coloured label)
    slide.addShape('roundRect' as any, {
      x: x + 0.10, y: ry + 0.035, w: 0.38, h: 0.195,
      fill: { color: C_XLGRAY }, line: { color: C_LGRAY, width: 0.5 }, rectRadius: 0.04,
    });
    slide.addText(row.clave, {
      x: x + 0.10, y: ry + 0.035, w: 0.38, h: 0.195,
      fontSize: 6.5, bold: true, color: hex, align: 'center', valign: 'middle',
    });
    // Count + unit (right-aligned)
    slide.addText(row.display, {
      x: x + 0.52, y: ry, w: w - 0.64, h: 0.265,
      fontSize: 7, color: C_BRKDN, align: 'right', valign: 'middle',
    });
    // Thin separator between rows (skip last)
    if (idx < rows.length - 1) {
      slide.addShape('line' as any, {
        x: x + 0.10, y: ry + BRKDN_ROW_H - 0.01, w: w - 0.20, h: 0,
        line: { color: C_LGRAY, width: 0.3, dashType: 'dash' },
      });
    }
  });
}

// ─── Main export ───────────────────────────────────────────────────────────
export async function exportDashboardPpt(params: PptExportParams): Promise<void> {
  const { t, rangeLabel, hasLiveData } = params;
  const prs = new PptxGenJS();
  prs.layout  = 'LAYOUT_WIDE';
  prs.title   = t('dash.title');
  prs.subject = `${t('dash.title')} · ${rangeLabel}`;
  prs.author  = 'LogiMaster — CFMoto';
  prs.company = 'CFMoto Compliance';

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 1 — KPI Summary with breakdown
  // ══════════════════════════════════════════════════════════════════════
  const s1 = prs.addSlide();
  addHeader(s1, t('dash.title'), rangeLabel);

  // Section label
  s1.addText(t('dash.sec_ytd').toUpperCase(), {
    x: 0.28, y: HEADER_H + 0.10, w: SLIDE_W - 0.56, h: 0.20,
    fontSize: 7.5, bold: true, color: C_GRAY, charSpacing: 1.5,
  });

  // Build breakdown display strings
  const fmtCount = (count: number, unit: string) =>
    `${count.toLocaleString()} ${unit}`;
  const fmtUSD   = (usd: number) =>
    `$${(usd / 1e6).toFixed(2)}M`;

  const cardDefs = [
    {
      label: t('dash.imp_ped'),
      value: params.totalImport.toLocaleString(),
      sub:   t('dash.ytd_sub'),
      breakdown: params.importByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, 'ped.') })),
    },
    {
      label: t('dash.exp_ped'),
      value: params.totalExport.toLocaleString(),
      sub:   'RT · F1 · F2 · H1',
      breakdown: params.exportByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, 'ped.') })),
    },
    {
      label: t('dash.imp_val'),
      value: `$${params.totalImportUSD}M USD`,
      sub:   t('dash.usd_acc'),
      breakdown: params.importValueByKey.map(b => ({ clave: b.clave, display: fmtUSD(b.usd) })),
    },
    {
      label: t('dash.exp_val'),
      value: `$${params.totalExportUSD}M USD`,
      sub:   t('dash.usd_acc'),
      breakdown: params.exportValueByKey.map(b => ({ clave: b.clave, display: fmtUSD(b.usd) })),
    },
    {
      label: t('dash.cont_imp'),
      value: params.totalImportContainers.toLocaleString(),
      sub:   t('dash.cont_imp_sub'),
      breakdown: params.importContainersByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, t('dash.unit_cont')) })),
    },
    {
      label: t('dash.cont_exp'),
      value: params.totalExportContainers.toLocaleString(),
      sub:   t('dash.cont_exp_sub'),
      breakdown: params.exportContainersByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, t('dash.unit_cont')) })),
    },
    {
      label: t('dash.fact_imp'),
      value: params.totalImportInvoices.toLocaleString(),
      sub:   t('dash.fact_imp_sub'),
      breakdown: params.importInvoicesByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, t('dash.unit_fact')) })),
    },
    {
      label: t('dash.fact_exp'),
      value: params.totalExportInvoices.toLocaleString(),
      sub:   t('dash.fact_exp_sub'),
      breakdown: params.exportInvoicesByKey.map(b => ({ clave: b.clave, display: fmtCount(b.count, t('dash.unit_fact')) })),
    },
  ];

  cardDefs.forEach((card, idx) => {
    const col = idx % CARD_COLS;
    const row = Math.floor(idx / CARD_COLS);
    const x   = 0.28 + col * (CARD_W + GAP);
    const y   = CARD_ROWS_Y[row];
    addKpiCard(s1, x, y, CARD_W, CARD_H, KPI_COLORS[idx], card.label, card.value, card.sub, card.breakdown);
  });

  if (!hasLiveData) {
    s1.addText(t('dash.no_data_warn'), {
      x: 0.28, y: SLIDE_H - 0.32, w: SLIDE_W - 0.56, h: 0.24,
      fontSize: 7, color: 'f59e0b', italic: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 2 — Contenedores por Mes
  // ══════════════════════════════════════════════════════════════════════
  if (params.containerVolumeData.length > 0) {
    const s2 = prs.addSlide();
    addHeader(s2,
      t('dash.chart_cont_mes'),
      `DataStage 504×501 · ${params.containerVolumeData.length} ${t('dash.meses')} · ${t('dash.antiguo_izq')}`
    );
    s2.addChart('bar' as any,
      toSeries(params.containerVolumeData, ['Imp.','Exp.'], [t('dash.imp'), t('dash.exp')]),
      { ...CHART_BASE, x: 0.28, y: CONTENT_Y, w: SLIDE_W - 0.56, h: CONTENT_H,
        barDir: 'col', barGrouping: 'clustered', chartColors: PALETTE_CONT }
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 3 — Import: Volume + Value
  // ══════════════════════════════════════════════════════════════════════
  const s3 = prs.addSlide();
  addHeader(s3, t('dash.sec_import'), rangeLabel);

  s3.addChart('bar' as any,
    toSeries(params.importVolumeData, ['IN','A1','AF'],
      [t('dash.bar_in'), t('dash.bar_a1'), t('dash.bar_af')]),
    { ...CHART_BASE, x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
      barDir: 'col', barGrouping: 'stacked', chartColors: PALETTE_IMPORT,
      title: t('dash.chart_imp_vol'), showTitle: true, titleFontSize: 10, titleColor: C_MID }
  );
  s3.addChart('bar' as any,
    toSeries(params.importValueData, ['Mat. Prima + Indir.','Activo Fijo'],
      [t('dash.bar_mat_prima'), t('dash.bar_activo_fijo')]),
    { ...CHART_BASE, x: 0.28 + HALF_W + 0.34, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
      barDir: 'col', barGrouping: 'stacked', chartColors: PALETTE_IMPORT_VAL,
      title: `${t('dash.chart_imp_val')} (M USD)`, showTitle: true, titleFontSize: 10, titleColor: C_MID,
      valAxisNumFmt: '0.000"M"' }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 4 — Export: Volume + Value
  // ══════════════════════════════════════════════════════════════════════
  const s4 = prs.addSlide();
  addHeader(s4, t('dash.sec_export'), rangeLabel);

  s4.addChart('bar' as any,
    toSeries(params.exportVolumeData, ['RT'], [t('dash.bar_rt')]),
    { ...CHART_BASE, x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
      barDir: 'col', barGrouping: 'clustered', chartColors: PALETTE_EXPORT,
      title: t('dash.chart_exp_vol'), showTitle: true, titleFontSize: 10, titleColor: C_MID }
  );
  s4.addChart('bar' as any,
    toSeries(params.exportValueData, ['Valor (M USD)'], [t('dash.bar_valor_exp')]),
    { ...CHART_BASE, x: 0.28 + HALF_W + 0.34, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
      barDir: 'col', barGrouping: 'clustered', chartColors: PALETTE_EXPORT,
      title: `${t('dash.chart_exp_val')} (M USD)`, showTitle: true, titleFontSize: 10, titleColor: C_MID,
      valAxisNumFmt: '0.000"M"' }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 5 — Contribuciones Pagadas (M MXN)
  // ══════════════════════════════════════════════════════════════════════
  if (params.dutiesData.length > 0) {
    const s5 = prs.addSlide();
    addHeader(s5, t('dash.chart_contrib'), t('dash.chart_contrib_sub_live'));
    const dutKeys  = ['IGI Import','IVA Import Efectivo','IVA Import Fianza','DTA Import','IGI Export','IVA Export','DTA Export'];
    const dutNames = [t('dash.bar_igi_imp'), t('dash.bar_iva_imp_ef'), t('dash.bar_iva_imp_fz'),
                      t('dash.bar_dta_imp'), t('dash.bar_igi_exp'), t('dash.bar_iva_exp'), t('dash.bar_dta_exp')];
    s5.addChart('bar' as any,
      toSeries(params.dutiesData, dutKeys, dutNames, 1e6),
      { ...CHART_BASE, x: 0.28, y: CONTENT_Y, w: SLIDE_W - 0.56, h: CONTENT_H,
        barDir: 'col', barGrouping: 'clustered', chartColors: PALETTE_DUTIES,
        valAxisNumFmt: '0.00"M"' }
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SLIDE 6 — Operaciones Especiales + Revisiones
  // ══════════════════════════════════════════════════════════════════════
  const s6 = prs.addSlide();
  addHeader(s6, t('dash.sec_special'), rangeLabel);

  const SPECIAL_CLAVES = ['A3','A4','F4','F5','V3'];
  if (params.specialOpsData.length > 0 && params.hasLiveSpecial) {
    s6.addChart('bar' as any,
      toSeries(params.specialOpsData, SPECIAL_CLAVES, SPECIAL_CLAVES),
      { ...CHART_BASE, x: 0.28, y: CONTENT_Y, w: HALF_W, h: CONTENT_H,
        barDir: 'col', barGrouping: 'stacked', chartColors: PALETTE_SPECIAL,
        title: t('dash.chart_special'), showTitle: true, titleFontSize: 10, titleColor: C_MID }
    );
  }

  if (params.revisionsData.length > 0) {
    const revXOffset = (params.specialOpsData.length > 0 && params.hasLiveSpecial) ? 0.28 + HALF_W + 0.34 : 0.28;
    const revWidth   = (params.specialOpsData.length > 0 && params.hasLiveSpecial) ? HALF_W : SLIDE_W - 0.56;
    s6.addChart(
      [
        { type: 'bar'  as any, data: toSeries(params.revisionsData, ['Import'], [t('dash.rev_import')]),
          options: { chartColors: PALETTE_REV_BAR, barGrouping: 'clustered' } },
        { type: 'line' as any, data: toSeries(params.revisionsData, ['Export'], [t('dash.rev_export')]),
          options: { chartColors: PALETTE_REV_LINE } },
      ],
      { ...CHART_BASE, x: revXOffset, y: CONTENT_Y, w: revWidth, h: CONTENT_H,
        title: t('dash.chart_rev'), showTitle: true, titleFontSize: 10, titleColor: C_MID } as any
    );
  }

  // ─── Save ────────────────────────────────────────────────────────────
  const dateStr = new Date().toISOString().slice(0, 10);
  await prs.writeFile({ fileName: `Dashboard_CFMoto_${dateStr}.pptx` });
}
