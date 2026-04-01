import re

with open("/Users/alex/Downloads/logimaster (2)/pages/BOMAnalyzer.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Step type
content = content.replace(
    "type Step = 'idle' | 'loaded' | 'diagnosed' | 'normalized' | 'deduped' | 'crossed' | 'done';",
    "type Step = 'idle' | 'loaded' | 'diagnosed' | 'normalized' | 'deduped' | 'cloned' | 'crossed' | 'done';"
)

# 2. Update Progress Steps UI
content = content.replace(
    "const labels = ['Upload', 'Diagnose', 'Normalize', 'Dedupe', 'MasterData', 'Done'];",
    "const labels = ['Upload', 'Diagnose', 'Normalize', 'Dedupe', 'Clones', 'MasterData'];"
)
content = content.replace(
    "const stepOrder: Step[] = ['idle', 'loaded', 'diagnosed', 'normalized', 'deduped', 'crossed', 'done'];",
    "const stepOrder: Step[] = ['idle', 'loaded', 'diagnosed', 'normalized', 'deduped', 'cloned', 'crossed', 'done'];"
)

# 3. Modify parseExcel to support CI logic generically and modify handleBOMFile to accept multiple files
parse_logic = """
  // ── Read Excel File (Standard & CI) ────────────────────────────────────
  const parseExcelOrCI = (file: File): Promise<BomRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const rows: BomRow[] = [];
          
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
            
            // Detect if it's a CI or standard BOM
            let headerRow = -1;
            let isCI = false;
            
            for (let i = 0; i < Math.min(json.length, 30); i++) {
              const rstr = json[i].map(c => String(c || '').toUpperCase()).join(' ');
              if (rstr.includes('ESTILO') && rstr.includes('INSUMO')) {
                headerRow = i;
                isCI = false;
                break;
              }
              if (rstr.includes('PART') && (rstr.includes('QTY') || rstr.includes('PRICE'))) {
                headerRow = i;
                isCI = true;
                break;
              }
            }
            
            if (headerRow === -1) continue; // Skip sheet if no header found
            
            const hdrs = json[headerRow].map(h => String(h || '').trim().toUpperCase());
            const col = (name: string) => hdrs.findIndex(h => h.includes(name));
            
            if (isCI) {
              const modelIdx = col('MODEL');
              const partIdx = col('PART');
              const qtyIdx = col('QTY');
              const umIdx = col('U-M') >= 0 ? col('U-M') : col('UM');
              const htsIdx = col('HTS');
              
              for (let i = headerRow + 1; i < json.length; i++) {
                const r = json[i];
                if (!r || r.length === 0) continue;
                const part = String(r[partIdx] || '').trim();
                const model = modelIdx >= 0 ? String(r[modelIdx] || '').trim() : '';
                if (!part || part.length < 4 || part.toUpperCase().includes('TOTAL')) continue;
                
                rows.push({
                  ESTILO: model || 'UNKNOWN_MODEL',
                  INSUMO: part,
                  CANTIDAD: Number(r[qtyIdx] || 0),
                  MERMA: 0,
                  UNIDAD: String(r[umIdx] || 'PZA').trim(),
                  BOM: 'BOM_DESDE_CI',
                  FECHAINI: null,
                  FECHAFIN: null
                });
              }
            } else {
              // Standard BOM logic
              const objJson: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
              for(const r of objJson) {
                if(!r['INSUMO']) continue;
                rows.push({
                  ESTILO: String(r['ESTILO'] ?? '').trim(),
                  INSUMO: String(r['INSUMO'] ?? '').trim(),
                  CANTIDAD: Number(r['CANTIDAD'] ?? 0),
                  MERMA: Number(r['MERMA'] ?? 0),
                  UNIDAD: String(r['UNIDAD'] ?? 'PZA').trim(),
                  BOM: String(r['BOM'] ?? '').trim(),
                  FECHAINI: r['FECHAINI'] != null ? String(r['FECHAINI']) : null,
                  FECHAFIN: r['FECHAFIN'] != null ? String(r['FECHAFIN']) : null,
                });
              }
            }
          }
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // ── Step 1: Load BOM ───────────────────────────────────────────────────
  const handleBOMFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setProcessing(true);
    clearTerminal();
    addLine('header', '══════════════════════════════════════════════════');
    addLine('cmd', `> ANALIZADOR MULTI-BOM & CI v2.0`);
    addLine('header', '══════════════════════════════════════════════════');
    addBlank();
    addLine('cmd', `> [STEP 1] Cargando ${files.length} archivo(s)...`);

    try {
      let allRows: BomRow[] = [];
      for (const file of files) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
          addLine('warn', `  Saltando ${file.name} (formato inválido)`);
          continue;
        }
        const fileRows = await parseExcelOrCI(file);
        allRows = [...allRows, ...fileRows];
        addLine('info', `  + ${file.name} (${fileRows.length} insumos)`);
      }

      setRawRows(allRows);
      setFileName(files.length > 1 ? `${files.length} archivos agrupados` : files[0].name);

      const estilos = [...new Set(allRows.map(r => r.ESTILO))].filter(Boolean);
      const insumos = [...new Set(allRows.map(r => r.INSUMO))];

      addLine('ok', `✓ Carga completada exitosamente`);
      addLine('info', `  Registros totales  : ${allRows.length}`);
      addLine('info', `  Insumos únicos     : ${insumos.length}`);
      addLine('info', `  Estilos detectados : ${estilos.length}`);
      if(estilos.length > 0 && estilos.length < 10) addLine('info', `  Estilos            : ${estilos.join(', ')}`);
      addBlank();

      setStep('loaded');
    } catch (err) {
      addLine('error', `❌ Error cargando archivos: ${String(err)}`);
    }
    setProcessing(false);
  };
"""

content = re.sub(
    r"// ── Read Excel File ────────────────────────────────────────────────────.+?// ── Step 2: Diagnose ──────────────────────────────────────────────────",
    parse_logic + "\n  // ── Step 2: Diagnose ──────────────────────────────────────────────────",
    content,
    flags=re.DOTALL
)

# 4. Update the onDrop call for BOM to use multi-files
on_drop_old = """const onDrop = useCallback((e: React.DragEvent, target: 'bom' | 'master' | 'catalog' = 'bom') => {
    e.preventDefault();
    if (target === 'master') setMasterDragging(false);
    else if (target === 'catalog') setCatalogDragging(false);
    else setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (target === 'master') handleMasterFile(file);
    else if (target === 'catalog') handleCatalogFile(file);
    else handleBOMFile(file);
  }, [rawRows, normalizedRows, dedupedRows, finalRows, productCatalog]);"""

on_drop_new = """const onDrop = useCallback((e: React.DragEvent, target: 'bom' | 'master' | 'catalog' = 'bom') => {
    e.preventDefault();
    if (target === 'master') setMasterDragging(false);
    else if (target === 'catalog') setCatalogDragging(false);
    else setDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    
    if (target === 'master') handleMasterFile(files[0]);
    else if (target === 'catalog') handleCatalogFile(files[0]);
    else handleBOMFiles(files);
  }, [rawRows, normalizedRows, dedupedRows, finalRows, productCatalog]);"""

content = content.replace(on_drop_old, on_drop_new)

# handle onClick multiple files input
content = content.replace(
    """onChange={e => { if (e.target.files?.[0]) handleBOMFile(e.target.files[0]); e.target.value = ''; }} />""",
    """multiple onChange={e => { if (e.target.files?.length) handleBOMFiles(Array.from(e.target.files)); e.target.value = ''; }} />"""
)

# 5. Fix deduplication to deduplicate by ESTILO + INSUMO
dedup_old = """const byInsumo: Record<string, BomRow[]> = {};
    normalizedRows.forEach(r => {
      if (!byInsumo[r.INSUMO]) byInsumo[r.INSUMO] = [];
      byInsumo[r.INSUMO].push(r);
    });"""

dedup_new = """const byInsumo: Record<string, BomRow[]> = {};
    normalizedRows.forEach(r => {
      const k = `${r.ESTILO}||${r.INSUMO}`;
      if (!byInsumo[k]) byInsumo[k] = [];
      byInsumo[k].push(r);
    });"""
content = content.replace(dedup_old, dedup_new)

# Update singles map
singles_old = "const singles: BomRow[] = clean.map(k => byInsumo[k][0]);"
singles_new = """const singles: BomRow[] = clean.map(k => byInsumo[k][0]);"""

# Merge logic updates to use the new byInsumo key
# The insumo inside conflicts should be just the insumo, but since key is ESTILO||INSUMO we need to fix the conflict display.
conflict_old = "conflicts2x.push({ insumo, records: recs, chosen: null });"
conflict_new = """const actualInsumo = insumo.split('||')[1] || insumo;
          conflicts2x.push({ insumo, records: recs, chosen: null });"""
content = content.replace(conflict_old, conflict_new)

conflict_ui_old = "<p className=\"text-[10px] text-yellow-400 font-mono font-bold shrink-0\">{c.insumo}</p>"
conflict_ui_new = "<p className=\"text-[10px] text-yellow-400 font-mono font-bold shrink-0\">{c.insumo.split('||').pop()}</p>"
content = content.replace(conflict_ui_old, conflict_ui_new)

# Update dedupe total print
content = content.replace(
    "const all = [...singles, ...autoMerge].sort((a, b) => a.INSUMO.localeCompare(b.INSUMO));",
    "const all = [...singles, ...autoMerge].sort((a, b) => (`${a.ESTILO}||${a.INSUMO}`).localeCompare(`${b.ESTILO}||${b.INSUMO}`));"
)
content = content.replace(
    "const all = [...dedupedRows, ...resolved].sort((a, b) => a.INSUMO.localeCompare(b.INSUMO));",
    "const all = [...dedupedRows, ...resolved].sort((a, b) => (`${a.ESTILO}||${a.INSUMO}`).localeCompare(`${b.ESTILO}||${b.INSUMO}`));"
)

# 6. Step 4.5 Clone Variants logic
cloner_logic = """
  // ── Step 4.5: Auto-Clone Variants ──────────────────────────────────────
  const runCloneVariants = () => {
    if (Object.keys(productCatalog).length === 0) {
      addLine('error', '❌ Carga el Catalogo de Productos primero.');
      return;
    }
    addLine('cmd', `> [STEP 5] GENERADOR AUTOMÁTICO DE VARIANTES`);
    addLine('header', '──────────────────────────────────────────────────');

    const source = dedupedRows.length > 0 ? dedupedRows : normalizedRows;
    const bomEstilos = Array.from(new Set(source.map(r => r.ESTILO)));
    
    // Group catalog
    const byModel: Record<string, string[]> = {};
    for (const [p, m] of Object.entries(productCatalog)) {
      if (!byModel[m]) byModel[m] = [];
      byModel[m].push(p);
    }
    
    const COLOR_RE = /-0(ET|RE|YG|BM|K1|RT|HJ|YD|BQ|D0|PG|P8|RM)0{1,2}/i;
    const getColor = (pn: string) => {
      const m = pn.match(/^[A-Z]\\d{2}[A-Z]{3}\\d([A-Z0-9]{2})/);
      return m ? m[1] : null;
    };
    
    let clonedRows: BomRow[] = [];
    let totalCloned = 0;
    
    for (const estilo of bomEstilos) {
      const baseParts = source.filter(r => r.ESTILO === estilo);
      const modelo = productCatalog[estilo];
      
      // If the style is not in the catalog, we can't safely clone its platform variants
      if (!modelo) continue;
      
      const targets = byModel[modelo].filter(t => t !== estilo && !bomEstilos.includes(t));
      if (targets.length === 0) continue;
      
      addLine('info', `  Base ${estilo} (${modelo}) → Clonando ${targets.length} variantes...`);
      
      for (const target of targets) {
        const targetColor = getColor(target) || 'ET';
        let substCount = 0;
        const newRows = baseParts.map(r => {
          let newInsumo = r.INSUMO;
          if (COLOR_RE.test(r.INSUMO)) {
            newInsumo = r.INSUMO.replace(COLOR_RE, (match, g1) => 
               match.replace(g1.toUpperCase(), targetColor.toUpperCase())
                    .replace(g1.toLowerCase(), targetColor.toLowerCase())
            );
            if (newInsumo !== r.INSUMO) substCount++;
          }
          return { ...r, ESTILO: target, INSUMO: newInsumo, BOM: 'CLON_AUTOMATICO' };
        });
        clonedRows = [...clonedRows, ...newRows];
        totalCloned++;
        addLine('ok', `    ✓ ${target} (Color: ${targetColor}) → ${substCount} colores sustituidos`);
      }
    }
    
    if (totalCloned > 0) {
      setDedupedRows([...source, ...clonedRows]);
      addLine('ok', `✓ Se generaron ${totalCloned} BOMs automáticos perfectamente vinculados.`);
    } else {
      addLine('warn', `⚠ No se encontraron variantes para clonar. Todos los modelos están cubiertos.`);
    }
    
    setStep('cloned');
    addBlank();
  };

"""

content = re.sub(r"(// ── Step 5: Cross MasterData ───────────────────────────────────────────)", cloner_logic + r"\1", content)

# 7. Update Left Panel Action Buttons
buttons_old = """            {[
              { label: 'Diagnóstico', icon: FileSearch, fn: runDiagnosis, disabled: step !== 'loaded', active: step === 'loaded' },
              { label: 'Normalizar ESTILO', icon: Zap, fn: runNormalization, disabled: step !== 'diagnosed', active: step === 'diagnosed' },
              { label: 'Deduplicar', icon: RefreshCw, fn: runDeduplication, disabled: step !== 'normalized', active: step === 'normalized' },
            ].map(({ label, icon: Icon, fn, disabled, active }) => ("""

buttons_new = """            {[
              { label: 'Diagnóstico', icon: FileSearch, fn: runDiagnosis, disabled: step !== 'loaded', active: step === 'loaded' },
              { label: 'Normalizar ESTILO', icon: Zap, fn: runNormalization, disabled: step !== 'diagnosed', active: step === 'diagnosed' },
              { label: 'Deduplicar / Flat', icon: RefreshCw, fn: runDeduplication, disabled: step !== 'normalized', active: step === 'normalized' },
              { label: 'Clonar Variantes', icon: Copy, fn: runCloneVariants, disabled: step !== 'deduped', active: step === 'deduped' },
            ].map(({ label, icon: Icon, fn, disabled, active }) => ("""

content = content.replace(buttons_old, buttons_new)

# Don't forget to import Copy icon
content = content.replace("CheckCircle2", "CheckCircle2, Copy")

# Save file
with open("/Users/alex/Downloads/logimaster (2)/pages/BOMAnalyzer.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Parche aplicado!")
