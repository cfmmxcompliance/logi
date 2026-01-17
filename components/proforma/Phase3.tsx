import React, { useState, useEffect, useMemo } from 'react';
import { FileText, RotateCcw } from 'lucide-react';

/* * STRICT PHASE 3 (ISOLATED & DETERMINISTIC)
 * -------------------------------
 * 1. NO REGEX allowed. Uses split/join/indexOf.
 * 2. NO External Phases dependencies.
 * 3. NO Data Repair/Hallucination.
 * 4. PURE Rendering with simple logic injection for columns.
 */

interface Phase3Props {
    data: any;
    onRefresh: () => void;
}

export const Phase3: React.FC<Phase3Props> = ({ data, onRefresh }) => {
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    // --- 1. NORMALIZACIÓN AGNÓSTICA (Aislamiento) ---
    const root = useMemo(() => {
        if (!data) return {};

        let processed = data;

        // Solo validación de tipo, sin lógica de negocio externa
        if (typeof data === 'string') {
            try {
                processed = JSON.parse(data);
            } catch (e) {
                // Si falla el parseo, no intentamos arreglarlo. Fallamos seguro.
                console.error("Phase3: Invalid JSON string provided.");
                return {};
            }
        }

        // Desempaquetado genérico si existe una propiedad 'data' envolvente
        if (processed.data && !processed.header && !processed.partidas) {
            return processed.data;
        }

        return processed;
    }, [data]);

    const handleLocalRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setLastUpdate(Date.now());
            setIsRefreshing(false);
            if (onRefresh) onRefresh();
        }, 600);
    };

    // Validación de seguridad: Si no hay estructura mínima, no renderizamos nada creativo.
    if (!root || (Object.keys(root).length === 0)) {
        return <div className="p-4 border border-red-300 text-red-700 bg-red-50 font-mono text-xs">NO DATA STRUCTURE FOUND</div>;
    }

    // --- 2. PUNTEROS DE DATOS (Lectura Directa) ---
    // Usamos '||' solo para alias comunes de campos (numPedimento vs pedimento), no para lógica.
    const h = root.header || root;
    const imp = root.importador || {};
    const prov = root.proveedor || (Array.isArray(root.proveedores) ? root.proveedores[0] : root.proveedores) || {};

    const f = root.fechas || {};
    // Extracción segura de arrays sin regex
    const f_entrada = Array.isArray(f) ? f.find((d: any) => d.tipo === 'Entrada')?.fecha : f.entrada;
    const f_pago = Array.isArray(f) ? f.find((d: any) => d.tipo === 'Pago')?.fecha : f.pago;

    const v = root.valores || {};

    // Helpers de Arrays seguros
    const toArray = (x: any) => Array.isArray(x) ? x : (x ? [x] : []);
    const tasas = toArray(root.tasasNivelPedimento || root.tasasGlobales || root.dta);
    const liq = root.cuadroLiquidacion || root.importes || {};
    const ids = toArray(root.identificadores || root.identificadoresGlobales);
    const trans = toArray(root.transporte?.medios ? root.transporte.medios[0] : root.transporte);
    const cont = toArray(root.contenedores);
    const itemsRaw = toArray(root.partidas || root.items);

    // --- 3. INYECCIÓN DE LÓGICA (Determinista) ---
    // Analiza 'observaciones' para llenar las columnas calculadas.
    const items = useMemo(() => {
        return itemsRaw.map((item: any, idx: number) => {
            // A. Extracción de texto base
            const rawObs = item.observaciones || item.descripcion || "";

            // B. Limpieza SIN REGEX (Split/Join chain)
            const cleanObs = rawObs.split('\n').join(' ').split('\r').join(' ').split('\t').join(' ');

            // C. Tokenización simple
            const tokens = cleanObs.split(' ').filter((t: string) => t.trim().length > 0);

            // D. Variables Calculadas
            let calcPartNo = "";
            let calcInvoice = "";
            let calcFA = "";

            // E. Escaneo Lineal (Sin backtracking ni regex)
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i].trim();
                const tokenUpper = token.toUpperCase();

                // 1. Detección de Factura (Heurística: contiene CFTT)
                if (tokenUpper.indexOf('CFTT') !== -1) {
                    if (!calcInvoice) calcInvoice = token;
                    continue;
                }

                // 2. Detección de F.A. (Fracción Arancelaria)
                // Caso A: Etiqueta explícita "F.A." o "FA"
                if (tokenUpper === 'F.A.' || tokenUpper === 'FA') {
                    if (i + 1 < tokens.length) {
                        calcFA = tokens[i + 1]; // Tomar el siguiente token
                        i++; // Avanzar índice manualmente
                    }
                    continue;
                }
                // Caso B: Patrón numérico de 8 dígitos (verificación estricta de longitud y tipo)
                if (token.length === 8 && !isNaN(Number(token))) {
                    if (!calcFA) calcFA = token;
                    continue;
                }

                // 3. Detección de Part Number (Descarte)
                // Si no es un comando conocido (IN, F.A.) y es alfanumérico largo
                if (!calcPartNo && token.length > 3 && tokenUpper !== 'IN' && isNaN(Number(token))) {
                    calcPartNo = token;
                }
            }

            return {
                ...item,
                // Prioridad: Dato existente > Dato calculado
                displayPartNo: item.numeroParte || item.partNo || calcPartNo,
                displayInvoice: item.folioFactura || item.invoiceNo || calcInvoice,
                displayFA: item.FA || item.fraccionArancelaria || calcFA,
            };
        });
    }, [itemsRaw]);

    // --- UI HELPERS (Pure Components) ---
    const Field = ({ label, value, highlight = false }: { label: string, value: any, highlight?: boolean }) => (
        <div className={`flex flex-col border border-slate-300 p-1 bg-white min-h-[36px] ${highlight ? 'bg-blue-50' : ''}`}>
            <span className="text-[9px] bg-slate-100 text-slate-500 font-mono px-1 border-b border-slate-200 mb-1 block uppercase truncate">
                {label}
            </span>
            <span className="text-xs font-mono px-1 truncate block text-slate-900 font-medium" title={String(value !== undefined ? value : '')}>
                {value === null || value === undefined || value === '' ? <span className="text-slate-300">-</span> : String(value)}
            </span>
        </div>
    );

    const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="mb-6 border border-slate-400 shadow-sm bg-white">
            <div className="bg-slate-800 text-white px-3 py-1.5 text-xs font-bold font-mono tracking-wider uppercase">
                {title}
            </div>
            <div className="p-3 bg-slate-50 grid gap-3">
                {children}
            </div>
        </div>
    );

    // --- VISUAL PARSER (Display Only - No Regex) ---
    const renderObservaciones = (text: string) => {
        if (!text) return <span className="text-slate-300 italic">Sin observaciones</span>;

        // Limpieza visual sin regex
        const cleanText = text.split('\n').join(' ').split('\r').join(' ');
        const tokens = cleanText.split(' ').filter(t => t.trim().length > 0);

        // Si hay estructura mínima (2 tokens), intentamos colorear
        if (tokens.length >= 2) {
            return (
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                        {/* Token 1: Asumimos Item/Part */}
                        <div className="flex flex-col">
                            <span className="text-[7px] text-slate-400 uppercase">Item/Part</span>
                            <span className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 font-bold">{tokens[0]}</span>
                        </div>

                        {/* Token 2: Asumimos Factura */}
                        <div className="flex flex-col">
                            <span className="text-[7px] text-slate-400 uppercase">Factura</span>
                            <span className="bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200 font-bold">{tokens[1]}</span>
                        </div>

                        {/* Resto: Info */}
                        {tokens.length > 2 && (
                            <div className="flex flex-col">
                                <span className="text-[7px] text-slate-400 uppercase">Info/R8</span>
                                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                                    {tokens.slice(2).join(' ')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return <span className="whitespace-pre-wrap text-[10px]">{text}</span>;
    };

    return (
        <div key={lastUpdate} className={`font-mono text-xs text-slate-800 ${isRefreshing ? 'opacity-50 pointer-events-none' : ''}`}>

            {/* HEADER TOOLBAR */}
            <div className="mb-4 flex justify-between items-center bg-slate-200 p-2 border border-slate-400 rounded-t-lg mt-2">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-700 uppercase flex items-center gap-2">
                        <FileText size={16} /> Phase 3: Independent Viewer
                    </span>
                    <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-blue-600 underline hover:text-blue-800">
                        {showRaw ? 'Hide JSON Payload' : 'Show JSON Payload'}
                    </button>
                </div>
                <button onClick={handleLocalRefresh} className="border border-slate-400 bg-white px-3 py-1 text-[10px] uppercase hover:bg-slate-100 shadow-sm rounded flex items-center gap-1">
                    <RotateCcw size={10} /> Refresh
                </button>
            </div>

            {showRaw && (
                <div className="mb-4 p-4 bg-slate-900 text-green-400 text-[10px] overflow-auto max-h-80 border border-slate-700 rounded-lg shadow-inner font-mono">
                    <pre>{JSON.stringify(root, null, 2)}</pre>
                </div>
            )}

            {/* 1. HEADER DATA */}
            <Section title="1. Header">
                <div className="grid grid-cols-4 lg:grid-cols-7 gap-0">
                    <Field label="Pedimento" value={h.numPedimento || h.pedimentoNo || h.pedimento} highlight />
                    <Field label="T. Oper" value={h.tOper || h.tipoOperacion} />
                    <Field label="Cve. Doc" value={h.cvePedimento || h.claveDocumento || h.cveDoc} />
                    <Field label="Regimen" value={h.regimen} />
                    <Field label="T. Cambio" value={h.tipoCambio} />
                    <Field label="Peso Bruto" value={h.pesoBruto} />
                    <Field label="Aduana" value={h.aduana || h.aduanaES} />
                </div>
            </Section>

            {/* 2. ACTORS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="2. Importador">
                    <div className="grid grid-cols-1 gap-1">
                        <div className="grid grid-cols-3 gap-0">
                            <Field label="RFC" value={imp.rfc} highlight />
                            <div className="col-span-2"><Field label="Nombre" value={imp.nombre} /></div>
                        </div>
                        <Field label="Domicilio" value={imp.domicilio} />
                    </div>
                </Section>
                <Section title="3. Proveedor">
                    <div className="grid grid-cols-1 gap-1">
                        <div className="grid grid-cols-3 gap-0">
                            <Field label="ID Fiscal" value={prov.idFiscal || prov.taxId} />
                            <div className="col-span-2"><Field label="Nombre" value={prov.nombre} /></div>
                        </div>
                        <Field label="Domicilio" value={prov.domicilio} />
                    </div>
                </Section>
            </div>

            {/* 4. FINANCIALS */}
            <Section title="4. Valores y Fechas">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-0">
                    <Field label="F. Entrada" value={f_entrada} />
                    <Field label="F. Pago" value={f_pago} />
                    <Field label="Valor Dolares" value={v.dolares || v.valorDolares} />
                    <Field label="Valor Aduana" value={v.aduana || v.valorAduana} />
                    <Field label="Precio Pagado" value={v.comercial || v.precioPagado} />
                    <Field label="Fletes" value={v.fletes} />
                </div>
            </Section>

            {/* 6. LIQUIDACION */}
            <Section title="6. Liquidación">
                <div className="bg-white border border-slate-200 text-[10px]">
                    <div className="flex justify-between p-1.5 bg-slate-100 font-bold border-b border-slate-200">
                        <span>CONCEPTOS</span><span>EFECTIVO</span>
                    </div>

                    {/* Mapeo directo de claves conocidas */}
                    {liq.dta !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>DTA</span><span>{liq.dta}</span></div>}
                    {liq.iva !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>IVA</span><span>{liq.iva}</span></div>}
                    {liq.prv !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>PRV</span><span>{liq.prv}</span></div>}

                    {/* Fallback a array de conceptos si existe */}
                    {liq.conceptos && liq.conceptos.map((c: any, k: number) => (
                        <div key={k} className="flex justify-between p-1.5 border-b border-slate-100"><span>{c.concepto || c.clave}</span><span>{c.importe}</span></div>
                    ))}

                    <div className="flex justify-between p-1.5 bg-slate-100 font-bold border-t border-slate-200 text-emerald-700">
                        <span>TOTAL</span>
                        <span>{liq.totalEfectivo || liq.total || liq.efectivo}</span>
                    </div>
                </div>
            </Section>

            {/* 7. ITEMS (PARTIDAS) */}
            <Section title={`7. Partidas (${items.length} detectadas)`}>
                <div className="overflow-x-auto border rounded-sm">
                    <table className="w-full text-left text-[10px] whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-500 font-bold uppercase border-b border-slate-200">
                            <tr>
                                <th className="px-2 py-1.5">Sec</th>
                                <th className="px-2 py-1.5">Fracción</th>
                                <th className="px-2 py-1.5">Vinculación</th>
                                <th className="px-2 py-1.5 text-right">Cant UMC</th>
                                <th className="px-2 py-1.5 text-right">UMC</th>
                                <th className="px-2 py-1.5 text-right">Precio Pag.</th>
                                <th className="px-2 py-1.5">Identificadores</th>

                                {/* COLUMNAS CALCULADAS POR LOGICA INYECTADA */}
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800 border-l border-yellow-200">Part No</th>
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800">Invoice</th>
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800 border-r border-yellow-200">F.A.</th>

                                <th className="px-2 py-1.5 text-center">Observaciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {items.map((p: any, idx: number) => {
                                // Resolver valores anidados o planos
                                const val = p.valores || {};
                                const price = p.precioPagado || val.impPrecioPag || val.precioPagado || 0;
                                const unitPrice = p.precioUnitario || val.precioUnitario || 0;

                                // Resolver Identificadores (Array A o B)
                                const ids = p.identificadores || p.identifiers || [];

                                return (
                                    <tr key={idx} className="hover:bg-slate-50 align-top">
                                        <td className="px-2 py-1.5 font-mono text-slate-400">{p.secuencia || idx + 1}</td>
                                        <td className="px-2 py-1.5 font-mono font-bold text-blue-700">
                                            {p.fraccion}
                                            {(p.subdivision || p.nico) && <span className="block text-[8px] text-slate-400">Sub: {p.subdivision || p.nico}</span>}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono">{p.vinculacion}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{p.cantidadUMC}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{p.umc}</td>
                                        <td className="px-2 py-1.5 text-right font-mono font-medium">
                                            <div className="font-bold">${Number(price).toLocaleString()}</div>
                                            <div className="text-[8px] text-slate-400">Unit: ${Number(unitPrice).toFixed(4)}</div>
                                        </td>

                                        {/* IDENTIFICADORES */}
                                        <td className="px-2 py-1.5">
                                            {ids.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                                    {ids.map((id: any, k: number) => (
                                                        <span key={k} className="px-1 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-[9px] text-indigo-700 flex flex-col" title={JSON.stringify(id)}>
                                                            <span className="font-bold">{id.clave || id.identif || id.code}</span>
                                                            {(id.compl1 || id.complemento1) && <span className="text-[7px] text-slate-500">{id.compl1 || id.complemento1}</span>}
                                                            {/* Datos Extra (Cantidades/Valores) */}
                                                            {id.Valcomdls > 0 && <span className="text-[7px] text-emerald-600">${id.Valcomdls}</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>

                                        {/* CAMPOS CALCULADOS (LOGICA INDEPENDIENTE) */}
                                        <td className="px-2 py-1.5 font-mono font-bold text-yellow-700 bg-yellow-50/50 border-l border-yellow-100">
                                            {p.displayPartNo || '-'}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-yellow-700 bg-yellow-50/50">
                                            {p.displayInvoice || '-'}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-yellow-700 bg-yellow-50/50 border-r border-yellow-100">
                                            {p.displayFA || '-'}
                                        </td>

                                        <td className="px-2 py-1.5 max-w-xs break-words whitespace-pre-wrap text-[9px] border-l border-dashed border-slate-200 pl-4">
                                            {renderObservaciones(p.observaciones || p.descripcion || '')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
};
