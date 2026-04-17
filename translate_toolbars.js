const fs = require('fs');
const path = require('path');

const targetPages = [
    'BOMAnalyzer.tsx', 'Carriers.tsx', 'Drivers.tsx', 'TransportLines.tsx',
    'PreAlerts.tsx', 'BPMClasificacion.tsx', 'XMLCI.tsx', 'XMLInvoiceExtractor.tsx',
    'ExpedienteElectronico.tsx', 'Cajas.tsx', 'CustomsClearance.tsx', 'EquipmentTracking.tsx', 'VesselTracking.tsx'
];

const TARGET_DIR = path.join(__dirname, 'pages');

for (const file of targetPages) {
    const filePath = path.join(TARGET_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Inject import if missing
    if (!content.includes('../context/LanguageContext')) {
        // Insert after first React import or at top
        content = content.replace(/(import React[^;]*;)/, "$1\nimport { useLanguage } from '../context/LanguageContext';");
        modified = true;
    }

    // 2. Inject hook if missing
    if (content.match(/const\s+\[\w+,\s*set\w+\]\s*=\s*useState/) && !content.includes('const { t } = useLanguage();')) {
        content = content.replace(/(const\s+\[\w+,\s*set\w+\]\s*=\s*useState[^;]*;)/, "$1\n  const { t } = useLanguage();");
        modified = true;
    }

    // 3. Replacements
    const replacements = [
        { from: />\s*Exportar\s*</g, to: "> {t('btn.export')} <" },
        { from: />\s*Actualizar\s*</g, to: "> {t('btn.actualizar')} <" },
        { from: />\s*Actualizando\.\.\.\s*</g, to: "> {t('btn.actualizando')} <" },
        { from: />\s*Filtros Masivos\s*</g, to: "> {t('btn.mass')} <" },
        { from: /placeholder="Búsqueda multi-termino\.\.\."/g, to: "placeholder={t('common.buscar')}" },
        { from: />\s*HOY\s*</g, to: "> {t('common.hoy')} <" },
        { from: /Borrar \(\{selectedIds.size\}\)/g, to: "{t('btn.borrar')} ({selectedIds.size})" },
        { from: />\s*Nueva\s*</g, to: "> {t('btn.new')} <" },
        { from: />\s*Nuevo\s*</g, to: "> {t('btn.new')} <" },
        { from: />\s*Asignar\s*</g, to: "> {t('btn.new')} <" },
        { from: /title="Actualizar datos sin recargar la página"/g, to: "title={t('common.actualizar_desc')}" }
    ];

    for (const r of replacements) {
        if (content.match(r.from)) {
            content = content.replace(r.from, r.to);
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log('Processed', file);
    }
}
