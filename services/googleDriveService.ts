// Endpoint unificado para subida de archivos (Fix Embarques 14 Ago)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzxrqsni1b-fEdHHswrtW8K3oYbxEZMykC95d2gBz_VYtVoGWUI4e6GodWkBulwGP3R/exec';

const UPLOAD_TIMEOUT_MS = 120_000;

// Deprecated but kept for compatibility - No execution needed
export const initGoogleDrive = async () => { console.log("Google Drive via GAS (No Init Needed)"); };

// EnsureAuth is now a no-op that resolves immediately
export const ensureAuth = async () => { return "GAS_NO_AUTH_NEEDED"; };

export interface DriveFileResult {
    id: string;
    webViewLink: string;
    name: string;
}

// Convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // Remove "data:*/*;base64," prefix, if present
            if (result.includes(',')) {
                resolve(result.split(',')[1]);
            } else {
                resolve(result);
            }
        };
        reader.onerror = error => reject(error);
    });
};

// Upload via Google App Script (No Login Required for User)
export const uploadFileToDrive = async (file: File, description: string = '', folderId?: string): Promise<DriveFileResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        const base64Content = await fileToBase64(file);

        // description has historically been used as the filename in some calls
        const finalFilename = (description && description.includes('.')) ? description : file.name;

        const payload: any = {
            filename: finalFilename,
            mimeType: file.type || 'application/octet-stream',
            bytes: base64Content,
            description: description
        };

        if (folderId) {
            payload.folderId = folderId;
        }

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(`GAS Error ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === 'error') {
            throw new Error(result.message);
        }

        return {
            id: result.id || result.fileId || '',
            webViewLink: result.webViewLink || result.url || result.fileUrl || '',
            name: result.name
        };

    } catch (error: any) {
        clearTimeout(timer);
        console.error("Upload Failed", error);
        if (error.name === 'AbortError') {
            throw new Error("Upload Failed: Timeout (el servidor tardó más de 120s)");
        }
        throw new Error("Upload Failed: " + (error.message || "Unknown Error"));
    }
};

// Trash stub - not supported in public GAS mode without auth or extra logic
export const trashFile = async (fileId: string): Promise<void> => {
    console.warn("Trash File not supported in No-Auth GAS mode.");
};
