
const block = `
ITEM: 1
...
OBSERVACIONES A NIVEL PARTIDA
0010-013010-0010
25CFTT176694-3 IN
IDENTIF.
...
`;

console.log("Testing Regex on Block...");

// Extract OBSERVACIONES block
const obsMatch = block.match(/OBSERVACIONES(?:\s*A\s*NIVEL\s*PARTIDA)?(.*?)(?:$|\||IDENTIF)/is);
if (obsMatch) {
    const observationsBlock = obsMatch[1];
    console.log("Extracted Block:", observationsBlock.trim());

    // A) Part Number Regex
    const obsPartMatch = observationsBlock.match(/\b([A-Z0-9]{4,}-[A-Z0-9]{4,}-[A-Z0-9]{4,})\b/);
    if (obsPartMatch) {
        console.log("✅ FOUND Part Number:", obsPartMatch[1]);
    } else {
        console.log("❌ Part Number NOT FOUND");
    }

    // B) Invoice Number Regex
    const obsInvMatch = observationsBlock.match(/\b([A-Z0-9-]{5,})\s*IN\b/i);
    if (obsInvMatch) {
        console.log("✅ FOUND Invoice Number:", obsInvMatch[1]);
    } else {
        console.log("❌ Invoice Number NOT FOUND");
    }
} else {
    console.log("❌ OBSERVACIONES Block NOT FOUND");
}
