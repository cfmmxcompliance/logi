import React, { useState, useEffect, useMemo } from 'react';
import { FileText, RotateCcw, Code, Eye, AlertCircle, Box, Truck, Check, X } from 'lucide-react';
import { storageService } from '../../services/storageService';
import { VesselTrackingRecord, EquipmentTrackingRecord, CommercialInvoiceItem } from '../../types';

/* * STRICT PHASE 3 (EXACT MATCH & OFFICIAL LAYOUT)
 * -------------------------------
 * 1. Exact Key Mapping: Matches the specific JSON output from Phase 2.
 * 2. Official Layout: Replicates the Mexican Pedimento Partidas grid.
 * 3. Logic Injection: Extracts PartNo/Invoice/FA from 'observaciones'.
 * 4. NO Regex.
 */

interface Phase3Props {
    data: any;
    rawText: string;
    onRefresh: () => void;
}

// --- HELPER: TEXT MINING (NO REGEX) ---
const findInText = (text: string, label: string, stopMarkers: string[] = ['\n'], maxLen = 100) => {
    if (!text) return '';
    const idx = text.indexOf(label);
    if (idx === -1) return '';

    const start = idx + label.length;
    let bestEnd = start + maxLen;
    let foundStop = false;

    for (const marker of stopMarkers) {
        const end = text.indexOf(marker, start);
        if (end !== -1 && end < bestEnd) {
            bestEnd = end;
            foundStop = true;
        }
    }

    if (!foundStop && (bestEnd > text.length)) {
        bestEnd = text.length;
    }

    let val = text.substring(start, bestEnd).trim();
    val = val.split('  ')[0];
    return val;
};

