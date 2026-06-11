import { geminiService } from './geminiService.ts';

export interface ExtractedR8 {
    folio: string;
    issueDate: string;
    expirationDate: string;
    partNumber: string;
    description: string;
    originalTariffFraction: string;
    fraccionReglaOctava: string;
    unidadMedida: string;
    totalAuthorized: number;
    valorDolares?: number;
    permisoPrevio?: string;
}

export const r8Extractor = {
    extractFromPdf: async (file: File): Promise<ExtractedR8[]> => {
        try {
            const base64 = await toBase64(file);
            // Usamos Gemini 2.5 Flash para extraer los datos del Oficio de Regla 8va
            const extracted = await geminiService.extractR8Document(base64, file.type || 'application/pdf');
            
            // Validar y sanear el array devuelto
            if (!Array.isArray(extracted) || extracted.length === 0) {
                 throw new Error('No se encontraron fracciones o el documento no es válido.');
            }

            const mapped = extracted.map(item => {
                // Función auxiliar para parsear números sucios
                const parseNumber = (val: any, fallback: number) => {
                    if (val === undefined || val === null) return fallback;
                    const clean = String(val).replace(/[^0-9.-]+/g, '');
                    const num = Number(clean);
                    return isNaN(num) ? fallback : num;
                };

                return {
                    folio: item.folio || 'SIN_FOLIO',
                    issueDate: item.validFrom || item.issueDate || new Date().toISOString(),
                    expirationDate: item.validTo || item.expirationDate || new Date(Date.now() + 31536000000).toISOString(),
                    partNumber: item.partNumber || 'PENDIENTE',
                    description: item.description || 'Fracción extraída del oficio',
                    originalTariffFraction: item.originalTariffFraction || '00000000',
                    fraccionReglaOctava: item.fraccionReglaOctava || '',
                    unidadMedida: item.unidadMedida || 'Unidad',
                    totalAuthorized: parseNumber(item.totalAuthorized, 1000),
                    valorDolares: parseNumber(item.valorDolares, 0),
                    permisoPrevio: item.permisoPrevio || ''
                };
            });

            return mapped;

        } catch (error: any) {
            console.error('Error extracting from PDF with Gemini:', error);
            throw new Error('No se pudo leer el archivo PDF: ' + error.message);
        }
    }
};

const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // Quitamos el prefijo data:application/pdf;base64,
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
};
