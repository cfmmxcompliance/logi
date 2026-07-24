import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle, X, Download, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface COVEDatosAcuse {
  numeroCOVE: string;
  tipoOperacion: string;
  noFactura: string;
  fechaExpedicion: string;
  numeroOperacion: string;
  rfcConsulta: string;
  patente: string;
}

interface COVEProveedor {
  nombre: string;
  tipoIdentificador: string;
  taxId: string;
  calle: string;
  noExterior: string;
  noInterior: string;
  colonia: string;
  localidad: string;
  codigoPostal: string;
  entidadFederativa: string;
  municipio: string;
  pais: string;
}

interface COVEDestinatario {
  nombre: string;
  rfc: string;
  calle: string;
  noExterior: string;
  noInterior: string;
  colonia: string;
  localidad: string;
  codigoPostal: string;
  entidadFederativa: string;
  municipio: string;
  pais: string;
}

interface COVEPartida {
  descripcionGenerica: string;
  descripcionEspecifica: string;
  marca: string;
  modelo: string;
  submodelo: string;
  noSerie: string;
  claveUMC: string;
  cantidadUMC: number;
  tipoMoneda: string;
  valorUnitario: number;
  valorTotal: number;
  valorTotalDolares: number;
}

interface COVEData {
  datosAcuse: COVEDatosAcuse;
  proveedor: COVEProveedor;
  destinatario: COVEDestinatario;
  partidas: COVEPartida[];
  totales: {
    cantidadTotal: number;
    valorTotalFactura: number;
    valorTotalDolares: number;
    moneda: string;
  };
}

// ─── Gemini Helper ────────────────────────────────────────────────────────────

const getGeminiClient = () => {
  const apiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) || (process.env as any).API_KEY;
  if (!apiKey) throw new Error('API Key de Gemini no encontrada');
  return new GoogleGenAI({ apiKey });
};

const cleanJsonStr = (text: string): string => {
  if (!text) return '{}';
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return clean.substring(start, end + 1);
  return clean || '{}';
};

async function extractCOVEWithGemini(base64Pdf: string): Promise<COVEData> {
  const ai = getGeminiClient();

  const prompt = `Eres un experto en documentos aduanales mexicanos. Analiza este documento COVE (Comprobante de Valor y Comercialización Electrónico) y extrae TODOS los datos en el siguiente formato JSON estricto:

{
  "datosAcuse": {
    "numeroCOVE": "string - número COVE (ej: COVE161KBIWN5)",
    "tipoOperacion": "string - tipo de operación (Importación/Exportación)",
    "noFactura": "string - número de factura",
    "fechaExpedicion": "string - fecha de expedición en formato DD/MM/YYYY",
    "numeroOperacion": "string - número de operación",
    "rfcConsulta": "string - RFC con permisos de consulta",
    "patente": "string - número de patente aduanal"
  },
  "proveedor": {
    "nombre": "string - nombre o razón social del proveedor",
    "tipoIdentificador": "string - tipo de identificador fiscal",
    "taxId": "string - Tax ID o RFC del proveedor",
    "calle": "string",
    "noExterior": "string",
    "noInterior": "string",
    "colonia": "string",
    "localidad": "string",
    "codigoPostal": "string",
    "entidadFederativa": "string",
    "municipio": "string",
    "pais": "string"
  },
  "destinatario": {
    "nombre": "string - nombre o razón social del destinatario",
    "rfc": "string - RFC del destinatario",
    "calle": "string",
    "noExterior": "string",
    "noInterior": "string",
    "colonia": "string",
    "localidad": "string",
    "codigoPostal": "string",
    "entidadFederativa": "string",
    "municipio": "string",
    "pais": "string"
  },
  "partidas": [
    {
      "descripcionGenerica": "string - descripción genérica de la mercancía",
      "descripcionEspecifica": "string - descripción específica (puede estar vacía)",
      "marca": "string - marca del producto",
      "modelo": "string - modelo del producto",
      "submodelo": "string",
      "noSerie": "string",
      "claveUMC": "string - clave de unidad de medida (EA, KG, etc.)",
      "cantidadUMC": "number - cantidad numérica",
      "tipoMoneda": "string - tipo de moneda (USD DOLAR, etc.)",
      "valorUnitario": "number - valor unitario numérico",
      "valorTotal": "number - valor total numérico",
      "valorTotalDolares": "number - valor total en dólares numérico"
    }
  ],
  "totales": {
    "cantidadTotal": "number - suma total de cantidades",
    "valorTotalFactura": "number - valor total de la factura",
    "valorTotalDolares": "number - valor total en dólares",
    "moneda": "string - moneda principal"
  }
}

INSTRUCCIONES CRÍTICAS:
1. Extrae TODAS las partidas de mercancía del documento completo.
2. Los valores numéricos deben ser números (no strings con $).
3. Si un campo no existe, usa "" para strings y 0 para números.
4. El campo "partidas" DEBE ser un array con TODAS las líneas de mercancía encontradas.
5. Calcula los totales sumando todas las partidas si no están explícitos en el documento.
6. Responde ÚNICAMENTE con el JSON, sin explicaciones adicionales.`;

  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: {
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
        { text: prompt }
      ]
    },
    config: { responseMimeType: 'application/json' }
  });

  const rawText = response.text || '{}';
  const cleaned = cleanJsonStr(rawText);
  return JSON.parse(cleaned) as COVEData;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title, icon, children, defaultOpen = true
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-blue-600">{icon}</span>
          <span className="font-semibold text-slate-800 text-sm">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-slate-100 last:border-0">
    <span className="text-xs font-medium text-slate-500 sm:w-52 shrink-0">{label}</span>
    <span className="text-sm text-slate-800 font-medium">{value || '—'}</span>
  </div>
);