export const Phase3: React.FC<Phase3Props> = ({ data, rawText, onRefresh }) => {
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [showJson, setShowJson] = useState(false);



    // --- 1. DATA NORMALIZATION ---
    const root = useMemo(() => {
        if (!data) return {};
        let processed = data;
        if (typeof data === 'string') {
            try { processed = JSON.parse(data); } catch (e) { return {}; }
        }
        // Unwrap logic
        return processed.header ? processed : (processed.aiJson || processed.page1 || processed.data || processed || {});
    }, [data]);

    // --- 2. FAILSAFE RECOVERY ---
    const fallback = useMemo(() => {
        const txt = rawText || root.rawText || (typeof data === 'string' ? '' : data.rawText) || '';
        if (!txt) return {};

        return {
            pedimento: findInText(txt, 'NUM.DE PEDIMENTO:', [' T. OPER']),
            tOper: findInText(txt, 'T. OPER:', [' CVE.']),
            cveDoc: findInText(txt, 'CVE. PEDIMENTO:', [' REGIMEN']),
            regimen: findInText(txt, 'REGIMEN:', [' DESTINO']),
            rfc: findInText(txt, 'Clave en el RFC:', [' NOMBRE']),
            nombre: findInText(txt, 'RAZON SOCIAL:\n', ['\n']),
            peso: findInText(txt, 'PESO BRUTO:', ['\n']),
            tc: findInText(txt, 'TIPO CAMBIO:', ['\n']),
            aduana: findInText(txt, 'ADUANA E/S:', ['\n']),
            entrada: findInText(txt, 'ENTRADA\n', ['\n']),
            pago: findInText(txt, 'PAGO\n', ['\n']),
            bl: findInText(txt, 'GUIA:', ['\n']) || findInText(txt, 'BL:', ['\n'])
        };
    }, [root, data]);

    const [tracking, setTracking] = useState<VesselTrackingRecord[]>([]);
    const [equipment, setEquipment] = useState<EquipmentTrackingRecord[]>([]);
    const [invoices, setInvoices] = useState<CommercialInvoiceItem[]>([]);

    useEffect(() => {
        const loadData = () => {
            setTracking(storageService.getVesselTracking());
            setEquipment(storageService.getEquipmentTracking());
            setInvoices(storageService.getInvoiceItems());
        }
        loadData();
        const unsub = storageService.subscribe(loadData);
        return unsub;
    }, []);

    const handleLocalRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => { setLastUpdate(Date.now()); setIsRefreshing(false); if (onRefresh) onRefresh(); }, 600);
    };

    if (!root || Object.keys(root).length === 0) {
        return <div className="p-4 border border-red-300 text-red-700 bg-red-50 text-xs">NO DATA</div>;
    }

    // --- 3. DATA POINTERS (Exact Keys from your JSON) ---
    const h = root.header || {};
    const imp = root.importador || {};
    const prov = root.proveedor || {};

    // Header Data
    const headerData = {
        pedimento: h.numPedimento || h.pedimentoNo || fallback.pedimento,
        tOper: h.tOper || h.tipoOperacion || fallback.tOper,
        cveDoc: h.cvePedimento || h.claveDocumento || fallback.cveDoc,
        regimen: h.regimen || fallback.regimen,
        tc: h.tipoCambio || fallback.tc,
        peso: h.pesoBruto || fallback.peso,
        aduana: h.aduanaES || h.aduana || fallback.aduana,
        rfc: imp.rfc || fallback.rfc,
        nombre: imp.nombre || fallback.nombre,
        domicilio: imp.domicilio || '',
        fechaEntrada: root.fechas?.entrada || fallback.entrada,
        fechaPago: root.fechas?.pago || fallback.pago,
        bl: h.bl || h.guia || fallback.bl
    };

    const isValidBL = useMemo(() => {
        if (!headerData.bl) return false;
        return tracking.some(t => t.refNo === headerData.bl.trim());
    }, [headerData.bl, tracking]);

    const v = root.valores || {};
    const toArray = (x: any) => Array.isArray(x) ? x : (x ? [x] : []);

    // Arrays
    const trans = toArray(root.transporte);
    const cont = toArray(root.contenedores);
    const itemsRaw = toArray(root.partidas);

    // --- 4. ITEM ENRICHMENT (Logic Injection) ---
    const items = useMemo(() => {
        return itemsRaw.map((item: any, idx: number) => {
            const cleanObs = (item.observaciones || item.descripcion || '').split('\n').join(' ').split('\r').join(' ');
            const tokens = cleanObs.split(' ').filter((t: string) => t.trim().length > 0);

            let calcPartNo = "";
            let calcInvoice = "";
            let calcFA = "";

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i].trim();
                const tokenUpper = token.toUpperCase();

                if (tokenUpper.indexOf('CFTT') !== -1) {
                    if (!calcInvoice) calcInvoice = token;
                    continue;
                }
                if (tokenUpper === 'F.A.' || tokenUpper === 'FA') {
                    if (i + 1 < tokens.length) { calcFA = tokens[i + 1]; i++; }
                    continue;
                }
                if (token.length === 8 && !isNaN(Number(token))) {
                    if (!calcFA) calcFA = token;
                    continue;
                }
                const ignore = ['IN', 'CHN', 'USA', 'MXN', 'USD', 'PZA', 'KGS', 'UN', 'NA'];
                if (!calcPartNo && token.length > 3 && !ignore.includes(tokenUpper) && isNaN(Number(token))) {
                    calcPartNo = token;
                }
            }

            return {
                ...item,
                displayPartNo: item.numeroParte || calcPartNo,
                displayInvoice: item.folioFactura || calcInvoice,
                displayFA: item.FA || calcFA,
            };
        });
    }, [itemsRaw]);

    // --- UI HELPERS ---
    const FieldBox = ({ label, value }: { label: string, value: any }) => (
        <div className="flex flex-col border-r border-slate-300 last:border-r-0 px-2 py-1 min-w-[80px] bg-white h-full justify-center">
            <span className="text-[8px] text-slate-500 uppercase font-bold leading-none mb-0.5">{label}</span>
            <span className="text-[10px] font-mono font-medium text-slate-900 truncate" title={String(value)}>
                {value || '-'}
            </span>
        </div>
    );

    const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="mb-6 border border-slate-400 shadow-sm bg-white">
            <div className="bg-slate-700 text-white px-2 py-1 text-[10px] font-bold font-mono tracking-wider uppercase">
                {title}
            </div>
            <div className="p-0 bg-slate-50">
                {children}
            </div>
        </div>
    );

    // --- VALIDATION HELPERS ---
    const normalize = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const fuzzyEq = (a: string, b: string) => {
        if (a === b) return true;
        return a.replace(/0/g, 'O') === b.replace(/0/g, 'O');
    };

    // Helper to find matching invoice by Container + Part No
    const findMatchingInvoice = (p: any) => {
        const rawPartNo = p.displayPartNo || '';
        const cleanPartNo = rawPartNo.replace(/^PN[:\s]*/i, '').trim();
        const pnNorm = normalize(cleanPartNo);

        // Normalize Container List from Pedimento (Header)
        const activeContainers = cont.map((c: any) => normalize(c.numero)).filter(Boolean);

        return invoices.find(inv => {
            const invCont = normalize(inv.containerNo);
            const invPn = normalize(inv.partNo);

            // 1. Container Match (Required if Pedimento has containers)
            let isContainerMatch = true;
            if (activeContainers.length > 0) {
                isContainerMatch = activeContainers.some(ac =>
                    fuzzyEq(ac, invCont) ||
                    (ac.includes(invCont) && invCont.length > 4) ||
                    (invCont.includes(ac) && ac.length > 4)
                );
            }

            if (!isContainerMatch) return false;

            // 2. Part Match (Primary)
            return cleanPartNo && (invPn === pnNorm || invPn.includes(pnNorm) || pnNorm.includes(invPn));
        });
    };

    const renderRowChips = (p: any) => {
        // Validate Part No
        const matchingInvoice = findMatchingInvoice(p);
        const isPartNoValid = !!matchingInvoice;

        // CLEAN UP: Remove "PN:" or "PN " prefix (for display)
        const rawPartNo = p.displayPartNo || '';
        const cleanPartNo = rawPartNo.replace(/^PN[:\s]*/i, '').trim();

        const parts = [];
        if (cleanPartNo) {
            parts.push({
                l: 'PN',
                v: cleanPartNo,
                c: isPartNoValid ? 'green' : 'red',
                valid: isPartNoValid
            });
        }
        if (p.displayInvoice) parts.push({ l: 'INV', v: p.displayInvoice, c: 'blue' });
        if (p.displayFA) parts.push({ l: 'FA', v: p.displayFA, c: 'purple' });

        if (parts.length === 0) return null;

        return (
            <div className="flex flex-wrap gap-1 text-[8px] font-mono items-center h-full px-1">
                {parts.map((item, idx) => (
                    <div key={idx} className={`bg-${item.c}-100 text-${item.c}-800 px-1 rounded border border-${item.c}-300 font-bold whitespace-nowrap flex items-center gap-1`}>
                        <span>{item.l}: {item.v}</span>
                        {item.l === 'PN' && (
                            item.valid ? <Check size={10} strokeWidth={3} className="text-green-600" /> : <X size={10} strokeWidth={3} className="text-red-500" />
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const renderObservaciones = (p: any) => {
        if (!p.observaciones) return null;
        return (
            <div className="whitespace-pre-wrap text-[9px] text-slate-600 break-words">
                {p.observaciones}
            </div>
        );
    };

    return (
        <div key={lastUpdate} className={`font-mono text-xs text-slate-800 ${isRefreshing ? 'opacity-50' : ''}`}>

            {/* TOOLBAR */}
            <div className="mb-4 flex justify-between items-center bg-slate-200 p-2 border border-slate-400 rounded-t-lg">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-700 uppercase flex items-center gap-2">
                        <FileText size={16} /> Phase 3: Final Viewer
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-blue-600 underline">Raw</button>
                        <button onClick={() => setShowJson(!showJson)} className="text-[10px] text-purple-600 underline">JSON</button>
                    </div>
                </div>
                <button onClick={handleLocalRefresh} className="border border-slate-400 bg-white px-3 py-1 text-[10px] hover:bg-slate-100 flex items-center gap-1">
                    <RotateCcw size={10} /> Refresh
                </button>
            </div>



            {showRaw && <div className="mb-4 p-4 bg-slate-900 text-green-400 text-[10px] overflow-auto max-h-60 border font-mono whitespace-pre-wrap">{rawText || (typeof root.rawText === 'string' ? root.rawText : (data.rawText || "No Raw Text"))}</div>}

            {/* RECONSTRUCTED JSON VIEW: Shows the 'Effective' data used by the UI, not the mismatched input prop */}
            {
                showJson && (
                    <div className="mb-4 p-4 bg-slate-900 text-cyan-400 text-[10px] overflow-auto max-h-60 border font-mono">
                        <div className="flex justify-between border-b border-slate-700 pb-2 mb-2">
                            <span className="font-bold text-white">RECONSTRUCTION ANALYSIS (Active UI Data)</span>
                            <span className="text-slate-500">Source: {root.header ? 'Mapped Legacy' : 'Raw Strict'} &rarr; Normalized</span>
                        </div>
                        <pre>{JSON.stringify(root, null, 2)}</pre>
                    </div>
                )
            }

            {/* 1. HEADER */}
            <Section title="1. Header">
                <div className="grid grid-cols-8 border-b border-slate-300">
                    <FieldBox label="Pedimento" value={headerData.pedimento} />
                    <FieldBox label="T. Oper" value={headerData.tOper} />
                    <FieldBox label="Cve. Ped" value={headerData.cveDoc} />
                    <FieldBox label="Regimen" value={headerData.regimen} />
                    <FieldBox label="T. Cambio" value={headerData.tc} />
                    <FieldBox label="Peso Bruto" value={headerData.peso} />
                    <FieldBox label="Aduana E/S" value={headerData.aduana} />
                    <div className="flex flex-col border-r border-slate-300 last:border-r-0 px-2 py-1 min-w-[80px] bg-white h-full justify-center">
                        <span className="text-[8px] text-slate-500 uppercase font-bold leading-none mb-0.5">BL / GUIA</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-mono font-medium text-slate-900 truncate" title={String(headerData.bl || '-')}>
                                {headerData.bl || '-'}
                            </span>
                            {headerData.bl && (
                                isValidBL ? <Check size={20} strokeWidth={3} className="text-green-600" /> : <X size={20} strokeWidth={3} className="text-red-500" />
                            )}
                        </div>
                    </div>
                </div>
            </Section>

            {/* 2. ACTORS */}
            <div className="grid grid-cols-2 gap-4">
                <Section title="2. Importador">
                    <div className="flex flex-col">
                        <div className="flex border-b border-slate-300">
                            <div className="w-1/3"><FieldBox label="RFC" value={headerData.rfc} /></div>
                            <div className="w-2/3 border-l border-slate-300"><FieldBox label="Nombre" value={headerData.nombre} /></div>
                        </div>
                        <FieldBox label="Domicilio" value={headerData.domicilio} />
                    </div>
                </Section>
                <Section title="3. Proveedor">
                    <div className="flex flex-col">
                        <div className="flex border-b border-slate-300">
                            <div className="w-1/3"><FieldBox label="ID Fiscal" value={prov.idFiscal} /></div>
                            <div className="w-2/3 border-l border-slate-300"><FieldBox label="Nombre" value={prov.nombre} /></div>
                        </div>
                        <FieldBox label="Domicilio" value={prov.domicilio} />
                    </div>
                </Section>
            </div>

            {/* 4. DATES, VALUES & LOGISTICS */}
            <Section title="4. Fechas, Valores y Logística">
                <div className="flex border-b border-slate-300">
                    {/* Col 1: Dates (15%) */}
                    <div className="flex flex-col w-[15%] border-r border-slate-300">
                        <FieldBox label="Entrada" value={headerData.fechaEntrada} />
                        <div className="border-t border-slate-300"><FieldBox label="Pago" value={headerData.fechaPago} /></div>
                    </div>

                    {/* Col 2: Values (15%) */}
                    <div className="flex flex-col w-[15%] border-r border-slate-300 bg-blue-50/30">
                        <div className="border-b border-slate-300">
                            <FieldBox label="Valor Dolares" value={v.valorDolares} />
                            {(() => {
                                const valDol = Number(v.valorDolares || 0);
                                const valAdu = Number(v.valorAduana || 0);
                                const tc = Number(headerData.tc || 1);
                                // VAL DOLARES = VAL ADUANA / TC
                                const expectedDol = valAdu / tc;

                                if (valDol > 0 && valAdu > 0) {
                                    const isValid = Math.abs(valDol - expectedDol) < 1.0;
                                    return (
                                        <div className="flex flex-col items-end pr-1 -mt-4 mb-1">
                                            {isValid ? <Check size={20} className="text-green-600" /> : <X size={20} className="text-red-500" />}
                                            {!isValid && <div className="text-[7px] text-slate-500 font-bold">Exp: ${expectedDol.toFixed(2)}</div>}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="border-b border-slate-300">
                            <FieldBox label="Valor Aduana" value={v.valorAduana} />
                            {(() => {
                                const valAduGlobal = Number(v.valorAduana || 0);
                                // Sum of all items Val.Adu (MXN)
                                const sumItems = data.partidas?.reduce((acc: number, p: any) => {
                                    return acc + Number(p.valores?.valorAduanaUSD || 0); // item val is in MXN per user
                                }, 0) || 0;

                                if (valAduGlobal > 0) {
                                    const diff = Math.abs(valAduGlobal - sumItems);
                                    const isValid = diff < 5.0;
                                    return (
                                        <div className="flex flex-col items-end pr-1 -mt-4 mb-1">
                                            {isValid ? <Check size={20} className="text-green-600" /> : <X size={20} className="text-red-500" />}
                                            <div className="text-[7px] text-slate-500 font-bold">Sum: ${sumItems.toFixed(2)}</div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <FieldBox label="Precio Pagado" value={v.precioPagado} />
                    </div>

                    {/* Col 3: Incrementables (20%) */}
                    <div className="flex flex-col w-[20%] border-r border-slate-300 bg-slate-50">
                        <div className="border-b border-slate-300"><FieldBox label="Fletes" value={v.fletes} /></div>
                        <div className="border-b border-slate-300"><FieldBox label="Seguros" value={v.seguros} /></div>
                        <div className="border-b border-slate-300"><FieldBox label="Embalajes" value={v.embalajes} /></div>
                        <FieldBox label="Otros Increm." value={v.otrosIncrementables} />
                    </div>

                    {/* Col 4: Logistics (50%) */}
                    <div className="flex flex-col w-[50%] p-1 overflow-hidden">
                        {/* Transports */}
                        {/* Transports */}
                        <div className="w-full border-b border-slate-300 mb-1">
                            <div className="text-[9px] font-bold text-slate-500 mb-1">MEDIOS DE TRANSPORTE</div>
                            <div className="flex flex-col gap-1 mb-1">
                                {trans.map((t: any, i: number) => {
                                    const isMatch = tracking.some(track => track.refNo === t.identificacion?.trim());
                                    return (
                                        <div key={i} className="flex justify-between items-center border border-slate-200 bg-slate-50 px-2 py-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-blue-800 text-[10px]">{t.identificacion}</span>
                                                {t.identificacion && (
                                                    isMatch ? <Check size={20} strokeWidth={3} className="text-green-600" /> : <X size={20} strokeWidth={3} className="text-red-500" />
                                                )}
                                            </div>
                                            <span className="text-[8px] font-bold bg-white border border-slate-300 px-1 rounded">{t.tipo || 'M'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Containers */}
                        <div className="w-full">
                            <div className="text-[9px] font-bold text-slate-500 mb-1">CONTENEDORES ({cont.length})</div>
                            <div className="flex flex-wrap gap-2">
                                {cont.map((c: any, i: number) => {
                                    // Validation Logic with Fuzzy Match (0 vs O)
                                    const normalize = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                                    const fuzzyEq = (a: string, b: string) => {
                                        if (a === b) return true;
                                        // Treat 0 and O as same
                                        const aPrime = a.replace(/0/g, 'O');
                                        const bPrime = b.replace(/0/g, 'O');
                                        return aPrime === bPrime;
                                    };

                                    const validTransportIds = trans.map((t: any) => normalize(t.identificacion));
                                    const currentContainer = normalize(c.numero);

                                    let debugInfo = `Container: ${currentContainer}\nBLs in Header: ${validTransportIds.join(', ')}`;

                                    // Helper to check a specific dataset
                                    const checkInList = (list: any[]) => {
                                        const record = list.find(e => {
                                            const eqContainer = normalize(e.containerNo);
                                            return fuzzyEq(eqContainer, currentContainer) ||
                                                (eqContainer.includes(currentContainer) && fuzzyEq(eqContainer.substr(0, 4), currentContainer.substr(0, 4))) ||
                                                (currentContainer.includes(eqContainer));
                                        });

                                        const isValidMatch = list.some(e => {
                                            const eqContainer = normalize(e.containerNo);
                                            const eqBL = normalize(e.blNo);

                                            const containerMatch = fuzzyEq(eqContainer, currentContainer) ||
                                                eqContainer.includes(currentContainer) ||
                                                currentContainer.includes(eqContainer);

                                            if (!containerMatch) return false;

                                            return validTransportIds.some((id: string) =>
                                                fuzzyEq(eqBL, id) || eqBL.includes(id) || id.includes(eqBL)
                                            );
                                        });

                                        return { record, isValidMatch };
                                    };

                                    // Check BOTH sources
                                    const eqCheck = checkInList(equipment);
                                    const vesselCheck = checkInList(tracking);

                                    const isValid = eqCheck.isValidMatch || vesselCheck.isValidMatch;
                                    const matchedRecord = eqCheck.record || vesselCheck.record;
                                    const sourceName = eqCheck.record ? 'Equipment' : (vesselCheck.record ? 'VesselTracking' : 'None');

                                    if (!isValid) {
                                        if (matchedRecord) {
                                            debugInfo += `\n❌ Found Container in ${sourceName} (${matchedRecord.containerNo}) but BL mismatch.`;
                                            debugInfo += `\nDB BL: ${matchedRecord.blNo}`;
                                            debugInfo += `\nExpected One Of: ${validTransportIds.join(', ')}`;
                                        } else {
                                            debugInfo += `\n❌ Container NOT found in DB.`;
                                        }
                                    } else {
                                        debugInfo += `\n✅ Valid Match Found in ${sourceName}!`;
                                    }

                                    return (
                                        <div key={i} className="flex flex-col">
                                            <div className="border border-slate-400 bg-white px-2 py-1 text-[10px] font-mono flex items-center shadow-sm gap-2" title={debugInfo}>
                                                <span className="font-bold">{c.numero}</span>
                                                {isValid ? (
                                                    <Check size={20} strokeWidth={3} className="text-green-600" />
                                                ) : (
                                                    <X size={20} strokeWidth={3} className="text-red-500" />
                                                )}
                                                <span className="text-[8px] text-slate-500 border-l border-slate-300 pl-2">{c.tipo}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            {/* 5, 6 & IDENTIFICADORES GLOBAL DATA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 w-full">
                {/* IDENTIFICADORES IN COLUMN 1 */}
                <Section title="Identificadores Globales">
                    <div className="flex flex-col gap-1 p-2 h-full overflow-y-auto max-h-[200px]">
                        {(root.identificadores || []).map((id: any, i: number) => (
                            <div key={i} className="border border-blue-200 bg-blue-50 px-2 py-1 flex items-center gap-2 justify-between">
                                <span className="font-bold text-blue-900 text-xs w-10 text-center">{id.clave}</span>
                                {id.compl1 && <span className="text-[10px] text-blue-700 border-l border-blue-200 pl-2 flex-1">{id.compl1}</span>}
                            </div>
                        ))}
                        {(root.identificadores || []).length === 0 && <div className="text-slate-400 text-[10px] italic p-2 text-center">Sin identificadores</div>}
                    </div>
                </Section>

                {/* LOGIC VALIDATION HELPER */}
                {(() => {
                    // This helper essentially runs "globally" for the render scope but we will define it here or above.
                    // Actually, defining a function inside the map loop is inefficient. 
                    // Let's define the validator logic closure here or assume we use it inside items.map
                    // BUT for cleaner code, I'll return nothing here and stick to defining it inside the items.map or using a hook.
                    return null;
                })()}

                <Section title="5. Contribuciones">
                    <div className="flex flex-col bg-white border-b border-slate-200">
                        <div className="flex bg-slate-100 border-b border-slate-300 text-[9px] font-bold">
                            <div className="w-16 p-1 text-center">CLAVE</div>
                            <div className="w-16 p-1 text-center">TASA</div>
                            <div className="w-12 p-1 text-center">T.T.</div>
                            <div className="flex-1 p-1 text-right">IMPORTE</div>
                        </div>
                        {(root.tasasNivelPedimento || []).map((t: any, idx: number) => (
                            <div key={idx} className="flex border-b border-slate-100 last:border-0 text-[10px]">
                                <div className="w-16 p-1 text-center font-bold text-slate-700">{t.contribucion || t.clave}</div>
                                <div className="w-16 p-1 text-center">{t.tasa}</div>
                                <div className="w-12 p-1 text-center">{t.tipoTasa}</div>
                                <div className="flex-1 p-1 text-right font-mono">{t.importe}</div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="6. Cuadro de Liquidación">
                    <div className="flex flex-col h-full justify-between">
                        <div className="grid grid-cols-2 gap-2 p-2">
                            {(root.cuadroLiquidacion?.conceptos || []).map((c: any, idx: number) => (
                                <div key={idx} className="flex justify-between border-b border-dashed border-slate-300 pb-1">
                                    <span className="text-[10px] font-bold text-slate-600">{c.concepto}</span>
                                    <span className="text-[10px] font-mono">{c.importe}</span>
                                </div>
                            ))}
                        </div>
                        <div className="bg-slate-800 text-white p-2 mt-2 flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase">Total Efectivo</span>
                            <span className="text-sm font-bold font-mono text-emerald-400">${root.cuadroLiquidacion?.efectivo || '0'}</span>
                        </div>
                    </div>
                </Section>
            </div>



            {/* FACTURAS */}
            {(root.facturas || []).length > 0 && (
                <div className="mb-6">
                    <Section title="Facturas">
                        <div className="flex flex-col bg-white border-b border-slate-200">
                            <div className="flex bg-slate-100 border-b border-slate-300 text-[9px] font-bold">
                                <div className="flex-1 p-1">NUM. FACTURA</div>
                                <div className="w-20 p-1 text-center">FECHA</div>
                                <div className="w-16 p-1 text-center">INCOTERM</div>
                                <div className="w-16 p-1 text-center">MONEDA</div>
                                <div className="w-24 p-1 text-right">VAL. MON</div>
                                <div className="w-24 p-1 text-right">FACTOR</div>
                                <div className="w-24 p-1 text-right">VAL. DOLARES</div>
                            </div>
                            {root.facturas.map((f: any, idx: number) => {
                                // 1. INVOICE MATCHING LOGIC (With A1 Support)
                                const normalize = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                                const fuzzyEq = (a: string, b: string) => {
                                    if (a === b) return true;
                                    const aPrime = a.replace(/0/g, 'O');
                                    const bPrime = b.replace(/0/g, 'O');
                                    return aPrime === bPrime;
                                };

                                // Use RAW value for logic, normalize only for specific comparisons if needed later
                                let rawDocInvoice = String(f.numFactura || '').trim();

                                // FIX: Use 'cveDoc' (Cve. Ped) as the Document's Regimen indicator (A1, V1, etc)
                                const headerCve = normalize(headerData.cveDoc);

                                // STRATEGY: Strip the Header Cve/Regime from the Document Invoice if present (e.g. "123-A1" or "123 IN")
                                // This aligns it with the DB which usually stores the raw number ("123")
                                if (headerCve.length > 0) {
                                    const suffixRegex = new RegExp(`[\\s-]*${headerCve}$`, 'i');
                                    rawDocInvoice = rawDocInvoice.replace(suffixRegex, '');
                                }

                                const currentInvoiceNorm = normalize(rawDocInvoice);

                                // Find ALL matching items for this invoice to calculate totals
                                const matchingItems = invoices.filter(inv => {
                                    const rawDbInvoice = String(inv.invoiceNo || '').trim();
                                    const dbRegime = normalize(inv.regimen);

                                    // Normalize DB invoice directly (Use raw DB invoice, as Doc is now stripped of suffix)
                                    const constructedNorm = normalize(rawDbInvoice);

                                    const isInvoiceMatch = fuzzyEq(constructedNorm, currentInvoiceNorm) ||
                                        (constructedNorm.includes(currentInvoiceNorm)) ||
                                        (currentInvoiceNorm.includes(constructedNorm));

                                    if (!isInvoiceMatch) return false;

                                    // REGIME/KEY VALIDATION
                                    // If DB says A1, Header MUST be A1 (Cve. Ped)
                                    if (dbRegime === 'A1' && headerCve !== 'A1') return false;
                                    // General check: If both exist and DB isn't empty, they should match
                                    if (dbRegime && headerCve && dbRegime !== headerCve) return false;

                                    return true;
                                });

                                const isInvoiceValid = matchingItems.length > 0;
                                const isRecordFound = isInvoiceValid;

                                // STRICT ID CHECK: Does the SOURCE document string match the DB string exactly?
                                const isInvoiceIdStrictValid = matchingItems.some(inv => {
                                    return normalize(inv.invoiceNo) === normalize(f.numFactura);
                                });

                                // 2. FIELD VALIDATION
                                // Helpers
                                const normalizeDate = (dateStr: string) => {
                                    if (!dateStr) return '';
                                    const s = String(dateStr).trim().toLowerCase();

                                    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

                                    const match = s.match(/([a-z]{3})[ -](\d{1,2})(?:st|nd|rd|th)?[, ]+(\d{4})/);

                                    if (match) {
                                        const [_, monthName, day, year] = match;
                                        const months: Record<string, string> = {
                                            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                                            'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
                                            'ene': '01', 'abr': '04', 'ago': '08', 'dic': '12'
                                        };
                                        const mm = months[monthName] || '01';
                                        const dd = day.padStart(2, '0');
                                        return `${year}-${mm}-${dd}`;
                                    }

                                    const d = new Date(dateStr);
                                    if (!isNaN(d.getTime())) {
                                        return d.toISOString().split('T')[0];
                                    }
                                    return s;
                                };

                                const checkField = (actual: any, expected: any, isFloat = false, isDate = false) => {
                                    if (!expected && expected !== 0) return { valid: true, debug: 'No DB Data' };
                                    if (!actual) return { valid: false, debug: 'Missing Doc Data' };

                                    if (isFloat) {
                                        const n1 = parseFloat(String(actual).replace(/,/g, ''));
                                        const n2 = parseFloat(String(expected));
                                        // 5 cent tolerance
                                        const valid = Math.abs(n1 - n2) < 0.05;
                                        return { valid, debug: `${n1} vs ${n2}` };
                                    }

                                    if (isDate) {
                                        const d1 = normalizeDate(String(actual));
                                        const d2 = normalizeDate(String(expected));
                                        return { valid: d1 === d2, debug: `norm('${d1}') vs norm('${d2}')` };
                                    }

                                    const normActual = normalize(actual);
                                    const normExpected = normalize(expected);
                                    return { valid: fuzzyEq(normActual, normExpected), debug: `'${normActual}' vs '${normExpected}'` };
                                };

                                // Calculate Expected Values from DB items

                                // Calculate Expected Values from DB items
                                const dbTotal = matchingItems.reduce((acc, item) => acc + (item.totalAmount || 0), 0);
                                const dbDate = matchingItems[0]?.date;

                                // INCOTERM: Prefer Container Match ("Truth Source"), fallback to Invoice Match
                                const activeContainers = cont.map((c: any) => normalize(c.numero));
                                const containerBasedRecord = invoices.find(inv => {
                                    const invCont = normalize(inv.containerNo);
                                    // Robust fuzzy match: Exact, Includes, or partial overlap
                                    return activeContainers.some((ac: string) =>
                                        fuzzyEq(ac, invCont) ||
                                        (ac.includes(invCont) && invCont.length > 4) ||
                                        (invCont.includes(ac) && ac.length > 4)
                                    );
                                });

                                const containerIncoterm = containerBasedRecord?.incoterm;
                                const invoiceIncoterm = matchingItems[0]?.incoterm;

                                const dbIncoterm = containerIncoterm || invoiceIncoterm;

                                const isCFMOTO = (prov.nombre || '').toUpperCase().includes('CFMOTO');
                                const dbCurrency = isCFMOTO ? 'USD' : (matchingItems[0]?.currency || '');

                                // Validation Results (Returns Objects now)
                                const rDate = checkField(f.fecha, dbDate, false, true);

                                // Incoterm Custom Check: strict 3-letter extraction, but robust against "CIF:" etc
                                const rIncoterm = (() => {
                                    if (!dbIncoterm) return { valid: true, debug: 'Skip' };
                                    if (!f.incoterm) return { valid: false, debug: 'Missing' };

                                    const docNorm = normalize(f.incoterm);
                                    const dbNorm = normalize(dbIncoterm);

                                    // Check for 3-letter codes specifically if possible
                                    const docMatch = String(f.incoterm).toUpperCase().match(/[A-Z]{3}/);
                                    const dbMatch = String(dbIncoterm).toUpperCase().match(/[A-Z]{3}/);

                                    const doc3 = docMatch ? docMatch[0] : docNorm;
                                    const db3 = dbMatch ? dbMatch[0] : dbNorm;

                                    const isValid = (doc3 === db3) ||
                                        (docNorm === dbNorm) ||
                                        (docNorm.includes(dbNorm) && dbNorm.length >= 3) ||
                                        (dbNorm.includes(docNorm) && docNorm.length >= 3);

                                    return {
                                        valid: isValid,
                                        debug: `(${containerIncoterm ? 'Cont' : 'Inv'}) '${docNorm}' vs '${dbNorm}'`
                                    };
                                })();

                                const rCurrency = dbCurrency ? checkField(f.monedaFact, dbCurrency) : { valid: true, debug: 'Skip' };
                                const rAmount = checkField(f.valMonFact, dbTotal, true);

                                // Render Helper (Ensuring definition)
                                // Helper for render status
                                const CellStatus = ({ valid, children }: { valid: boolean, children: React.ReactNode }) => (
                                    <div className={`flex items-center justify-center gap-1 ${valid ? 'text-slate-700' : 'text-red-600 font-bold bg-red-50'}`}>
                                        {children}
                                        {valid && <Check size={12} className="text-green-600" />}
                                    </div>
                                );

                                return (
                                    <div key={idx} className="flex flex-col border-b border-slate-100 last:border-0 text-[10px]">
                                        <div className="flex w-full items-center whitespace-nowrap">
                                            <div className="flex-1 p-1 font-bold text-slate-700 flex items-center gap-1 min-w-[150px] overflow-hidden text-ellipsis">
                                                {/* Revert to RAW source data as requested, to reveal extraction 'errors' like 'IN' suffix */}
                                                {f.numFactura}
                                                {isInvoiceIdStrictValid ? (
                                                    <Check size={16} className="text-green-600 shrink-0" />
                                                ) : (
                                                    <X size={16} className="text-red-500 shrink-0" />
                                                )}
                                            </div>
                                            <div className="w-24 p-1 text-center" title={`DB: ${dbDate || 'N/A'}`}>
                                                <CellStatus valid={isInvoiceValid ? (rDate.valid as boolean) : false}>{f.fecha}</CellStatus>
                                            </div>
                                            <div className="w-16 p-1 text-center" title={`DB: ${dbIncoterm} | Debug: ${rIncoterm.debug}`}>
                                                <CellStatus valid={isInvoiceValid ? (rIncoterm.valid as boolean) : false}>{f.incoterm}</CellStatus>
                                            </div>
                                            <div className="w-16 p-1 text-center" title={`DB: ${dbCurrency || 'N/A'}`}>
                                                <CellStatus valid={isRecordFound ? (rCurrency.valid as boolean) : false}>{f.monedaFact}</CellStatus>
                                            </div>
                                            <div className="w-24 p-1 text-right font-mono" title={`DB Sum: ${dbTotal.toFixed(2)} | Debug: ${rAmount.debug}`}>
                                                <CellStatus valid={isRecordFound ? (rAmount.valid as boolean) : false}>{f.valMonFact}</CellStatus>
                                            </div>
                                            <div className="w-24 p-1 text-right font-mono">{f.factorMonFact}</div>
                                            <div className="w-28 p-1 text-center font-mono text-blue-700 font-bold">
                                                {f.valDolares}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                </div>
            )}

            {/* 8. PARTIDAS */}
            <div className="mb-6 border border-slate-700">
                <div className="bg-slate-700 text-white px-2 py-1 text-[10px] font-bold font-mono tracking-wider uppercase">
                    8. Partidas ({items.length})
                </div>
                <div className="bg-slate-100 p-2 space-y-4">
                    {items.map((p: any, i: number) => {
                        const val = p.valores || {};
                        return (

                            <div key={i} className="border border-black bg-white text-[9px] font-mono shadow-sm">
                                {/* ROW 1: HEADER INFO */}
                                <div className="flex border-b border-black">
                                    <div className="w-8 border-r border-black p-1 text-center font-bold bg-slate-200 flex items-center justify-center">{p.secuencia}</div>
                                    <div className="w-24 border-r border-black p-1">
                                        <div className="font-bold text-[8px] text-slate-500">FRACCION</div>
                                        <div className="font-bold text-blue-800 text-[11px]">{p.fraccion}</div>
                                    </div>
                                    <div className="w-16 border-r border-black p-1">
                                        <div className="font-bold text-[8px] text-slate-500">NICO</div>
                                        <div>{p.subdivision || p.nico}</div>
                                    </div>
                                    <div className="w-10 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">VINC</div>
                                        <div>{p.vinculacion}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">UMC</div>
                                        <div className="flex justify-center items-center gap-1">
                                            {(() => {
                                                const matchInv = findMatchingInvoice(p);
                                                const umcDoc = String(p.umc || '').trim();
                                                const umInv = normalize(matchInv?.um || '');

                                                let isValid = false;
                                                if (matchInv) {
                                                    // PZA (Piece) -> 6
                                                    if (['PZA', 'PIEZA', 'H87', 'PCS', 'EA'].some(u => umInv.includes(u))) {
                                                        isValid = umcDoc === '6';
                                                    }
                                                    // KG (Kilogram) -> 1
                                                    else if (['KG', 'KGM'].some(u => umInv.includes(u))) {
                                                        isValid = umcDoc === '1';
                                                    }
                                                    // Fallback: Exact string match check (if needed in future, but based on request PZA->6, Kg->1 are the main rules)
                                                    else {
                                                        isValid = umcDoc === umInv; // weak fallback
                                                    }
                                                }

                                                return (
                                                    <>
                                                        <span>{p.umc}</span>
                                                        {matchInv ? (
                                                            isValid ? <Check size={10} className="text-green-600" /> : <X size={20} className="text-red-500" />
                                                        ) : (
                                                            <X size={20} className="text-red-500" />
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="w-20 border-r border-black p-1 text-right">
                                        <div className="font-bold text-[8px] text-slate-500">CANT UMC</div>
                                        <div className="flex justify-end items-center gap-1">
                                            {(() => {
                                                const matchInv = findMatchingInvoice(p);
                                                const qtyDoc = Number(p.cantidadUMC);
                                                const qtyDb = matchInv?.qty;
                                                const isValid = matchInv && (Math.abs(qtyDoc - (qtyDb || 0)) < 0.01); // Float safe check

                                                return (
                                                    <>
                                                        <span>{p.cantidadUMC}</span>
                                                        {matchInv ? (
                                                            isValid ? <Check size={10} className="text-green-600" /> : <X size={20} className="text-red-500" />
                                                        ) : (
                                                            <X size={20} className="text-red-500" />
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">UMT</div>
                                        <div>{p.umt}</div>
                                    </div>
                                    <div className="w-20 border-r border-black p-1 text-right">
                                        <div className="font-bold text-[8px] text-slate-500">CANT UMT</div>
                                        <div className="flex justify-end items-center gap-1">
                                            {(() => {
                                                const matchInv = findMatchingInvoice(p);
                                                const cantUmt = Number(p.cantidadUMT || 0);
                                                const umt = String(p.umt || '').trim();

                                                // Rules logic
                                                const isRule1 = umt === '1';
                                                const isRule2 = umt === '6' && String(p.umc || '').trim() === '6';
                                                const shouldValidate = isRule1 || isRule2;

                                                if (!shouldValidate) return <span>{p.cantidadUMT}</span>;

                                                if (!matchInv) return (
                                                    <>
                                                        <span>{p.cantidadUMT}</span>
                                                        <X size={20} className="text-red-500" />
                                                    </>
                                                );

                                                let isValid = false;
                                                if (isRule1) {
                                                    const netWt = matchInv.netWeight || 0;
                                                    isValid = Math.abs(cantUmt - netWt) < 0.01;
                                                } else if (isRule2) {
                                                    const cantUmc = Number(p.cantidadUMC || 0);
                                                    isValid = Math.abs(cantUmt - cantUmc) < 0.01;
                                                }

                                                return (
                                                    <>
                                                        <span>{p.cantidadUMT}</span>
                                                        {isValid ? <Check size={10} className="text-green-600" /> : <X size={20} className="text-red-500" />}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">P.V/C</div>
                                        <div>{p.PVC}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">P.O/D</div>
                                        <div>{p.POD}</div>
                                    </div>
                                    <div className="flex-1 border-black p-1 flex items-center bg-slate-50">
                                        {renderRowChips(p)}
                                    </div>
                                </div>

                                <div className="flex border-b border-black">
                                    {/* INNER FLEX: DESC (50%) | OBS (50%) */}
                                    <div className="flex-1 flex">
                                        {/* COL 1: DESCRIPCION & VALUES (50%) */}
                                        <div className="w-1/2 border-r border-black flex flex-col">
                                            {(() => {
                                                const matchInv = findMatchingInvoice(p);
                                                const dbDesc = matchInv?.spanishDescription || '';
                                                let isDescValid = false;
                                                if (matchInv) {
                                                    const d1 = normalize(p.descripcion);
                                                    const d2 = normalize(dbDesc);
                                                    isDescValid = d1 === d2 || d1.includes(d2) || d2.includes(d1);
                                                }
                                                return (
                                                    <div className="p-1 min-h-[40px] flex-1 relative">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="font-bold text-[8px] text-slate-400">DESCRIPCION</div>
                                                            {matchInv ? (
                                                                isDescValid ? <Check size={10} className="text-green-600" /> : <X size={10} className="text-red-500" />
                                                            ) : (
                                                                <X size={20} className="text-red-500" />
                                                            )}
                                                        </div>
                                                        <div className={`whitespace-pre-wrap ${matchInv && !isDescValid ? 'text-red-600' : ''}`}>
                                                            {p.descripcion}
                                                        </div>
                                                        {matchInv && !isDescValid && (
                                                            <div className="mt-1 text-[7px] text-slate-500 border-t border-slate-200 pt-1">
                                                                <span className="font-bold">DB:</span> {dbDesc}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex border-t border-black bg-slate-50">
                                                <div className="w-1/4 border-r border-black p-1">
                                                    <div className="font-bold text-[8px] text-slate-500">VAL.ADU/USD</div>
                                                    <div className="flex justify-end items-center gap-1">
                                                        <div className="text-right text-[9px] flex items-center gap-1">
                                                            ${val.valorAduanaUSD}
                                                            {(() => {
                                                                const match = findMatchingInvoice(p);
                                                                if (!match) return <X size={20} className="text-red-500" />;
                                                                
                                                                const valDoc = Number(String(val.valorAduanaUSD || "").replace(/,/g, ""));
                                                                const totalInvoiceUSD = Number(match.totalAmount || 0);
                                                                
                                                                // VAL.ADU/USD in Pedimento usually matches Commercial Value (USD)
                                                                const isValid = Math.abs(valDoc - totalInvoiceUSD) < 0.10;
                                                                
                                                                return isValid ? 
                                                                    <Check size={20} className="text-green-600" /> : 
                                                                    <X size={20} className="text-red-500" />;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-1/4 border-r border-black p-1">
                                                    <div className="font-bold text-[8px] text-slate-500">IMP.PR.PAG</div>
                                                    <div className="flex justify-end items-center gap-1">
                                                        <div className="text-right text-[9px] flex items-center gap-1">
                                                            ${val.impPrecioPag}
                                                            {(() => {
                                                                const match = findMatchingInvoice(p);
                                                                if (!match) return <X size={20} className="text-red-500" />;

                                                                const valDoc = Number(String(val.impPrecioPag || "").replace(/,/g, ""));
                                                                const totalInvoiceUSD = Number(match.totalAmount || 0);
                                                                const tc = Number(headerData.tc || 1);
                                                                const expectedMXN = totalInvoiceUSD * tc;

                                                                // Strict tolerance requested (< 0.10 for float safety)
                                                                const isValid = Math.abs(valDoc - expectedMXN) < 0.10;

                                                                return isValid ? 
                                                                    <Check size={20} className="text-green-600" /> : 
                                                                    <X size={20} className="text-red-500" />;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-1/4 border-r border-black p-1">
                                                    <div className="font-bold text-[8px] text-slate-500">PRECIO UNIT.</div>
                                                    <div className="flex justify-end items-center gap-1">
                                                        {(() => {
                                                            const unitPrice = Number(val.precioUnitario || 0);
                                                            const impPrPag = Number(val.impPrecioPag || 0);
                                                            const cantUMC = Number(p.cantidadUMC || 0);

                                                            let isValid = false;
                                                            let showValidation = false;
                                                            let expectedPrice = 0;

                                                            if (impPrPag > 0 && cantUMC > 0) {
                                                                expectedPrice = impPrPag / cantUMC;

                                                                // Tolerance for calc division differences
                                                                // E.g. 100 / 3 = 33.3333 vs 33.33 declared
                                                                isValid = Math.abs(unitPrice - expectedPrice) < 0.02;
                                                                showValidation = true;
                                                            }

                                                            return (
                                                                <>
                                                                    <div className={`text-right text-[9px] ${showValidation && !isValid ? 'text-red-600 font-bold' : ''}`}>
                                                                        ${val.precioUnitario}
                                                                        {showValidation && !isValid && (
                                                                            <div className="text-[7px] text-slate-400">Exp: ${expectedPrice.toFixed(4)}</div>
                                                                        )}
                                                                    </div>
                                                                    {showValidation && (
                                                                        isValid ? <Check size={20} className="text-green-600" /> : <X size={20} className="text-red-500" />
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                                <div className="w-1/4 p-1">
                                                    <div className="font-bold text-[8px] text-slate-500">VAL AGREG</div>
                                                    <div className="text-right text-[9px]">{val.valorAgregado || 0}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* COL 2: OBSERVACIONES (50%) */}
                                        <div className="w-1/2 p-1 bg-yellow-50/30 flex flex-col border-r border-black">
                                            <div className="font-bold text-[8px] text-slate-400 mb-1">OBSERVACIONES</div>
                                            <div className="flex-1 overflow-auto">
                                                {renderObservaciones(p)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: TAXES (Fixed Width) */}
                                    <div className="w-48 flex flex-col bg-slate-50">
                                        <div className="flex bg-slate-200 border-b border-black font-bold text-[8px]">
                                            <div className="w-8 p-0.5 text-center">CON</div>
                                            <div className="w-12 p-0.5 text-center">TASA</div>
                                            <div className="w-8 p-0.5 text-center">FP</div>
                                            <div className="flex-1 p-0.5 text-center">IMPORTE</div>
                                        </div>
                                        {(p.tasas || []).map((t: any, k: number) => (
                                            <div key={k} className="flex border-b border-slate-200 last:border-0 text-[8px]">
                                                <div className="w-8 p-0.5 text-center font-bold">{t.clave}</div>
                                                <div className="w-12 p-0.5 text-right">{t.tasa}</div>
                                                <div className="w-8 p-0.5 text-center">{t.formaPago}</div>
                                                <div className="flex-1 p-0.5 text-right">{t.importe}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ROW 5: IDENTIFIERS */}
                                {(p.identificadores || []).length > 0 && (
                                    <div className="border-t border-black p-1 flex flex-wrap gap-2 bg-white">
                                        {p.identificadores.map((id: any, k: number) => (
                                            <div key={k} className="border border-slate-400 bg-white px-1 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                                <span className="font-bold text-blue-900">{id.identif}</span>
                                                {id.compl1 && <span className="text-slate-500 text-[8px] ml-1">{id.compl1}</span>}
                                                {id.Valcomdls > 0 && <span className="text-emerald-700 text-[8px] font-bold ml-1">${id.Valcomdls}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div >
    );
};
