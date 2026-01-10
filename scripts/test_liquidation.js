
const block = `
CUADRO DE LIQUIDACION
CONCEPTO F.P. IMPORTE CONCEPTO F.P. IMPORTE TOTALES
DTA 0 445 IVA 0 191944 EFECTIVO 192725
IVA PRV 0 46 PRV 0 290 OTROS 0
TOTAL 192725
`;

console.log("Testing Liquidation Parsing...");

const importes = {};

// Regex Strategy:
// Look for Token (DTA, PRV, CNT, IVA, etc.) followed optionally by FP, then IMPORTE.
// The screenshot shows: PRV [space] 0 [space] 290
// Sometimes "IVA PRV" (which is different?) or just formatting.

const taxKeys = ['DTA', 'PRV', 'CNT', 'IVA', 'IGI', 'REC'];

taxKeys.forEach(key => {
    // Regex:
    // Key
    // Possible separators/text
    // Number (Importe) - assuming it's the last large number in the sequence?
    // User image: "PRV 0 290" -> Key, FP, Amount

    // Attempt 1: Strict Key + FP + Amount
    const regex = new RegExp(`${key}\\s+(?:\\d+\\s+)?(\\d+(?:\\.\\d+)?)`, 'i');
    const match = block.match(regex);

    // Attempt 2: Global scan for Key followed by number within reasonable distance
    // Handle "IVA PRV" vs "PRV" -> "IVA PRV" might be "IVA Prevalidación"? 
    // Wait, in the screenshot "IVA PRV" is 46, "PRV" is 290. They are distinct.
    // So we must match "PRV" but not "IVA PRV" if we search for PRV?
    // Or boundary check \bPRV\b.

    const strictRegex = new RegExp(`\\b${key}\\b\\s+(\\d+)\\s+(\\d+(?:\\.\\d+)?)`, 'i');
    // Matches "PRV 0 290" -> Group 1 (FP), Group 2 (Amount)

    const m = block.match(strictRegex);
    if (m) {
        importes[key] = parseFloat(m[2]);
        console.log(`✅ Found ${key}: ${importes[key]}`);
    } else {
        // Fallback for just Amount?
        const looseRegex = new RegExp(`\\b${key}\\b.*?(\\d+(?:\\.\\d+)?)`, 'i');
        const m2 = block.match(looseRegex);
        if (m2) {
            console.log(`⚠️ Loose Match ${key}: ${m2[1]}`);
        } else {
            console.log(`❌ Not Found ${key}`);
        }
    }
});
