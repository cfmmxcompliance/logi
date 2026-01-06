/**
 * CSV Parser Utility
 * 
 * Robustly parses CSV strings, handling:
 * - Quoted fields containing commas ("LastName, FirstName")
 * - Escaped quotes ("He said ""Hello""")
 * - Empty fields
 * 
 * Returns an array of string arrays (rows -> columns).
 */

export const parseCSV = (text: string): string[][] => {
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows: string[][] = [];

    // Regex for matching CSV fields:
    // 1. Quoted string: "..." (handling "" as escaped quote)
    // 2. OR Non-comma (and non-quote) characters
    // 3. OR Empty field (comma immediately followed by comma or newline)
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;

    let currentRow: string[] = [];
    let matches: RegExpExecArray | null;

    // Split by lines first to be safe with large files, then parse line by line
    // Actually, distinct line splitting handles newlines better in regex.
    // Let's use a standard state-machine approach or a proven split logic for robustness.

    const lines = normalized.split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;

        const row: string[] = [];
        let cursor = 0;
        let inQuote = false;
        let fieldStart = 0;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                let field = line.substring(fieldStart, i).trim();
                // Check if wrapped in quotes
                if (field.startsWith('"') && field.endsWith('"')) {
                    field = field.slice(1, -1).replace(/""/g, '"');
                }
                row.push(field);
                fieldStart = i + 1;
            }
        }

        // Last field
        let lastField = line.substring(fieldStart).trim();
        if (lastField.startsWith('"') && lastField.endsWith('"')) {
            lastField = lastField.slice(1, -1).replace(/""/g, '"');
        }
        row.push(lastField);

        if (row.length > 0) rows.push(row);
    }

    return rows;
};
