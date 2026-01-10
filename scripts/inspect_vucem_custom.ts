
import fs from 'fs';
import JSZip from 'jszip';

const zipPath = 'vucem/Insumos consulta de Documentos Digitalizados Certificados por Web Services/Servicio Edocumentt.zip';

const analyze = async () => {
    console.log(`\n\n--- Analyzing ZIP: ${zipPath} ---`);
    try {
        if (!fs.existsSync(zipPath)) {
            console.log("File not found");
            return;
        }
        const data = fs.readFileSync(zipPath);
        const zip = await JSZip.loadAsync(data);

        for (const [filename, file] of Object.entries(zip.files)) {
            console.log(`[FILE] ${filename}`);
            if (filename.endsWith('.wsdl') || filename.endsWith('.xsd')) {
                const content = await file.async('string');
                // Search for soap:address
                if (content.includes('soap:address')) {
                    const match = content.match(/location="([^"]+)"/);
                    console.log("   ENDPOINT FOUND:", match ? match[1] : "No location match");
                }
                if (content.includes('targetNamespace')) {
                    const match = content.match(/targetNamespace="([^"]+)"/);
                    console.log("   NAMESPACE FOUND:", match ? match[1] : "No namespace match");
                }
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
};

analyze();
