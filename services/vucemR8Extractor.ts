import * as XLSX from 'xlsx';

export interface VucemR8Row {
    NUMERO_DE_REGLA_8VA: string;
    DESCRIPCION: string;
    CANTIDAD_AUTORIZADA: number;
    CANTIDAD_EJERCIDA: number;
    VALOR_AUTORIZADO: number;
    VALOR_EJERCIDO: number;
}

class VucemR8Extractor {
    public extractFromExcel(file: File): Promise<VucemR8Row[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });

                    let targetSheet: any = null;
                    let targetRows: any[] = [];

                    for (const sName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sName];
                        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];
                        if (rows.length > 0 && ('NUMERO DE REGLA 8VA' in rows[0] || 'LLAVE' in rows[0] || rows[0]['NUMERO DE REGLA 8VA'] !== undefined)) {
                            // Check if it has the column we need
                            const hasRequiredColumns = rows.some(r => r['NUMERO DE REGLA 8VA'] !== undefined || r['CANTIDAD AUTORIZADA'] !== undefined);
                            if (hasRequiredColumns) {
                                targetSheet = sheet;
                                targetRows = rows;
                                break;
                            }
                        }
                    }

                    if (!targetSheet) {
                        throw new Error(`No se encontró ninguna hoja con las columnas de VUCEM (Ej. "NUMERO DE REGLA 8VA"). Hojas revisadas: ${workbook.SheetNames.join(', ')}`);
                    }

                    const parsedRows: VucemR8Row[] = targetRows.map(row => ({
                        NUMERO_DE_REGLA_8VA: String(row['NUMERO DE REGLA 8VA'] || '').trim(),
                        DESCRIPCION: String(row['DESCRIPCIÓN'] || '').trim(),
                        CANTIDAD_AUTORIZADA: Number(row['CANTIDAD AUTORIZADA']) || 0,
                        CANTIDAD_EJERCIDA: Number(row['CANTIDAD EJERCIDA']) || 0,
                        VALOR_AUTORIZADO: Number(row['VALOR AUTORIZADO']) || 0,
                        VALOR_EJERCIDO: Number(row['VALOR EJERCIDO']) || 0,
                    })).filter(r => r.NUMERO_DE_REGLA_8VA && r.DESCRIPCION); // Filtrar filas vacías

                    resolve(parsedRows);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = (error) => {
                reject(error);
            };

            reader.readAsArrayBuffer(file);
        });
    }
}

export const vucemR8Extractor = new VucemR8Extractor();
