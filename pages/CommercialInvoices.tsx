import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import * as XLSX_Basic from 'xlsx/dist/xlsx.mini.min.js';
import { Upload, FileDown, Search, Plus, Trash2, Edit2, X, Check, FileSpreadsheet, AlertCircle, FileText, CheckCircle, Save } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { CommercialInvoiceItem } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotification } from '../context/NotificationContext.tsx';
import { downloadFile } from '../utils/fileHelpers.ts';
import { LOGO_BASE64 } from '../src/constants/logo.ts';


export const CommercialInvoices: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
    const { showNotification } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [items, setItems] = useState<CommercialInvoiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [editingItem, setEditingItem] = useState<CommercialInvoiceItem | null>(null);
    const [incotermLabel, setIncotermLabel] = useState<string>(''); // Capture footer label

    // Container Logic
    const [showContainerModal, setShowContainerModal] = useState(false);
    const [tempContainerNo, setTempContainerNo] = useState('');
    const [pendingFileItems, setPendingFileItems] = useState<CommercialInvoiceItem[]>([]);



    // Stats
    const [stats, setStats] = useState({
        totalItems: 0,
        inCount: 0,
        a1Count: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const data = storageService.getInvoiceItems();
        setItems(data);
        setLoading(false);
        updateStats(data);
    };

    const updateStats = (data: CommercialInvoiceItem[]) => {
        setStats({
            totalItems: data.length,
            inCount: data.filter(i => i.regimen !== 'A1').length,
            a1Count: data.filter(i => i.regimen === 'A1').length
        });
    };



    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        let importCount = 0;
        let pendingAggregate: CommercialInvoiceItem[] = [];
        let errors: string[] = [];

        // Helper: Parse Currency
        const parseCurrency = (val: any) => {
            if (!val) return 0;
            const str = String(val).replace(/[$,]/g, '').trim();
            return parseFloat(str) || 0;
        };

        const processFile = (file: File): Promise<void> => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const buffer = evt.target?.result as ArrayBuffer;
                        const wb = XLSX_Basic.read(buffer, { type: 'array' });
                        const wsname = wb.SheetNames[0];
                        const ws = wb.Sheets[wsname];
                        const data: any[][] = XLSX_Basic.utils.sheet_to_json(ws, { header: 1 });

                        // Header Detection
                        let headerRowIndex = -1;
                        // @ts-ignore
                        for (let i = 0; i < Math.min(data.length, 30); i++) {
                            // @ts-ignore
                            const rowStr = (data[i] || []).join(' ').toUpperCase();
                            if (rowStr.includes('ITEM') && rowStr.includes('PART')) {
                                headerRowIndex = i;
                                break;
                            }
                        }

                        if (headerRowIndex === -1) {
                            errors.push(`${file.name}: Could not find header row.`);
                            resolve(); return;
                        }

                        // Map Columns
                        // @ts-ignore
                        const headers = (data[headerRowIndex] as any[]).map(String);
                        const colMap: Record<string, number> = {};
                        const requiredCols = ['ITEM', 'MODEL', 'PART NO', 'ENGLISH NAME', 'SPANISH DESCRIPTION', 'HTS', 'PROSEC', 'RB', 'QTY', 'UM', 'NETWEIGHT', 'UNIT PRICE', 'TOTAL AMOUNT', 'REGIMEN'];

                        requiredCols.forEach(col => {
                            let idx = headers.findIndex(h => h.toUpperCase().replace('.', '').trim() === col.replace('.', '').trim());
                            if (idx === -1) {
                                const hUpper = headers.map(h => h.toUpperCase());
                                if (col === 'SPANISH DESCRIPTION') idx = hUpper.findIndex(h => h.includes('DESCRIP') && h.includes('ES'));
                                else if (col === 'ENGLISH NAME') idx = hUpper.findIndex(h => h.includes('ENGLISH') || h.includes('NAME'));
                                else if (col === 'UNIT PRICE') {
                                    idx = hUpper.findIndex(h => h.includes('PRICE'));
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('UNIT') && h.includes('USD'));
                                } else if (col === 'TOTAL AMOUNT') {
                                    idx = hUpper.findIndex(h => h.includes('AMOUNT'));
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('TOTAL') && h.includes('USD'));
                                }
                            }
                            if (idx !== -1) colMap[col] = idx;
                        });

                        // Metadata (Invoice, Date)
                        let invoiceNo = '';
                        let invoiceDate = new Date().toISOString().split('T')[0];
                        for (let r = 0; r < headerRowIndex; r++) {
                            // @ts-ignore
                            const row = data[r] || [];
                            for (let c = 0; c < row.length; c++) {
                                const cell = String(row[c] || '');
                                if (cell.includes('INVOICE NO')) {
                                    const parts = cell.split(':');
                                    if (parts[1]) invoiceNo = parts[1].trim();
                                }
                                if (cell.includes('DATE :')) {
                                    const parts = cell.split(':');
                                    if (parts[1]) invoiceDate = parts[1].trim();
                                }
                            }
                        }

                        // Parse Rows
                        const newItems: CommercialInvoiceItem[] = [];
                        let parsedIncoterm = '';

                        // @ts-ignore
                        for (let i = headerRowIndex + 1; i < data.length; i++) {
                            // @ts-ignore
                            const row = data[i];
                            if (!row || row.length === 0) continue;

                            const firstCell = String(row[0] || '').toUpperCase();
                            if (firstCell.includes('INCOTERM')) {
                                let label = String(row[0] || '').trim();
                                const val = String(row[1] || '').trim();
                                if (val) label += ' ' + val;
                                parsedIncoterm = label;
                                setIncotermLabel(label);
                                break;
                            }
                            if (firstCell.includes('SAY TOTAL') || firstCell.includes('TOTAL US DOLLAR')) break;

                            const partNoCode = row[colMap['PART NO']];
                            const itemCode = row[colMap['ITEM']];
                            if (!partNoCode && !itemCode) continue;
                            if (String(itemCode).toUpperCase().includes('TOTAL')) continue;

                            newItems.push({
                                id: crypto.randomUUID(),
                                invoiceNo: invoiceNo || 'UNKNOWN',
                                date: invoiceDate || new Date().toISOString().slice(0, 10),
                                item: row[colMap['ITEM']] || '',
                                model: row[colMap['MODEL']] || '',
                                partNo: row[colMap['PART NO']] || '',
                                englishName: row[colMap['ENGLISH NAME']] || '',
                                spanishDescription: row[colMap['SPANISH DESCRIPTION']] || '',
                                hts: row[colMap['HTS']] || '',
                                prosec: row[colMap['PROSEC']] || '',
                                rb: row[colMap['RB']] || '',
                                qty: Number(row[colMap['QTY']]) || 0,
                                um: row[colMap['UM']] || '',
                                netWeight: Number(row[colMap['NETWEIGHT']]) || 0,
                                unitPrice: parseCurrency(row[colMap['UNIT PRICE']]),
                                totalAmount: parseCurrency(row[colMap['TOTAL AMOUNT']]),
                                regimen: row[colMap['REGIMEN']]?.toString().toUpperCase() || '',
                                incoterm: ''
                            });
                        }

                        if (parsedIncoterm) {
                            newItems.forEach(i => i.incoterm = parsedIncoterm);
                        }

                        if (newItems.length > 0) {
                            const containerRegex = /[A-Z]{4}\d{7}/;
                            const match = file.name.match(containerRegex);

                            if (match) {
                                const containerNo = match[0];
                                // Duplicate Check
                                if (items.some(i => i.containerNo === containerNo)) {
                                    errors.push(`${file.name}: Container ${containerNo} already exists.`);
                                } else {
                                    const itemsWithContainer = newItems.map(i => ({ ...i, containerNo }));
                                    await storageService.addInvoiceItems(itemsWithContainer);
                                    importCount += itemsWithContainer.length;
                                }
                            } else {
                                // No container in filename -> Aggregate for manual entry
                                pendingAggregate.push(...newItems);
                            }
                        } else {
                            errors.push(`${file.name}: No valid items found.`);
                        }
                        resolve();
                    } catch (err) {
                        console.error(err);
                        errors.push(`${file.name}: Parse error.`);
                        resolve();
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        };

        // Process all files
        await Promise.all(files.map(processFile));

        // Post-process
        if (importCount > 0) {
            loadData();
            showNotification('Batch Import', `Successfully imported ${importCount} items found in ${files.length} files.`, 'success');
        }

        if (pendingAggregate.length > 0) {
            setPendingFileItems(pendingAggregate);
            setTempContainerNo('');
            setShowContainerModal(true);
            showNotification('Manual Entry Needed', `${pendingAggregate.length} items need a Container Number.`, 'info');
        }

        if (errors.length > 0) {
            // Show first few errors
            showNotification('Import Warnings', errors.slice(0, 3).join(' | '), 'warning');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- REUSABLE EXPORT FUNCTION (ExcelJS) ---
    const exportToExcelStamped = async (data: CommercialInvoiceItem[], filename: string) => {
        const meta = (data[0] || {}) as Partial<CommercialInvoiceItem>;
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Invoice');

        // --- COLUMNS ---
        ws.columns = [
            { width: 15 }, // A (Item)
            { width: 25 }, // B (Model)
            { width: 25 }, // C (PartNo)
            { width: 25 }, // D (Eng Name)
            { width: 30 }, // E (Desc)
            { width: 15 }, // F (HTS)
            { width: 10 }, // G (Prosec)
            { width: 8 },  // H (RB)
            { width: 10 }, // I (Qty)
            { width: 8 },  // J (UM)
            { width: 12 }, // K (NetWt)
            { width: 15 }, // L (Total NetWt)
            { width: 15 }, // M (Price)
            { width: 15 }, // N (Amount)
            { width: 10 }  // O (Regimen)
        ];

        // --- LOGO ---
        const logoId = workbook.addImage({
            base64: LOGO_BASE64,
            extension: 'png',
        });
        // Place logo roughly in A1:C4 area (Scaled to reference)
        ws.addImage(logoId, {
            tl: { col: 0, row: 0 },
            ext: { width: 280, height: 60 }
        });

        // --- COMPANY HEADER (Centered) ---
        // We'll push text down or alongside. Logo is top-left.
        // Let's put text starting Row 1, but centered across columns?
        // Row 1 (Index 1 in ExcelJS)

        const titleRow = ws.getRow(1);
        titleRow.getCell(5).value = "ZHEJIANG CFMOTO POWER CO., LTD";
        titleRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        titleRow.getCell(5).font = { bold: true, size: 14, name: 'Arial' };
        ws.mergeCells('E1:N1');

        const addr1 = ws.getRow(2);
        addr1.getCell(5).value = "NO.116, WUZHOU ROAD, YUHANG ECONOMIC DEVELOPMENT ZONE,";
        addr1.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E2:N2');

        const addr2 = ws.getRow(3);
        addr2.getCell(5).value = "HANGZHOU 311100, ZHEJIANG PROVINCE, P.R. CHINA";
        addr2.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E3:N3');

        const contact = ws.getRow(4);
        contact.getCell(5).value = "TEL: 0086-57189265787 FAX: 0086-57189265788";
        contact.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E4:N4');

        // Row 5: TITLE
        const mainTitle = ws.getRow(5);
        mainTitle.getCell(1).value = "COMMERCIAL INVOICE";
        mainTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        mainTitle.getCell(1).font = { bold: true, underline: true, size: 12, name: 'Arial' };
        ws.mergeCells('A5:N5');

        // Row 6: Empty

        // --- INFO BLOCKS (Row 7+) / Index 7
        // Prepare Data
        const importerLines = [
            "IMPORTADOR: CFMOTO MEXICO POWER S. DE R.L. DE C.V.",
            "DIRECCIÓN FISCAL: CALLE TECNOLOGIA",
            "No. EXT. 107 CIUDAD APODACA C.P. 66628",
            "COLONIA: VYNMSA APODACA INDUSTRIAL PARK",
            "NUEVO LEON, MEXICO",
            "(ESTADOS UNIDOS MEXICANOS)",
            "RFC: CMP220712ND9.",
            "TEL:+52 8119640554",
            "SHIPPED PER: BY SEA"
        ];
        const providerLines = [
            "PROVEEDOR: ZHEJIANG CFMOTO POWER CO., LTD",
            "DIRECCIÓN: WUZHOU ROAD, YUHANG ECONOMIC",
            "DEVELOPMENT ZONE No.EXT. 116 C.P. 311100",
            "HANGZHOU ZHEJIANG, CHINA (REPUBLICA POPULAR)",
            "TAX ID: 91330100757206158J",
            "", "", "", ""
        ];
        const invoiceLines = [
            `INVOICE NO: ${meta.invoiceNo || ''}`,
            "PAYMENT: T/T",
            `DATE: ${meta.date || ''}`,
            "SHIPPED FROM: NINGBO, CHINA",
            "TO MANZANILLO, MEXICO",
            "", "", "", ""
        ];

        const startRow = 7;
        const maxLines = Math.max(importerLines.length, providerLines.length, invoiceLines.length);

        for (let i = 0; i < maxLines; i++) {
            const r = ws.getRow(startRow + i);

            // Col A-C (Importer)
            if (importerLines[i]) {
                r.getCell(1).value = importerLines[i];
                r.getCell(1).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`A${startRow + i}:C${startRow + i}`);
            }

            // Col E-G (Provider)
            if (providerLines[i]) {
                r.getCell(5).value = providerLines[i];
                r.getCell(5).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`E${startRow + i}:G${startRow + i}`);
            }

            // Col I-K (Invoice)
            if (invoiceLines[i]) {
                r.getCell(9).value = invoiceLines[i];
                r.getCell(9).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`I${startRow + i}:K${startRow + i}`);
            }
        }

        // --- HEADERS (Row startRow + maxLines + 2) ---
        const tableHeaderRowIdx = startRow + maxLines + 1;
        const headerRow = ws.getRow(tableHeaderRowIdx);
        const sortedHeaders = [
            "ITEM", "MODEL", "PART NO.", "ENGLISH NAME", "DESCRIPCION(ES)",
            "HTS", "PROSEC", "RB", "QTY", "U-M",
            "NETWEIGHT", "TOTAL NETWEIGHT", "PRICE(USD)", "AMOUNT(USD)", "REGIMEN"
        ];
        sortedHeaders.forEach((h, idx) => {
            const cell = headerRow.getCell(idx + 1);
            cell.value = h;
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // --- DATA ---
        let currentRowIdx = tableHeaderRowIdx + 1;
        data.forEach(item => {
            const r = ws.getRow(currentRowIdx);
            const values = [
                item.item, item.model, item.partNo, item.englishName, item.spanishDescription,
                item.hts, item.prosec, item.rb, item.qty, item.um,
                item.netWeight,
                parseFloat(((item.netWeight || 0) * (item.qty || 0)).toFixed(2)),
                parseFloat(item.unitPrice?.toString() || '0'),
                parseFloat(item.totalAmount?.toString() || '0'),
                item.regimen
            ];

            values.forEach((v, idx) => {
                const cell = r.getCell(idx + 1);
                cell.value = v;

                // Alignment
                if (idx === 0 || idx === 1 || idx === 2 || idx === 3 || idx === 4) cell.alignment = { horizontal: 'left', wrapText: true }; // Texts
                else cell.alignment = { horizontal: 'center', vertical: 'middle' };

                // Number Format
                // Number Format
                if (idx >= 11 && idx <= 13) { // TotalNetWt, Price, Amount
                    cell.numFmt = '0.00';
                }

                // Border
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            currentRowIdx++;
        });

        // --- FOOTER ---
        const footerRowIdx = currentRowIdx;
        const fRow = ws.getRow(footerRowIdx);

        // Incoterm (Footer)
        const fullIncoterm = meta.incoterm || incotermLabel || "";
        const cleanCode = fullIncoterm.replace(/INCOTERM/i, '').replace(/:/g, '').trim().split(' ')[0];

        fRow.getCell(1).value = "INCOTERM:";
        fRow.getCell(1).font = { bold: true };
        fRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Place Code next to label (Cell B)
        if (cleanCode) {
            fRow.getCell(2).value = cleanCode;
            fRow.getCell(2).font = { bold: true };
            fRow.getCell(2).alignment = { horizontal: 'left' };
            fRow.getCell(2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        } else {
            // Fallback if empty to full string in A if needed, but user wants split
            fRow.getCell(1).value = fullIncoterm || "INCOTERM:";
        }
        fRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Total Qty (Col 9 / I)
        const totalQty = data.reduce((sum, item) => sum + (item.qty || 0), 0);
        const qtyCell = fRow.getCell(9);
        qtyCell.value = totalQty;
        qtyCell.font = { bold: true };
        qtyCell.alignment = { horizontal: 'center' };
        qtyCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Total Amount (Col 14 / N)
        const totalAmount = data.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
        const amtCell = fRow.getCell(14);
        amtCell.value = totalAmount; // ExcelJS handles number type
        amtCell.numFmt = '0.00';
        amtCell.font = { bold: true };
        amtCell.alignment = { horizontal: 'center' };
        amtCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // --- GENERATE & DOWNLOAD ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadFile(blob, filename);
    };

    const handleSplitAndExport = () => {
        if (items.length === 0) return;

        // Split logic
        const a1Items = items.filter(i => i.regimen === 'A1').map(i => ({
            ...i,
            invoiceNo: i.invoiceNo.endsWith('-A1') ? i.invoiceNo : `${i.invoiceNo}-A1`
        }));

        const standardItems = items.filter(i => i.regimen !== 'A1');

        if (a1Items.length > 0) {
            const suffix = a1Items[0]?.containerNo || new Date().toISOString().split('T')[0];
            exportToExcelStamped(a1Items, `Commercial_Invoice_A1_${suffix}.xlsx`);
        }

        if (standardItems.length > 0) {
            const suffix = standardItems[0]?.containerNo || new Date().toISOString().split('T')[0];
            exportToExcelStamped(standardItems, `Commercial_Invoice_IN_${suffix}.xlsx`);
        }
    };

    const handleExportFiltered = () => {
        if (filteredItems.length === 0) {
            showNotification('Export Info', "No items to export (current filter is empty).", 'info');
            return;
        }
        const suffix = filteredItems[0]?.containerNo || new Date().toISOString().split('T')[0];
        exportToExcelStamped(filteredItems, `Commercial_Invoice_Filtered_${suffix}.xlsx`);
    };

    // --- CSV EXPORT CORREGIDO (Adiós a la basura de antigravity) ---
    const handleExportCSV = () => {
        let itemsToExport = items;
        if (selectedIds.size > 0) itemsToExport = items.filter(i => selectedIds.has(i.id));
        else if (searchTerm) itemsToExport = filteredItems;


        if (!itemsToExport || itemsToExport.length === 0) {
            showNotification('Export Info', "No data to export.", 'info');
            return;
        }

        try {
            // 1. Mapeo EXPLICITO: Evitamos que se filtre el campo 'id' (UUID) al CSV
            const rows = itemsToExport.map(item => ({
                'INVOICE NO': String(item.invoiceNo || ''),
                'DATE': item.date || '',
                'ITEM': item.item || '',
                'MODEL': item.model || '',
                'PART NO': item.partNo || '',
                'ENGLISH NAME': item.englishName || '',
                'SPANISH DESCRIPTION': item.spanishDescription || '',
                'HTS': item.hts || '',
                'PROSEC': item.prosec || '',
                'RB': item.rb || '',
                'QTY': item.qty || 0,
                'UM': item.um || '',
                'NETWEIGHT': item.netWeight || 0,
                'UNIT PRICE': item.unitPrice || 0,
                'TOTAL AMOUNT': item.totalAmount || 0,
                'REGIMEN': item.regimen || ''
            }));

            // 2. Generación usando exclusivamente la versión mini para evitar conflictos
            const ws = XLSX_Basic.utils.json_to_sheet(rows);
            const csvContent = XLSX_Basic.utils.sheet_to_csv(ws);

            if (!csvContent) {
                throw new Error("CSV Content is empty");
            }

            // 3. Preparación del archivo con BOM (para que Excel no rompa los acentos)
            const BOM = '\uFEFF';
            // Aseguramos el tipo MIME exacto
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });

            // 4. Descarga forzada (Método robusto)
            downloadFile(blob, 'Commercial_Invoice_Export.csv');

            showNotification('Success', "CSV exported successfully", 'success');

            showNotification('Success', "CSV exported successfully", 'success');

        } catch (error) {
            console.error("Critical Export Error:", error);
            showNotification('Export Error', "Failed to generate CSV. Check console.", 'error');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const confirmBulkDelete = async () => {
        await storageService.deleteInvoiceItems(Array.from(selectedIds));
        loadData(); // REFRESH UI
        setSelectedIds(new Set());
        setBulkDeleteModal(false);
        showNotification('Deleted', `Deleted ${selectedIds.size} items.`, 'success');
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this item?")) {
            await storageService.deleteInvoiceItem(id);
            loadData(); // REFRESH UI
            showNotification('Deleted', "Item deleted.", 'success');
        }
    };

    const confirmContainerInput = async () => {
        if (!tempContainerNo) {
            showNotification('Input Required', "Please enter a Container/Guide Number.", 'warning');
            return;
        }

        const itemsWithContainer = pendingFileItems.map(i => ({ ...i, containerNo: tempContainerNo }));
        await storageService.addInvoiceItems(itemsWithContainer);
        loadData(); // REFRESH UI
        showNotification('Import Successful', `Successfully imported ${itemsWithContainer.length} items with Container ${tempContainerNo}.`, 'success');

        setPendingFileItems([]);
        setTempContainerNo('');
        setShowContainerModal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const filteredItems = items.filter(i => {
        if (!searchTerm) return true;
        const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        if (terms.length === 0) return true;

        // AND Logic: Item must match ALL terms
        return terms.every(term =>
            i.invoiceNo.toLowerCase().includes(term) ||
            i.partNo.toLowerCase().includes(term) ||
            i.model.toLowerCase().includes(term) ||
            i.englishName.toLowerCase().includes(term) ||
            i.regimen.toLowerCase().includes(term) ||
            (i.containerNo || '').toLowerCase().includes(term)
        );
    });

    return (
        <div className="space-y-6">


            {/* Header and Stats */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Commercial Invoices</h1>
                    <p className="text-slate-500">Manage and split commercial invoices by regimen</p>
                </div>
                <div className="flex gap-4">
                    {/* Stats Cards */}
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Total Items</p>
                        <p className="text-xl font-bold text-blue-600">{stats.totalItems}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Standard</p>
                        <p className="text-xl font-bold text-emerald-600">{stats.inCount}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">A1 Regimen</p>
                        <p className="text-xl font-bold text-purple-600">{stats.a1Count}</p>
                    </div>
                </div>
            </div>

            {/* Actions Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by Invoice, Part No, or Model..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {selectedIds.size > 0 && isAdmin && (
                        <button
                            onClick={() => setBulkDeleteModal(true)}
                            className="bg-red-50 text-red-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors"
                        >
                            <Trash2 size={18} /> Delete Selected ({selectedIds.size})
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls"
                        multiple
                        className="hidden"
                    />

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors"
                        title="Export filtered results to CSV"
                    >
                        <FileDown size={18} /> Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 transition-colors"
                    >
                        <Upload size={18} /> Import Excel
                    </button>
                    <button
                        onClick={handleExportFiltered}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
                        title="Export current filter results to Styled Excel"
                    >
                        <FileSpreadsheet size={18} /> Export Filtered
                    </button>
                    <button
                        onClick={handleSplitAndExport}
                        disabled={items.length === 0}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${items.length === 0
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                    >
                        <FileSpreadsheet size={18} /> Split & Export Items
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                            <tr>
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        onChange={handleSelectAll}
                                        checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                                        className="rounded border-slate-300"
                                    />
                                </th>
                                <th className="p-4">Invoice No</th>
                                <th className="p-4">Container/Guide</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Regimen</th>
                                <th className="p-4">Incoterm</th>
                                <th className="p-4">Part No</th>
                                <th className="p-4">Model</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Qty</th>
                                <th className="p-4 text-right">Unit Price</th>
                                <th className="p-4 text-right">Total</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={11} className="p-8 text-center text-slate-400">Loading...</td></tr>
                            ) : filteredItems.length === 0 ? (
                                <tr><td colSpan={11} className="p-8 text-center text-slate-400">No invoice items found. Import an Excel file to get started.</td></tr>
                            ) : (
                                filteredItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(item.id)}
                                                onChange={() => handleSelectRow(item.id)}
                                                className="rounded border-slate-300"
                                            />
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">{item.invoiceNo}</td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">{item.containerNo || '-'}</td>
                                        <td className="p-4 text-slate-600 whitespace-nowrap">{item.date}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.regimen === 'A1'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {item.regimen}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {(item.incoterm || '').replace(/INCOTERM/i, '').replace(/:/g, '').trim().split(' ')[0]}
                                        </td>
                                        <td className="p-4 text-slate-600">{item.partNo}</td>
                                        <td className="p-4 text-slate-600">{item.model}</td>
                                        <td className="p-4 text-slate-600 max-w-xs truncate" title={item.englishName}>{item.englishName}</td>
                                        <td className="p-4 text-right font-mono">{item.qty}</td>
                                        <td className="p-4 text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right font-mono font-medium">${item.totalAmount.toFixed(2)}</td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk Delete Modal */}
            {bulkDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Deletion</h3>
                        <p className="text-slate-600 mb-6">
                            Are you sure you want to delete {selectedIds.size} selected items? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setBulkDeleteModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmBulkDelete}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg"
                            >
                                Delete {selectedIds.size} Items
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Container Input Modal */}
            {showContainerModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 mb-4 text-blue-600">
                            <Search size={24} />
                            <h3 className="text-xl font-bold text-slate-800">Container Not Found</h3>
                        </div>

                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                            <p className="text-blue-800 text-sm">
                                Could not find a Container Number in the filename (Pattern: 4 Letters + 7 Digits).
                                <br />
                                Please enter it manually to assign it to <b>{pendingFileItems.length} items</b>.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Container / Guide Number
                            </label>
                            <input
                                type="text"
                                autoFocus
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase font-mono"
                                placeholder="e.g. MSKU1234567"
                                value={tempContainerNo}
                                onChange={(e) => setTempContainerNo(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && confirmContainerInput()}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowContainerModal(false);
                                    setPendingFileItems([]);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                Cancel Import
                            </button>
                            <button
                                onClick={confirmContainerInput}
                                disabled={!tempContainerNo}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Save size={18} /> Save & Import
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
