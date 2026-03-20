import React, { useState, useEffect } from 'react';
import { FileDown, Search, Truck, Container } from 'lucide-react';
import ExcelJS from 'exceljs';
import { storageService } from '../services/storageService';
import { CommercialInvoiceItem, RawMaterialPart } from '../types';

export default function CCPBuilder() {
    const [allItems, setAllItems] = useState<CommercialInvoiceItem[]>([]);
    const [masterDataMap, setMasterDataMap] = useState<Record<string, RawMaterialPart>>({});
    const [containerToBL, setContainerToBL] = useState<Record<string, string>>({});
    const [containers, setContainers] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [itemCountsMap, setItemCountsMap] = useState<Record<string, number>>({});

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [manualData, setManualData] = useState({ pedimento: '', bl: '' });
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null);

    useEffect(() => {
        // Initial load
        loadData();

        // Subscribe to all changes in storageService (Master Data sync, Invoices sync, etc)
        const unsubscribe = storageService.subscribe(() => {
            const items = storageService.getInvoiceItems();
            const parts = storageService.getParts();
            const shipments = storageService.getShipments();
            const preAlerts = storageService.getPreAlerts();
            const vesselTracking = storageService.getVesselTracking();

            // Re-map BLs
            const blMap: Record<string, string> = {};
            shipments.forEach(s => s.containers.forEach(c => blMap[c] = s.blNo));
            vesselTracking.forEach(vt => {
                // @ts-ignore
                if (vt.blNo && vt.containerNo) blMap[vt.containerNo] = vt.blNo;
            });
            preAlerts.forEach(pa => {
                if (pa.bookingAbw) {
                    const containers = (pa as any).containers || pa.linkedContainers || [];
                    containers.forEach((c: any) => {
                        const cNum = typeof c === 'string' ? c : c.containerNo;
                        if (cNum) blMap[cNum] = pa.bookingAbw;
                    });
                }
            });

            // Re-map Master Data
            const map: Record<string, RawMaterialPart> = {};
            parts.forEach(part => {
                if (part.PART_NUMBER) map[part.PART_NUMBER] = part;
            });

            // Calculate Counts & Containers
            const counts: Record<string, number> = {};
            items.forEach(i => {
                if (i.containerNo) counts[i.containerNo] = (counts[i.containerNo] || 0) + 1;
            });

            // Batch update all states to minimize re-renders
            setContainerToBL(blMap);
            setMasterDataMap(map);
            setAllItems(items);
            setItemCountsMap(counts);
            setContainers(Object.keys(counts).sort());
        });

        return () => unsubscribe();
    }, []);

    const loadData = async () => {
        // Trigger Lazy Refresh from Storage/Cloud (much faster)
        await Promise.all([
            storageService.loadMasterData(),
            storageService.refreshInvoices()
        ]);
    };

    const handleGenerateClick = (container: string) => {
        // Find pedimento and BL from Customs Clearance data
        const customs = storageService.getCustomsClearance();
        const containerCustoms = customs.find(c => c.containerNo === container);

        const linkedPedimento = containerCustoms?.pedimentoNo || '';
        const linkedBL = containerToBL[container] || containerCustoms?.blNo || '';

        setManualData({ pedimento: linkedPedimento, bl: linkedBL });
        setSelectedContainer(container);
        setShowModal(true);
    };

    const handleConfirmGenerate = async () => {
        if (!selectedContainer) return;

        // Capture data from state before closing modal
        const container = selectedContainer;
        const ped = manualData.pedimento;
        const bl = manualData.bl;

        setShowModal(false);
        setSelectedContainer(null);

        try {
            // Re-fetch LATEST items from storage to ensure we have the most up-to-date data
            // (in case a background sync finished while the modal was open)
            const latestItems = storageService.getInvoiceItems().filter(i => i.containerNo === container);

            if (latestItems.length === 0) {
                alert("No items found for this container.");
                return;
            }

            await generateCCPExcel(container, latestItems, ped, bl);
        } catch (error) {
            console.error("Error generating CCP:", error);
            alert("Failed to generate Excel file.");
        }
    };

    // Helper to set cell value and basic style
    const setCell = (sheet: ExcelJS.Worksheet, address: string, value: any, styleType: 'header' | 'value' | 'label' | 'none' = 'none', align: Partial<ExcelJS.Alignment> = {}) => {
        const cell = sheet.getCell(address);
        cell.value = value;

        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        if (styleType === 'header') {
            // Dark Grey BG, White Text, Bold, Center
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Arial', size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...align };
        } else if (styleType === 'label') {
            // Dark Grey BG, White Text, Bold (Left aligned mostly)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Arial', size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, ...align };
        } else if (styleType === 'value') {
            // Light Blue BG
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; // Light blue
            cell.font = { color: { argb: 'FF000000' }, name: 'Arial', size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...align };
        } else {
            cell.font = { name: 'Arial', size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', ...align };
        }
    };

    const generateCCPExcel = async (containerNo: string, items: CommercialInvoiceItem[], manualPedimento: string, manualBL: string) => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('CCP');

        // --- Layout Setup matching Reference File ---
        sheet.columns = [
            { width: 20 }, // A: Client Label Start
            { width: 10 }, // B: Client Label End
            { width: 15 }, // C: Client Value Start
            { width: 10 }, // D
            { width: 10 }, // E: Client Value End
            { width: 15 }, // F: Address Label
            { width: 12 }, // G: Address Value Start / Service Label Start
            { width: 15 }, // H: Address Value End / Service Label End
            { width: 15 }, // I: RFC Label / Service Val Start
            { width: 8 },  // J: RFC Value / Service Val End
            { width: 18 }, // K: Date Label
            { width: 8 }  // L: Date Label / Service Val Start -End
        ];

        // Set Row 1 Height (User Request: "alto 63")
        sheet.getRow(1).height = 63;

        // --- ROW 1: HEADER STRIP (Client, Address, RFC, Date) ---
        sheet.mergeCells('A1:B1');
        setCell(sheet, 'A1', 'Cliente a quien se factura: Razon social', 'label', { horizontal: 'center' });
        sheet.mergeCells('C1:E1');
        setCell(sheet, 'C1', 'EAGLE EXPRESS CARGO SA DE CV', 'value');

        setCell(sheet, 'F1', 'Domicilio (completo)', 'label', { horizontal: 'center' });
        sheet.mergeCells('G1:H1');
        setCell(sheet, 'G1', 'NORTE 176, NO. 441, COL. MOCTEZUMA 2A SECCION, DEL. VENUSTIANO CARRANZA, CDMX, CP: 15530', 'value', { wrapText: true });

        setCell(sheet, 'I1', 'RFC', 'label', { horizontal: 'center' });
        setCell(sheet, 'J1', 'EEC1406167F9', 'value');

        setCell(sheet, 'K1', 'Fecha:', 'label', { horizontal: 'center' });

        // Replicate logic from CIExtractor: Use date from data or current ISO date
        const emissionDate = items[0]?.date || new Date().toISOString().split('T')[0];
        setCell(sheet, 'L1', emissionDate, 'value', { horizontal: 'center' });

        sheet.mergeCells('F3:I3');
        setCell(sheet, 'F3', 'Tipo de Servicio', 'header');

        const serviceRows = [
            { l: 'Nacional', v: '-' },
            { l: 'Internacional', v: 'IM' },
            { l: 'Distancia Recorrida (kms)', v: '-' },
            { l: 'No. de pedimento', v: manualPedimento },
            { l: 'Nombre del ejecutivo', v: 'AGUSTIN SANTILLAN' },
            { l: 'Referencia', v: '-' },
            { l: 'BL', v: manualBL },
            { l: 'Servicio', v: 'FLETE TERRESTRE' },
        ];

        let startRow = 4;
        serviceRows.forEach((row, idx) => {
            const r = startRow + idx;
            sheet.mergeCells(`F${r}:G${r}`);
            setCell(sheet, `F${r}`, row.l, 'label', { horizontal: 'left' });
            sheet.mergeCells(`H${r}:I${r}`);
            setCell(sheet, `H${r}`, row.v, 'value');
        });

        sheet.mergeCells('A13:G13');
        setCell(sheet, 'A13', 'Datos de Origen de la Mercancía (SSA,OCUPA,CONTECON, TIMSA, ETC)', 'header');
        sheet.mergeCells('H13:L13');
        setCell(sheet, 'H13', 'Datos de Destino de la Mercancía (dirección de entrega)', 'header');

        sheet.mergeCells('A14:C14'); setCell(sheet, 'A14', 'RFC Remitente', 'label');
        sheet.mergeCells('D14:G14'); setCell(sheet, 'D14', '', 'value');
        sheet.mergeCells('H14:I14'); setCell(sheet, 'H14', 'RFC Destinatario', 'label');
        sheet.mergeCells('J14:L14'); setCell(sheet, 'J14', 'CMP220712ND9', 'value');

        sheet.mergeCells('A15:C15'); setCell(sheet, 'A15', 'Nombre remitente', 'label');
        sheet.mergeCells('D15:G15'); setCell(sheet, 'D15', 'TERMINAL TIMSA', 'value');
        sheet.mergeCells('H15:I15'); setCell(sheet, 'H15', 'Nombre destinatario', 'label');
        sheet.mergeCells('J15:L15'); setCell(sheet, 'J15', 'CFMOTO MEXICO POWER, S. DE R.L. DE C.V.', 'value');

        sheet.getRow(16).height = 31;
        sheet.mergeCells('A16:C16'); setCell(sheet, 'A16', 'Número de identificación o registro fiscal (Num RegId Trib) remitente extranjero', 'label');
        sheet.mergeCells('D16:G16'); setCell(sheet, 'D16', '', 'value');
        sheet.mergeCells('H16:I16'); setCell(sheet, 'H16', 'Número de identificación o registro fiscal (Num RegId Trib) destinatario extranjero', 'label');
        sheet.mergeCells('J16:L16'); setCell(sheet, 'J16', 'CMP220712ND9', 'value');

        sheet.getRow(17).height = 31;
        sheet.mergeCells('A17:C17'); setCell(sheet, 'A17', 'País de Residencia Fiscal (remitente extranjero)', 'label');
        sheet.mergeCells('D17:G17'); setCell(sheet, 'D17', '', 'value');
        sheet.mergeCells('H17:I17'); setCell(sheet, 'H17', 'País de Residencia Fiscal (destinatario extranjero)', 'label');
        sheet.mergeCells('J17:L17'); setCell(sheet, 'J17', 'México', 'value');

        sheet.mergeCells('A18:C18'); setCell(sheet, 'A18', 'Calle', 'label');
        sheet.mergeCells('D18:G18'); setCell(sheet, 'D18', '', 'value');
        sheet.mergeCells('H18:I18'); setCell(sheet, 'H18', 'Calle', 'label');
        sheet.mergeCells('J18:L18'); setCell(sheet, 'J18', 'CALLE TECNOLOGIA', 'value');

        sheet.mergeCells('A19:C19'); setCell(sheet, 'A19', 'No exterior', 'label');
        sheet.mergeCells('D19:G19'); setCell(sheet, 'D19', '', 'value');
        sheet.mergeCells('H19:I19'); setCell(sheet, 'H19', 'No exterior', 'label');
        sheet.mergeCells('J19:L19'); setCell(sheet, 'J19', '107', 'value');

        sheet.mergeCells('A20:C20'); setCell(sheet, 'A20', 'No interior', 'label');
        sheet.mergeCells('D20:G20'); setCell(sheet, 'D20', '', 'value');
        sheet.mergeCells('H20:I20'); setCell(sheet, 'H20', 'No interior', 'label');
        sheet.mergeCells('J20:L20'); setCell(sheet, 'J20', '', 'value');

        sheet.getRow(21).height = 31;
        sheet.mergeCells('A21:C21'); setCell(sheet, 'A21', 'Colonia *', 'label');
        sheet.mergeCells('D21:G21'); setCell(sheet, 'D21', '', 'value');
        sheet.mergeCells('H21:I21'); setCell(sheet, 'H21', 'Colonia *', 'label');
        sheet.mergeCells('J21:L21'); setCell(sheet, 'J21', 'VYNMSA APODACA INDUSTRIAL PARK APODACA', 'value');

        sheet.mergeCells('A22:C22'); setCell(sheet, 'A22', 'Localidad *', 'label');
        sheet.mergeCells('D22:G22'); setCell(sheet, 'D22', '', 'value');
        sheet.mergeCells('H22:I22'); setCell(sheet, 'H22', 'Localidad *', 'label');
        sheet.mergeCells('J22:L22'); setCell(sheet, 'J22', '', 'value');

        sheet.mergeCells('A23:C23'); setCell(sheet, 'A23', 'Referencia', 'label');
        sheet.mergeCells('D23:G23'); setCell(sheet, 'D23', '', 'value');
        sheet.mergeCells('H23:I23'); setCell(sheet, 'H23', 'Referencia', 'label');
        sheet.mergeCells('J23:L23'); setCell(sheet, 'J23', '', 'value');

        sheet.mergeCells('A24:C24'); setCell(sheet, 'A24', 'Municipio *', 'label');
        sheet.mergeCells('D24:G24'); setCell(sheet, 'D24', '', 'value');
        sheet.mergeCells('H24:I24'); setCell(sheet, 'H24', 'Municipio *', 'label');
        sheet.mergeCells('J24:L24'); setCell(sheet, 'J24', 'APODACA', 'value');

        sheet.mergeCells('A25:C25'); setCell(sheet, 'A25', 'Estado *', 'label');
        sheet.mergeCells('D25:G25'); setCell(sheet, 'D25', '', 'value');
        sheet.mergeCells('H25:I25'); setCell(sheet, 'H25', 'Estado *', 'label');
        sheet.mergeCells('J25:L25'); setCell(sheet, 'J25', 'NUEVO LEÓN', 'value');

        sheet.mergeCells('A26:C26'); setCell(sheet, 'A26', 'País *', 'label');
        sheet.mergeCells('D26:G26'); setCell(sheet, 'D26', '', 'value');
        sheet.mergeCells('H26:I26'); setCell(sheet, 'H26', 'País *', 'label');
        sheet.mergeCells('J26:L26'); setCell(sheet, 'J26', 'MÉXICO', 'value');

        sheet.mergeCells('A27:C27'); setCell(sheet, 'A27', 'C.P. *', 'label');
        sheet.mergeCells('D27:G27'); setCell(sheet, 'D27', '', 'value');
        sheet.mergeCells('H27:I27'); setCell(sheet, 'H27', 'C.P. *', 'label');
        sheet.mergeCells('J27:L27'); setCell(sheet, 'J27', '66628', 'value');

        const headerRowIdx = 31;
        const headers = [
            'No. Contenedor',
            'Clave producto\n(1) / (2)',
            'Descripción del producto\n(1) / (2)',
            'Cantidad de mercancia',
            'Clave\nUnidad\n(1)',
            'Material\npeligroso\n(QUE\nNUMERO\nDE IMO) Y\n(POLO DE\nORIGEN Y\nPOLO DE\nDESTINO)',
            'Clave material peligroso\n(1) / (2)',
            'Descripción\nmaterial\npeligroso\n(1) / (2)',
            'Tipo y  descripción del embalaje del\nmaterial peligroso\n(1) / (2)',
            'Peso en kilogramos KG',
            'Valor de la mercancía',
            'Moneda\n(1)'
        ];

        headers.forEach((h, idx) => {
            const cell = sheet.getCell(headerRowIdx, idx + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
            cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        sheet.getRow(headerRowIdx).height = 120;

        // Re-fetch latest master data to ensure zero-latency accuracy
        const latestParts = storageService.getParts();
        const latestMap: Record<string, RawMaterialPart> = {};
        latestParts.forEach(p => {
            if (p.PART_NUMBER) latestMap[p.PART_NUMBER] = p;
        });

        // Prepare rows for bulk insertion (much faster than individual getCell)
        const rowsToInsert = items.map(item => {
            const masterData = latestMap[item.partNo];
            const weightCalc = (masterData?.NETWEIGHT || 0) * (item.qty || 0);
            return [
                item.containerNo,
                masterData?.CLAVESAT || '',
                item.spanishDescription || masterData?.DESCRIPCION_ES || '',
                item.qty,
                'H87',
                'NA', 'NA', 'NA', 'NA',
                weightCalc > 0 ? weightCalc : (item.netWeight || 0),
                (item.qty || 0) * (item.unitPrice || 0),
                item.currency || 'USD'
            ];
        });
        sheet.addRows(rowsToInsert);

        const lastRowIdx = 32 + items.length - 1;
        for (let r = 32; r <= lastRowIdx; r++) {
            const row = sheet.getRow(r);
            row.eachCell({ includeEmpty: false }, (cell) => {
                cell.font = { name: 'Arial', size: 9 };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const safeContainer = (containerNo || 'CCP').replace(/[^a-zA-Z0-9]/g, '_');

        // Match CIExtractor logic: append date suffix
        const filename = `CCP_${safeContainer}_${emissionDate}.xlsx`;

        // Using native anchor tag download to avoid Chrome UUID bug
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();

        // Cleanup with small delay
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 150);
    };

    const filteredContainers = React.useMemo(() => 
        containers.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase())),
    [containers, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">CCP Builder</h1>
                    <p className="text-slate-500">Generate Carta Porte Complements from Invoice Data</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search Container Number..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-hidden border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-800 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Container Number</th>
                                <th className="px-4 py-3">BL / AWB</th>
                                <th className="px-4 py-3">Linked Items</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredContainers.map(container => (
                                <tr key={container} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center">
                                            <Container size={16} />
                                        </div>
                                        {container}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                        {containerToBL[container] || <span className="text-slate-400 italic">Not Linked</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                            {itemCountsMap[container] || 0} Items
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleGenerateClick(container)}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded hover:bg-slate-700 transition-colors shadow-sm"
                                        >
                                            <FileDown size={14} /> Generate Excel
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredContainers.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                                        <Truck size={48} className="mx-auto mb-4 opacity-20" />
                                        <p>No containers found matching your search.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Input Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-[500px] shadow-xl">
                        <h3 className="text-xl font-bold text-[#1a237e] mb-4">Enter CCP Details</h3>

                        <div className="space-y-4">
                            {/* SMART LINKER: Proposal Section */}
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                                <h4 className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-2">
                                    <Container size={14} /> Smart Suggestion
                                </h4>
                                <div className="text-xs text-blue-800 space-y-1">
                                    <p>Based on your shipment history, we found:</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="font-bold">Linked BL:</span>
                                        <span className="bg-white px-2 py-0.5 rounded border border-blue-200 font-mono">
                                            {containerToBL[selectedContainer!] || 'None found'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">Items Linked:</span>
                                        <span>{allItems.filter(i => i.containerNo === selectedContainer).length}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">No. de pedimento (H7)</label>
                                <input
                                    type="text"
                                    value={manualData.pedimento}
                                    onChange={(e) => setManualData({ ...manualData, pedimento: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#1a237e] focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">BL (H10)</label>
                                <input
                                    type="text"
                                    value={manualData.bl}
                                    onChange={(e) => setManualData({ ...manualData, bl: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#1a237e] focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmGenerate}
                                className="px-4 py-2 bg-[#1a237e] text-white rounded hover:bg-[#283593]"
                            >
                                Generate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
