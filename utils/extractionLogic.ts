/**
 * Extraction Logic Utility
 * 
 * Centralizes the Regex and Validation logic for extracting:
 * 1. Bill of Lading (BL) numbers.
 * 2. Container numbers.
 * 
 * Supports:
 * - Labeled BLs (Booking: 12345)
 * - Standalone SCAC+Number (EGLV1234567)
 * - Hyphenated BLs (REF-TEST-004)
 * - Spaced out text (E G L V ...)
 * - Container ISO format (4 letters + 7 digits)
 */

/**
 * Extraction Logic Utility
 * 
 * Centralizes the Regex and Validation logic for extracting:
 * 1. Bill of Lading (BL) numbers.
 * 2. Container numbers.
 * 
 * Supports:
 * - Labeled BLs (Booking: 12345)
 * - Standalone SCAC+Number (EGLV1234567)
 * - Hyphenated BLs (REF-TEST-004)
 * - Spaced out text (E G L V ...)
 * - Container ISO format (4 letters + 7 digits)
 */

interface ExtractionResult {
    extractedBl: string;
    extractedContainer: string;
}

export const extractBlAndContainer = (text: string) => {
    // 1. Clean Text for better regex matching
    // Remove excess whitespace but keep structure somewhat
    const cleanText = text.replace(/\r?\n|\r/g, " ").replace(/\s+/g, ' ');
    const normalizedText = text.replace(/\s+/g, '');

    // --- BL EXTRACTION ---
    let extractedBl = "";

    // Regex 1: Labeled BLs (Robust)
    // Matches: Label (optional colon/no/number) + Value (5-20 chars)
    // Supports: "Booking No: 123", "MBL # 123", "Guia: 123", "Bill of Lading 123"
    const labeledRegex = /(?:B\/L|Bill of Lading|Embarque|Guía|Guia|MBL|HBL|Booking|Ref|Reference)\s*(?:No\.?|Number|#|[:.])?\s*([A-Z0-9-]{5,20})/gi;

    // Helper to find best match
    const findBl = (targetText: string) => {
        const matches = [...targetText.matchAll(labeledRegex)];
        for (const match of matches) {
            const val = match[1].replace(/[^A-Z0-9]/g, ''); // strip hyphens for length check
            if (val.length >= 5) return match[1].toUpperCase().trim();
        }
        return "";
    };

    // Try finding in clean text first (preserves spaces between words)
    extractedBl = findBl(cleanText);

    // If failed, try normalized text (good for spaced out chars like "M B L : 1 2 3")
    if (!extractedBl) {
        extractedBl = findBl(normalizedText);
    }

    // Regex 2: Standalone SCAC+Number (Strict Fallback)
    // Matches: 4 letters + 7-12 digits (e.g. MAEU123456789)
    if (!extractedBl) {
        const strictRegex = /\b([A-Z]{4})[\s-]*([0-9]{7,12})\b/gi;
        const strictMatches = [...cleanText.matchAll(strictRegex)];
        if (strictMatches.length > 0) {
            extractedBl = (strictMatches[0][1] + strictMatches[0][2]).toUpperCase();
        }
    }

    // --- CONTAINER EXTRACTION ---
    let extractedContainer = "";

    // ISO 6346: 4 letters + 7 digits
    const contRegex = /\b([A-Z]{4})[\s-]*([0-9]{7})\b/gi;
    const blClean = extractedBl.replace(/[^A-Z0-9]/g, '');

    // 1. Try Standard (Handles "TCKU 1234567")
    const matches = [...cleanText.matchAll(contRegex)];
    for (const m of matches) {
        const fullCont = (m[1] + m[2]).toUpperCase();
        if (fullCont !== blClean) {
            extractedContainer = fullCont;
            break;
        }
    }

    return {
        extractedBl: extractedBl,
        extractedContainer: extractedContainer
    };
};
