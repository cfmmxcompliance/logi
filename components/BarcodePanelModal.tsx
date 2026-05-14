import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Package, Shield } from 'lucide-react';

interface BarcodePanelProps {
  numeroOperacion: string;
  numeroCaja: string;
  sello: string;
  onClose: () => void;
}

const BarcodeItem: React.FC<{ value: string; label: string; sublabel?: string; color: string }> = ({
  value, label, sublabel, color
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        lineColor: '#1e293b',
        width: 2.5,
        height: 80,
        displayValue: true,
        fontSize: 16,
        fontOptions: 'bold',
        textMargin: 6,
        margin: 12,
        background: '#ffffff',
      });
    } catch (e) {
      console.warn('Barcode render error:', e);
    }
  }, [value]);

  return (
    <div className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 ${color} bg-white shadow-sm`}>
      <div className="flex items-center gap-2 self-start">
        <span className={`text-xs font-black uppercase tracking-widest ${color.includes('blue') ? 'text-blue-700' : color.includes('emerald') ? 'text-emerald-700' : 'text-indigo-700'}`}>
          {label}
        </span>
        {sublabel && <span className="text-xs text-slate-400 font-mono">{sublabel}</span>}
      </div>
      <svg ref={svgRef} className="w-full max-w-[340px]" />
      <span className="text-lg font-black font-mono text-slate-800 tracking-widest">{value}</span>
    </div>
  );
};

const BarcodePanelModal: React.FC<BarcodePanelProps> = ({
  numeroOperacion, numeroCaja, sello, onClose
}) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) return;

    const barcodeGen = (value: string, label: string) => {
      // Use a canvas to generate barcode for print
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, value, {
          format: 'CODE128',
          lineColor: '#000000',
          width: 3,
          height: 100,
          displayValue: true,
          fontSize: 18,
          fontOptions: 'bold',
          textMargin: 8,
          margin: 16,
          background: '#ffffff',
        });
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px solid #e2e8f0;border-radius:12px;margin-bottom:20px;break-inside:avoid;">
            <div style="font-size:11px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:#475569;align-self:flex-start;">${label}</div>
            <img src="${canvas.toDataURL('image/png')}" style="max-width:100%;height:auto;" />
            <div style="font-size:20px;font-weight:900;font-family:monospace;letter-spacing:0.15em;color:#0f172a;">${value}</div>
          </div>`;
      } catch {
        return `<div style="padding:20px;border:2px solid #e2e8f0;border-radius:12px;margin-bottom:20px;">
          <div style="font-weight:900;">${label}: ${value}</div>
        </div>`;
      }
    };

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Códigos de Barras — ${numeroOperacion}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; max-width: 500px; margin: 0 auto; }
          h2 { font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 20px; }
          .header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
          .op { font-size: 22px; font-weight: 900; color: #be185d; font-family: monospace; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#94a3b8;">No. Operación</div>
          <div class="op">${numeroOperacion}</div>
        </div>
        ${barcodeGen(numeroCaja, '📦 Caja')}
        ${sello ? barcodeGen(sello, '🔒 Sello Liberación') : ''}
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"
             style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Códigos de Barras</span>
            <span className="text-white font-black text-xl font-mono tracking-wide">{numeroOperacion}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors"
              title="Imprimir"
            >
              <Printer size={14} />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Barcodes */}
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <Package size={13} />
            <span>Escanea los códigos para identificar esta operación</span>
          </div>

          <BarcodeItem
            value={numeroCaja}
            label="Caja"
            sublabel="Número de Caja Seca 53'"
            color="border-emerald-200"
          />

          {sello ? (
            <BarcodeItem
              value={sello}
              label="Sello Liberación"
              sublabel="Sello asignado en operación"
              color="border-blue-200"
            />
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
              <Shield size={18} />
              <span className="text-sm">Sin sello asignado aún</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodePanelModal;
