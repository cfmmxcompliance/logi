const fs = require('fs');

const data510 = fs.readFileSync('extracted_zip/1901508_510.asc', 'utf8').split('\n');
const data557 = fs.readFileSync('extracted_zip/1901508_557.asc', 'utf8').split('\n');

const summary510 = {};
const summary557 = {};

// 510: Patente|Pedimento|SeccionAduanera|ClaveContribucion|FormaPago|ImportePago|TipoPedimento|FechaPagoReal
data510.forEach((line, i) => {
    if (i === 0 || !line.trim()) return;
    const parts = line.split('|');
    if (parts.length < 6) return;
    const clave = parts[3].trim();
    const fp = parts[4].trim();
    const importe = parseFloat(parts[5]) || 0;
    
    const key = `${clave}-${fp}`;
    summary510[key] = (summary510[key] || 0) + importe;
});

// 557: Patente|Pedimento|SeccionAduanera|Fraccion|SecuenciaFraccion|ClaveContribucion|FormaPago|ImportePago|FechaPagoReal
data557.forEach((line, i) => {
    if (i === 0 || !line.trim()) return;
    const parts = line.split('|');
    if (parts.length < 8) return;
    const clave = parts[5].trim();
    const fp = parts[6].trim();
    const importe = parseFloat(parts[7]) || 0;
    
    const key = `${clave}-${fp}`;
    summary557[key] = (summary557[key] || 0) + importe;
});

console.log("=== RESUMEN ARCHIVO 510.asc (A nivel pedimento) ===");
console.log("Clave | Forma Pago | Importe Total");
for (const [k, v] of Object.entries(summary510)) {
    console.log(`${k.padEnd(19)} | ${v.toFixed(2)}`);
}

console.log("\n=== RESUMEN ARCHIVO 557.asc (A nivel partida) ===");
console.log("Clave | Forma Pago | Importe Total");
for (const [k, v] of Object.entries(summary557)) {
    console.log(`${k.padEnd(19)} | ${v.toFixed(2)}`);
}
