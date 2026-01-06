
// Simulation of BL Regex Logic against NEW CLEAN USER LIST

function extractBl(text: string): string {
    let bestBlCandidate = "";

    // Strategy 1 & 2 Combined: Broad Label Search (UPDATED WITH HYPHENS)
    const labeledRegex = /(?:MBL|HBL|BL|MAWB|HAWB|REF|BoL|Reference|Booking|Book|Guide|Guia|No)[^A-Z0-9]*([A-Z0-9-]{5,30})/gi;

    // Try Raw Text
    let matches = [...text.matchAll(labeledRegex)];

    // Try Normalized Text
    if (matches.length === 0) {
        const normalizedText = text.replace(/\s+/g, '');
        matches = [...normalizedText.matchAll(labeledRegex)];
    }

    if (matches.length > 0) {
        const valid = matches.filter(m => m[1].replace(/[^A-Z0-9]/g, '').length >= 5);
        if (valid.length > 0) bestBlCandidate = valid[0][1].toUpperCase();
    }

    if (bestBlCandidate) {
        return bestBlCandidate;
    } else {
        const normalizedText = text.replace(/\s+/g, '');
        // Strategy 3: Standalone format (AAAA1234567) - STRICT
        // Note: Strategy 3 is for pure SCAC-like codes floating in space. 
        // It does NOT support hyphens or purely numeric codes floating in space (too risky).
        const strictRegex = /\b([A-Z]{4})[\s-]*([0-9]{7,12})\b/gi;
        const strictMatches = [...text.matchAll(strictRegex)];
        if (strictMatches.length > 0) {
            return (strictMatches[0][1] + strictMatches[0][2]).toUpperCase();
        } else {
            // Last Resort: Check normalized text for standalone SCAC pattern
            const normStrictRegex = /([A-Z]{4}[0-9]{7,12})/gi;
            const normStrictMatches = [...normalizedText.matchAll(normStrictRegex)];
            if (normStrictMatches.length > 0) {
                return normStrictMatches[0][1];
            }
        }
    }
    return "";
}

// NEW CLEAN LIST FROM USER
const userItems = [
    "6311506375",
    "8868-76764254", // Hyphenated
    "ZIMUSHH31978973", // 7 Letters prefix? Regex allows it.
    "EGLV143574069012",
    "6311526970",
    "6311533664",
    "143559588446", // Corrected
    "1564051510",
    "EGLV143581025106",
    "SHACB25074765", // 5 Letter prefix
    "EGLV143559589132",
    "EGLV143559589426",
    "EGLV143574069420",
    "SHACB25075754",
    "EGLV143574068164",
    "9511668073",
    "EGLV143574070088",
    "SZX503345800", // 3 Letter
    "EGLV143559711353",
    "EGLV143574068432",
    "EGLV143574067401",
    "EGLV143559589141",
    "EGLV143581025084",
    "EGLV143559588446",
    "EGLV143559588420",
    "ZIMUNGB20833209",
    "EGLV143574070495",
    "EGLV143559688220",
    "EGLV143559711337",
    "EGLV143500556352",
    "EGLV143574069349",
    "EGLV143574069373",
    "EGLV143574071165",
    "EGLV143574070100",
    "3628347726",
    "EGLV143559688203"
];

console.log(`=== SIMULATING ${userItems.length} ITEMS FROM CLEAN USER LIST ===`);
let passed = 0;
let failed = 0;

userItems.forEach(item => {
    // Simulate labeled context (most reliable)
    const context = `Booking No: ${item}`;
    const result = extractBl(context);

    // Comparison (ignoring non-alphanum)
    // Actually, for hyphenated, we extract hyphen but often systmes want clean.
    // Let's assert that we EXTRACTED the string "8868-76764254" correctly.

    if (result === item) {
        // Exact match
        passed++;
    } else {
        // Check if it's just a hyphen diff or case diff
        if (result.replace(/[^A-Z0-9]/g, '') === item.replace(/[^A-Z0-9]/g, '')) {
            passed++;
        } else {
            console.log(`❌ FAILED: ${item} -> Got '${result}'`);
            failed++;
        }
    }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Total: ${userItems.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) console.log("RESULT: PLATINUM SUCCESS ✅");
else console.log("RESULT: STILL FAILING ❌");
