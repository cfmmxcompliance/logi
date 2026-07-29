import React, { useState, useEffect } from 'react';
import { X, Clock, Plus, Save } from 'lucide-react';
import { citasConfigService, CitasConfig } from '../services/citasConfigService';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const baseHoursList = ["07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];

export const CitasConfigModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [horas, setHoras] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newHour, setNewHour] = useState('19:00');

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const config = await citasConfigService.getCitasConfigByDateRange(fecha, fecha);
        const dayConfig = config[fecha] || {};
        
        const mergedHoras: Record<string, number> = {};
        baseHoursList.forEach(hr => {
          mergedHoras[hr] = dayConfig[hr] !== undefined ? dayConfig[hr] : 6;
        });
        
        Object.keys(dayConfig).forEach(hr => {
          if (!mergedHoras[hr]) {
            mergedHoras[hr] = dayConfig[hr];
          }
        });
        
        setHoras(mergedHoras);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [fecha]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Remove any standard 6 configurations if we want to save space, 
      // but for simplicity we can save the whole map.
      await citasConfigService.saveConfig(fecha, horas);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHour = () => {
    if (!horas[newHour]) {
      setHoras(prev => ({ ...prev, [newHour]: 6 }));
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-teal-400" />
            <h2 className="font-bold">Configuración de Citas (Slots)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto bg-slate-50 flex-1">
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha a configurar</label>
            <input 
              type="date" 
              value={fecha} 
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none bg-white"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-600 flex justify-between items-center">
              <span>Horarios y Capacidad</span>
            </div>
            
            {loading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Cargando...</div>
            ) : (
              <div className="p-2 space-y-2 max-h-[40vh] overflow-y-auto">
                {Object.entries(horas)
                  .sort(([h1], [h2]) => h1.localeCompare(h2))
                  .map(([hr, cap]) => (
                  <div key={hr} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-md">
                    <span className="font-mono font-bold text-slate-700 text-sm">{hr}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Max Slots:</span>
                      <input 
                        type="number" 
                        min="0"
                        max="50"
                        value={cap as number}
                        onChange={e => setHoras(prev => ({ ...prev, [hr]: parseInt(e.target.value) || 0 }))}
                        className="w-16 text-center border border-slate-300 rounded p-1 text-sm font-bold text-slate-700 outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input 
              type="time" 
              value={newHour}
              onChange={e => setNewHour(e.target.value)}
              className="border border-slate-300 rounded-lg p-1.5 text-sm outline-none bg-white"
            />
            <button 
              onClick={handleAddHour}
              className="flex items-center gap-1 bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors"
            >
              <Plus size={16} /> Agregar Horario
            </button>
          </div>
          
          <div className="mt-4 text-xs text-slate-500 bg-amber-50 border border-amber-200 p-2 rounded-lg">
            <strong>Nota:</strong> Modificar los slots aquí anulará cualquier bloqueo por sistema (ej. horario pasado o 11:00 am). Si pones 0, el horario quedará bloqueado.
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 p-4 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-teal-600 text-white font-bold text-sm rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
};
