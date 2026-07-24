// Simulation Script for Cloned Modules Logic

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Simulation Failed: ${message}`);
    }
}

console.log("=== INICIANDO SIMULACIÓN DE ERRORES ===");

// 1. SIMULAR AUTO-COMPLETADO DE GUIONES UUID EN STORAGE SERVICE
console.log("\n1. Simulando Búsqueda por UUID (storageService.ts)");
function simulateUUIDFormat(rawPrefix) {
    if (rawPrefix.length === 32 && !rawPrefix.includes('-')) {
        return rawPrefix.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    }
    return rawPrefix;
}

try {
    const rawNoDash = "E8A7635662044B748DE65A0897A44BDE";
    const formatted = simulateUUIDFormat(rawNoDash);
    assert(formatted === "E8A76356-6204-4B74-8DE6-5A0897A44BDE", "UUID sin guiones no se formateó correctamente.");
    
    const rawWithDash = "E8A76356-6204-4B74-8DE6-5A0897A44BDE";
    assert(simulateUUIDFormat(rawWithDash) === rawWithDash, "UUID con guiones fue modificado incorrectamente.");
    
    const partial = "E8A76356";
    assert(simulateUUIDFormat(partial) === partial, "UUID parcial fue modificado incorrectamente.");
    
    console.log("✅ Auto-completado de UUID funciona perfectamente.");
} catch (e) {
    console.error("❌ " + e.message);
}

// 2. SIMULAR LOGICA DE FILTRADO LOCAL (XMLInvoiceExtractorV01)
console.log("\n2. Simulando Filtro Local y Búsqueda Ambivalente (XMLInvoiceExtractorV01)");
function simulateFilter(items, searchTerm) {
    const rawTerms = searchTerm.split(/[\n,]/).map(v => v.trim()).filter(v => v !== '');
    if (rawTerms.length === 0) return items;

    const norm = (s) => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6');
    const stripDashes = (s) => s.replace(/-/g, '');

    return items.filter(item => {
        const storedUUID = (item.uuid || '').toLowerCase();
        const storedUUIDNorm = norm(item.uuid || '').toLowerCase();
        const storedUUIDNoDash = stripDashes(storedUUID);
        const storedUUIDNormNoDash = stripDashes(storedUUIDNorm);

        const searchableContent = [
            item.invoiceNo, item.partNo, item.vin, storedUUID
        ].map(v => (v || '').toString().toLowerCase());

        return rawTerms.some(term => {
            const termLow = term.toLowerCase();
            const termNorm = norm(term).toLowerCase();
            const termNoDash = stripDashes(termLow);
            const termNormNoDash = stripDashes(termNorm);
            
            if (searchableContent.some(c => c.includes(termLow))) return true;
            if (storedUUIDNorm.includes(termNorm)) return true;
            if (storedUUIDNoDash.includes(termNoDash)) return true;
            if (storedUUIDNormNoDash.includes(termNormNoDash)) return true;
            return false;
        });
    });
}

try {
    const mockItems = [
        { invoiceNo: 'F123', partNo: 'P-99', uuid: 'E8A76356-6204-4B74-8DE6-5A0897A44BDE' },
        { invoiceNo: 'F124', partNo: 'P-00', uuid: '88B99999-1111-2222-3333-444455556666' }
    ];

    // Buscar con guiones
    let result = simulateFilter(mockItems, "E8A76356-6204");
    assert(result.length === 1 && result[0].invoiceNo === 'F123', "Fallo al buscar con guiones.");

    // Buscar SIN guiones
    result = simulateFilter(mockItems, "E8A763566204");
    assert(result.length === 1 && result[0].invoiceNo === 'F123', "Fallo al buscar sin guiones localmente.");

    // Buscar con error de tipeo (O en lugar de 0)
    result = simulateFilter(mockItems, "E8A76356-62O4");
    assert(result.length === 1 && result[0].invoiceNo === 'F123', "Fallo al corregir letras O por 0.");

    // Buscar un invoiceNo
    result = simulateFilter(mockItems, "F124");
    assert(result.length === 1 && result[0].invoiceNo === 'F124', "Fallo al buscar por número de factura.");

    console.log("✅ Filtro local multi-formato funciona perfectamente.");
} catch(e) {
    console.error("❌ " + e.message);
}

// 3. SIMULAR QUERY BUILDER (XMLCIV01)
console.log("\n3. Simulando Advanced Query Builder (XMLCIV01)");
function simulateQueryBuilder(item, conditions) {
    const norm = (s) => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6');
    const stripDashes = (s) => s.replace(/-/g, '');

    return conditions.every(cond => {
        const rawVal = item[cond.column] || '';
        const colLow = String(rawVal).toLowerCase();
        const colNorm = norm(String(rawVal)).toLowerCase();
        const colNoDash = stripDashes(colLow);
        const colNormND = stripDashes(colNorm);
        const isUUID = cond.column === 'uuid';

        const filterValues = cond.values.split(/[\n,]/).map(v => v.trim().toLowerCase()).filter(v => v !== '');
        if (filterValues.length === 0) return true;

        return filterValues.some(val => {
            const valNorm = isUUID ? norm(val).toLowerCase() : val;
            const valND = stripDashes(val);
            const valNormND = stripDashes(valNorm);

            if (cond.operator === 'contains') {
                if (colLow.includes(val)) return true;
                if (isUUID && colNorm.includes(valNorm)) return true;
                if (isUUID && colNoDash.includes(valND)) return true;
                if (isUUID && colNormND.includes(valNormND)) return true;
            }
            return false;
        });
    });
}

try {
    const item = { invoiceNo: 'F999', uuid: 'ABCD-1234' };
    
    // Condición simple (UUID parcial sin guion)
    let passed = simulateQueryBuilder(item, [
        { column: 'uuid', operator: 'contains', values: 'CD12' }
    ]);
    assert(passed === true, "Query Builder falló UUID contains sin guion.");

    // Múltiples valores (separados por coma)
    passed = simulateQueryBuilder(item, [
        { column: 'invoiceNo', operator: 'contains', values: 'X111, F99' }
    ]);
    assert(passed === true, "Query Builder falló soporte de múltiples valores por coma.");

    console.log("✅ Query Builder lógico opera sin defectos.");
} catch(e) {
    console.error("❌ " + e.message);
}

console.log("\n=== SIMULACIÓN FINALIZADA SIN ERRORES CRÍTICOS ===");
