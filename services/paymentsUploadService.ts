// ─────────────────────────────────────────────────────────────────────────────
// paymentsUploadService.ts
// Servicio EXCLUSIVO del módulo Payments (Controller).
// NO comparte script ni carpeta con SaldoFianza.
// ─────────────────────────────────────────────────────────────────────────────

// TODO: Reemplaza esta URL con el deployment del GAS específico de Payments.
// Para obtenerla: script.google.com → Deploy → Manage Deployments → copiar /exec URL
const PAYMENTS_GAS_URL = 'https://script.google.com/macros/s/AKfycbwhFSKJLdMSW340Vuy_lgmIKVwqzwhz8ImrcGVnqDJ0nVWVEW-dPgZjdOTf80x79KkXpw/exec';

// Carpeta destino en Drive para todos los archivos de Payments
export const PAYMENTS_FOLDER_ID = '1saSKQQFvFvvk1zGA4mJaNUdcFtMiDvXl';

// Timeout de 60s para evitar peticiones colgadas
const UPLOAD_TIMEOUT_MS = 120_000;

export interface PaymentsFileResult {
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
 * Sube un archivo a la carpeta de Payments en Google Drive via GAS.
 * @param file    Archivo a subir
 * @param filename Nombre final del archivo en Drive
 */
export const uploadPaymentFile = async (
    file: File,
    filename: string
): Promise<PaymentsFileResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        const base64Content = await fileToBase64(file);

        const payload = {
            filename,
            mimeType: file.type,
            bytes: base64Content,
            description: `Payments - ${filename}`,
            folderId: PAYMENTS_FOLDER_ID
        };

        const response = await fetch(PAYMENTS_GAS_URL, {
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
            throw new Error('Timeout: el GAS no respondió en 60 segundos');
        }
        throw new Error('Upload fallido: ' + (error.message || 'Error desconocido'));
    }
};