const formatCurrency = (val: number, currency = 'USD') => {
  if (!val && val !== 0) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency === 'USD' || currency.includes('DOLAR') ? 'USD' : 'MXN', minimumFractionDigits: 4 }).format(val);
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const COVEExtractor: React.FC = () => {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<COVEData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (f: File) => {
    if (!f || f.type !== 'application/pdf') {
      setError('Solo se aceptan archivos PDF.');
      return;
    }
    setFile(f);
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      );
      const result = await extractCOVEWithGemini(base64);
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Error al procesar el archivo con Gemini.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleReset = () => {
    setFile(null);
    setData(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportCSV = () => {
    if (!data) return;
    const headers = ['#', 'Descripción Genérica', 'Descripción Específica', 'Marca', 'Modelo', 'Clave UMC', 'Cantidad', 'Tipo Moneda', 'Valor Unitario', 'Valor Total', 'Valor Total USD'];
    const rows = data.partidas.map((p, i) => [
      i + 1,
      p.descripcionGenerica,
      p.descripcionEspecifica,
      p.marca,
      p.modelo,
      p.claveUMC,
      p.cantidadUMC,
      p.tipoMoneda,
      p.valorUnitario,
      p.valorTotal,
      p.valorTotalDolares
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `COVE_${data.datosAcuse.numeroCOVE || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <FileText className="text-blue-600" size={24} />
              COVE Extractor
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Extrae automáticamente todos los datos del Comprobante de Valor y Comercialización Electrónico
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-3">
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Download size={16} />
                Exportar CSV
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw size={16} />
                Nuevo COVE
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        {/* Upload Zone */}
        {!data && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !loading && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
              dragging
                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                : loading
                ? 'border-blue-300 bg-blue-50/50 cursor-not-allowed'
                : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={loading}
            />

            {loading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                    <Loader2 size={36} className="text-blue-600 animate-spin" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">Analizando con Gemini AI...</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Extrayendo datos del COVE: <span className="font-semibold text-blue-600">{file?.name}</span>
                  </p>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-inner">
                  <Upload size={34} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-700">Sube tu archivo COVE</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Arrastra y suelta o haz clic para seleccionar
                  </p>
                </div>
                <span className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-full shadow-sm hover:bg-blue-700 transition-colors">
                  Seleccionar PDF
                </span>
                <p className="text-xs text-slate-400">Solo archivos .pdf • Formato COVE del SAT/VUCEM</p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Error al procesar</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-4">
            {/* Status banner */}
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
              <CheckCircle size={20} className="shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-sm">Extracción completada exitosamente</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {data.partidas?.length || 0} partidas encontradas • {file?.name}
                </p>
              </div>
            </div>

            {/* Datos del Acuse */}
            <SectionCard title="Datos del Acuse de Valor" icon={<FileText size={18} />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <InfoRow label="Número COVE" value={data.datosAcuse?.numeroCOVE} />
                  <InfoRow label="Tipo de Operación" value={data.datosAcuse?.tipoOperacion} />
                  <InfoRow label="No. de Factura" value={data.datosAcuse?.noFactura} />
                  <InfoRow label="Fecha de Expedición" value={data.datosAcuse?.fechaExpedicion} />
                </div>
                <div>
                  <InfoRow label="Número de Operación" value={data.datosAcuse?.numeroOperacion} />
                  <InfoRow label="RFC de Consulta" value={data.datosAcuse?.rfcConsulta} />
                  <InfoRow label="Patente Aduanal" value={data.datosAcuse?.patente} />
                </div>
              </div>
            </SectionCard>

            {/* Proveedor */}
            <SectionCard title="Datos del Proveedor" icon={<FileText size={18} />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <InfoRow label="Nombre / Razón Social" value={data.proveedor?.nombre} />
                  <InfoRow label="Tipo de Identificador" value={data.proveedor?.tipoIdentificador} />
                  <InfoRow label="Tax ID / RFC" value={data.proveedor?.taxId} />
                  <InfoRow label="Calle" value={data.proveedor?.calle} />
                  <InfoRow label="No. Exterior" value={data.proveedor?.noExterior} />
                  <InfoRow label="No. Interior" value={data.proveedor?.noInterior} />
                </div>
                <div>
                  <InfoRow label="Colonia" value={data.proveedor?.colonia} />
                  <InfoRow label="Localidad" value={data.proveedor?.localidad} />
                  <InfoRow label="Código Postal" value={data.proveedor?.codigoPostal} />
                  <InfoRow label="Municipio" value={data.proveedor?.municipio} />
                  <InfoRow label="Entidad Federativa" value={data.proveedor?.entidadFederativa} />
                  <InfoRow label="País" value={data.proveedor?.pais} />
                </div>
              </div>
            </SectionCard>

            {/* Destinatario */}
            <SectionCard title="Datos del Destinatario" icon={<FileText size={18} />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <InfoRow label="Nombre / Razón Social" value={data.destinatario?.nombre} />
                  <InfoRow label="RFC" value={data.destinatario?.rfc} />
                  <InfoRow label="Calle" value={data.destinatario?.calle} />
                  <InfoRow label="No. Exterior" value={data.destinatario?.noExterior} />
                  <InfoRow label="No. Interior" value={data.destinatario?.noInterior} />
                  <InfoRow label="Código Postal" value={data.destinatario?.codigoPostal} />
                </div>
                <div>
                  <InfoRow label="Colonia" value={data.destinatario?.colonia} />
                  <InfoRow label="Localidad" value={data.destinatario?.localidad} />
                  <InfoRow label="Municipio" value={data.destinatario?.municipio} />
                  <InfoRow label="Entidad Federativa" value={data.destinatario?.entidadFederativa} />
                  <InfoRow label="País" value={data.destinatario?.pais} />
                </div>
              </div>
            </SectionCard>

            {/* Partidas de Mercancía */}
            <SectionCard title={`Partidas de Mercancía (${data.partidas?.length || 0})`} icon={<FileText size={18} />}>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2.5 text-center font-semibold rounded-tl-lg">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Descripción Genérica</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Modelo</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Marca</th>
                      <th className="px-3 py-2.5 text-center font-semibold">UMC</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Cantidad</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Moneda</th>
                      <th className="px-3 py-2.5 text-right font-semibold">V. Unitario</th>
                      <th className="px-3 py-2.5 text-right font-semibold">V. Total</th>
                      <th className="px-3 py-2.5 text-right font-semibold rounded-tr-lg">V. Total USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.partidas || []).map((p, i) => (
                      <tr
                        key={i}
                        className={`border-b border-slate-100 transition-colors ${
                          i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                        } hover:bg-blue-50`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <div className="font-medium">{p.descripcionGenerica || '—'}</div>
                          {p.descripcionEspecifica && (
                            <div className="text-slate-400 text-xs mt-0.5">{p.descripcionEspecifica}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono text-xs">{p.modelo || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600">{p.marca || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-medium">
                            {p.claveUMC || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                          {p.cantidadUMC?.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500 text-xs">{p.tipoMoneda || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 font-mono">
                          {p.valorUnitario != null ? `$${p.valorUnitario.toFixed(6)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-800 font-semibold font-mono">
                          {p.valorTotal != null ? `$${p.valorTotal.toFixed(4)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 font-bold font-mono">
                          {p.valorTotalDolares != null ? `$${p.valorTotalDolares.toFixed(4)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totales */}
                  {data.totales && (
                    <tfoot>
                      <tr className="bg-slate-800 text-white">
                        <td colSpan={5} className="px-3 py-3 font-bold text-sm rounded-bl-lg">TOTALES</td>
                        <td className="px-3 py-3 text-right font-bold text-sm">
                          {data.totales.cantidadTotal?.toLocaleString('es-MX') || '—'}
                        </td>
                        <td className="px-3 py-3 text-right text-xs opacity-70">{data.totales.moneda}</td>
                        <td className="px-3 py-3"></td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono">
                          {data.totales.valorTotalFactura != null ? `$${data.totales.valorTotalFactura.toFixed(4)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sm font-mono text-emerald-300 rounded-br-lg">
                          {data.totales.valorTotalDolares != null ? `$${data.totales.valorTotalDolares.toFixed(4)}` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
};
