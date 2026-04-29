// ─────────────────────────────────────────────────────────────────────────────
// sellosUploadService.ts
// Servicio EXCLUSIVO del módulo Handheld Sellos.
// NO comparte script ni carpeta con Payments ni SaldoFianza.
// ─────────────────────────────────────────────────────────────────────────────

// Usa el mismo GAS endpoint que Payments — los archivos van a la carpeta de Sellos.
const SELLOS_GAS_URL = 'https://script.google.com/macros/s/AKfycbwhFSKJLdMSW340Vuy_lgmIKVwqzwhz8ImrcGVnqDJ0nVWVEW-dPgZjdOTf80x79KkXpw/exec';

// Carpeta de Drive donde se guardan las fotos de evidencia de sellos
export const SELLOS_FOLDER_ID = '1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X';

// Timeout de 120s (fotos pueden ser pesadas)
const UPLOAD_TIMEOUT_MS = 120_000;

export interface SellosFileResult {
    id: string;
    webViewLink: string;
    name: string;
}

// Convierte File a Base64 puro (sin prefijo data:...)
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
    });

/**
 * Sube una foto de evidencia de sello a Google Drive via GAS.
 * @param file     Archivo de imagen
 * @param filename Nombre final en Drive (e.g. "sello_PCG01_1234567890.jpg")
 */
export const uploadSelloPhoto = async (
    file: File,
    filename: string
): Promise<SellosFileResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        const base64Content = await fileToBase64(file);

        const payload = {
            filename,
            mimeType: file.type || 'image/jpeg',
            bytes: base64Content,
            description: `Sello evidencia - ${filename}`,
            folderId: SELLOS_FOLDER_ID
        };

        const response = await fetch(SELLOS_GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(`GAS respondió ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === 'error') {
            throw new Error(result.message || 'El GAS reportó un error interno');
        }

        return {
            id: result.id || '',
            webViewLink: result.webViewLink || result.url || result.fileUrl || '',
            name: result.name || filename
        };

    } catch (error: any) {
        clearTimeout(timer);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: el GAS de Sellos no respondió en 120 segundos');
        }
        throw new Error('Upload foto fallido: ' + (error.message || 'Error desconocido'));
    }
};
