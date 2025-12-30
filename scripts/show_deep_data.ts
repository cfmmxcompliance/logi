
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'pedimentos_robust_results.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(rawData);

const largeFile = data.results.find((r: any) => r.fileName.includes('5005243'));

if (largeFile) {
    console.log(`File: ${largeFile.fileName}`);
    console.log(`Pedimento: ${largeFile.pedimento} / ${largeFile.patente}`);
    console.log(`Total Items Extracted: ${largeFile.items.length}`);

    if (largeFile.items.length > 0) {
        console.log("\n--- First Item ---");
        console.log(largeFile.items[0]);

        console.log("\n--- Last Item ---");
        console.log(largeFile.items[largeFile.items.length - 1]);
    }
} else {
    console.log("File not found in results.");
}
