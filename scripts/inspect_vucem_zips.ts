
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';

const zipFiles = [
    'vucem/Consulta de Edocument por WS pruebas/XSD Y WSDL.zip',
    'vucem/Insumos consulta de Documentos Digitalizados Certificados por Web Services/Servicio Edocumentt.zip',
    'vucem/WSDL ZIP/ConsultarRespuestaCove.wsdl' // Just to check path resolvalbe
];

const analyze = async () => {
    for (const zipPath of zipFiles) {
        if (!zipPath.endsWith('.zip')) continue;
        console.log(`\n\n--- Analyzing ZIP: ${zipPath} ---`);
        try {
            if (!fs.existsSync(zipPath)) {
                console.log("File not found");
                continue;
            }
            const data = fs.readFileSync(zipPath);
            const zip = await JSZip.loadAsync(data);

            for (const [filename, file] of Object.entries(zip.files)) {
                console.log(`[FILE] ${filename}`);
                if (filename.endsWith('.wsdl') || filename.endsWith('.xsd')) {
                    const content = await file.async('string');
                    console.log(content.substring(0, 500));
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
    }
};

analyze();
