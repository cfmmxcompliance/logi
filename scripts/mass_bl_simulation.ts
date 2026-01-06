
// Mass Simulation of BL Regex Logic

// COPY OF LOGIC FROM Controller.tsx
function extractBl(text: string): string {
    let bestBlCandidate = "";

    // Strategy 1 & 2 Combined: Broad Label Search
    const labeledRegex = /(?:MBL|HBL|BL|MAWB|HAWB|REF|BoL|Reference|Booking|Book|Guide|Guia|No)[^A-Z0-9]*([A-Z0-9]{5,30})/gi;

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

// TEST CASES - DIVERSE LIST
const testCases = [
    { type: "Standard Maersk", text: "MBL: MAEU123456789", expected: "MAEU123456789" },
    { type: "Standard MSC", text: "Booking Ref: MEDU1234567", expected: "MEDU1234567" },
    { type: "Standard COSCO", text: "BL No: COSU12345678", expected: "COSU12345678" },
    { type: "Evergreen", text: "MBL: EGLV143559589426", expected: "EGLV143559589426" },
    { type: "CMA CGM", text: "Booking: CMDU987654321", expected: "CMDU987654321" },
    { type: "ONE (3 Letter)", text: "Ref: ONE12345678", expected: "ONE12345678" },
    { type: "Hapag-Lloyd (Hyphen)", text: "Booking: HLCU-12345678", expected: "HLCU12345678" }, // Note: regex captures raw, stripped later if needed, but here captures strict group
    { type: "Numeric Only", text: "Booking No: 123456789", expected: "123456789" },
    { type: "Numeric Short", text: "Ref: 9876543", expected: "9876543" },
    { type: "Spaced Out", text: "M S K U 0 0 0 1 1 1", expected: "MSKU000111" }, // Strategy 3 Normalized
    { type: "Spaced Label", text: "Booking : 1 2 3 4 5 6 7", expected: "1234567" },
    { type: "Spanish Label", text: "Guia: ABC1234567", expected: "ABC1234567" },
    { type: "Just 'No'", text: "No: 5555566666", expected: "5555566666" },
    { type: "Messy Text", text: "random noise... Booking: XYZ99887766 ... footer", expected: "XYZ99887766" },
    { type: "Garbage Check", text: "Inventory 123", expected: "" }, // Should NOT match (no valid label, just text)
    { type: "Partial Match", text: "Ref: A1", expected: "" } // Should NOT match (<5 chars)
];

console.log("=== STARTING MASS SIMULATION ===");
let passed = 0;
let failed = 0;
const start = Date.now();

testCases.forEach(tc => {
    const result = extractBl(tc.text);
    // Normalize result for comparison (remove non-alphanum if regex captured loose stuff)
    const cleanResult = result.replace(/[^A-Z0-9]/g, '');
    const cleanExpected = tc.expected; // Expectations are already clean usually

    if (cleanResult === cleanExpected) {
        // console.log(`✅ [${tc.type}] Matches: ${cleanResult}`);
        passed++;
    } else {
        console.log(`❌ [${tc.type}] FAILED! Expected '${cleanExpected}', Got '${cleanResult}' (Raw: '${result}')`);
        failed++;
    }
});

const end = Date.now();
console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}`);
console.log(`Time: ${end - start}ms`);
