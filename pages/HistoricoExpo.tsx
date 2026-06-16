import React, { useState, useEffect } from 'react';
import { History, Plus, Trash2, FileText, UploadCloud, Loader2 } from 'lucide-react';
import storageService from '../services/storageService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { HistoricoExpoRecord } from '../types.ts';

const DODA_FOLDER_ID = '14qiNMFvgyUuR4Z-e9beQzNqWw__CyMQZ';
const ENTRY_FOLDER_ID = '1BORtOzX23VOYtHBicGphlOf-CDp993oI';

const emptyRecord: HistoricoExpoRecord = {
  trailer: '',
  pickupDayCFM: '',
  dodaUrl: '',
  entryUrl: '',
  dateRequested: '',
  crossingDate: '',
  dateReceived: '',
  daysToReceive: '',
  cfmRef: '',
  expDoda: '',
  comments: '',
  scacAndCaat: ''
};

export const HistoricoExpo = () => {
  const [records, setRecords] = useState<HistoricoExpoRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<HistoricoExpoRecord>(emptyRecord);
  const [uploadingFor, setUploadingFor] = useState<{ id: string; field: 'dodaUrl' | 'entryUrl' } | null>(null);

  useEffect(() => {
    const load = () => {
      setRecords([...storageService.getHistoricoExpo()]);
    };
    load();
    const unsub = storageService.subscribe(load);
    return () => unsub();
  }, []);

  const handleCreate = async () => {
    const newRecord = { ...emptyRecord, createdAt: Date.now() };
    await storageService.upsertHistoricoExpos([newRecord]);
    setEditingId(newRecord.id || null);
    setEditForm(newRecord);
  };

  const handleSave = async (id: string) => {
    await storageService.upsertHistoricoExpos([{ ...editForm, id }]);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar registro?')) {
      await storageService.deleteHistoricoExpos([id]);
    }
  };

  const handleUploadDoc = async (recordId: string, field: 'dodaUrl' | 'entryUrl', file: File, trailer: string) => {
    try {
      setUploadingFor({ id: recordId, field });
      const label = field === 'dodaUrl' ? 'DODA' : 'ENTRY';
      const folderId = field === 'dodaUrl' ? DODA_FOLDER_ID : ENTRY_FOLDER_ID;
      const ext = file.name.split('.').pop() || 'pdf';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${label}_${trailer || 'DOC'}_${ts}.${ext}`;
      
      const result = await uploadFileToDrive(file, filename, folderId);
      
      const existingRecord = records.find(r => r.id === recordId);
      if (existingRecord) {
        await storageService.upsertHistoricoExpos([{
          ...existingRecord,
          [field]: result.url
        }]);
      }
    } catch (e) {
      console.error('Error uploading document:', e);
      alert('Error al subir el documento a Drive');
    } finally {
      setUploadingFor(null);
    }
  };

  const toDriveDownload = (url: string) => {
    if (!url) return '#';
    const match = url.match(/\/d\/(.*?)\/view/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return url;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof HistoricoExpoRecord) => {
    setEditForm({ ...editForm, [field]: e.target.value });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50 relative flex flex-col h-screen">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-indigo-600" />
            Histórico Expo
          </h1>
          <p className="text-slate-500 text-sm">Registro de Control de Operaciones</p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={18} /> Nuevo Registro
        </button>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="p-4">Acciones</th>
                  <th className="p-4">TRAILER</th>
                  <th className="p-4">PICKUP DAY CFM</th>
                  <th className="p-4 text-center">DODA</th>
                  <th className="p-4 text-center">ENTRY</th>
                  <th className="p-4">DATE REQUESTED</th>
                  <th className="p-4">CROSSING DATE</th>
                  <th className="p-4">Date Received</th>
                  <th className="p-4">Days to Receive</th>
                  <th className="p-4">CFM REF</th>
                  <th className="p-4">EXP DODA</th>
                  <th className="p-4">COMMENTS</th>
                  <th className="p-4">SCAC AND CAAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(record => {
                  const isEditing = editingId === record.id;
                  
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleSave(record.id!)} className="text-emerald-600 font-medium">Guardar</button>
                            <button onClick={() => setEditingId(null)} className="text-slate-500">Cancelar</button>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button onClick={() => { setEditingId(record.id!); setEditForm(record); }} className="text-blue-600 font-medium">Editar</button>
                            <button onClick={() => handleDelete(record.id!)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                          </div>
                        )}
                      </td>

                      {/* Text Fields */}
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-24" value={editForm.trailer} onChange={(e) => handleChange(e, 'trailer')} /> : record.trailer}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-24" value={editForm.pickupDayCFM} onChange={(e) => handleChange(e, 'pickupDayCFM')} /> : record.pickupDayCFM}</td>

                      {/* DODA Upload Column */}
                      <td className="p-4 text-center bg-indigo-50/20 border-l border-indigo-100/50">
                        {uploadingFor?.id === record.id && uploadingFor.field === 'dodaUrl' ? (
                          <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                        ) : record.dodaUrl ? (
                          <div className="flex items-center justify-center gap-1">
                            <a href={toDriveDownload(record.dodaUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors" title="Descargar DODA" onClick={e => e.stopPropagation()}>
                              <FileText size={18} />
                            </a>
                            <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer" title="Reemplazar DODA" onClick={e => e.stopPropagation()}>
                              <UploadCloud size={16} />
                              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'dodaUrl', f, record.trailer); e.target.value = ''; }} />
                            </label>
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer" title="Subir DODA" onClick={e => e.stopPropagation()}>
                            <UploadCloud size={18} />
                            <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'dodaUrl', f, record.trailer); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>

                      {/* ENTRY Upload Column */}
                      <td className="p-4 text-center bg-emerald-50/20 border-l border-emerald-100/50 border-r">
                        {uploadingFor?.id === record.id && uploadingFor.field === 'entryUrl' ? (
                          <Loader2 size={18} className="animate-spin text-emerald-400 mx-auto" />
                        ) : record.entryUrl ? (
                          <div className="flex items-center justify-center gap-1">
                            <a href={toDriveDownload(record.entryUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 transition-colors" title="Descargar ENTRY" onClick={e => e.stopPropagation()}>
                              <FileText size={18} />
                            </a>
                            <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer" title="Reemplazar ENTRY" onClick={e => e.stopPropagation()}>
                              <UploadCloud size={16} />
                              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'entryUrl', f, record.trailer); e.target.value = ''; }} />
                            </label>
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer" title="Subir ENTRY" onClick={e => e.stopPropagation()}>
                            <UploadCloud size={18} />
                            <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'entryUrl', f, record.trailer); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>

                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.dateRequested} onChange={(e) => handleChange(e, 'dateRequested')} /> : record.dateRequested}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.crossingDate} onChange={(e) => handleChange(e, 'crossingDate')} /> : record.crossingDate}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.dateReceived} onChange={(e) => handleChange(e, 'dateReceived')} /> : record.dateReceived}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-24" value={editForm.daysToReceive} onChange={(e) => handleChange(e, 'daysToReceive')} /> : record.daysToReceive}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.cfmRef} onChange={(e) => handleChange(e, 'cfmRef')} /> : record.cfmRef}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.expDoda} onChange={(e) => handleChange(e, 'expDoda')} /> : record.expDoda}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-48" value={editForm.comments} onChange={(e) => handleChange(e, 'comments')} /> : record.comments}</td>
                      <td className="p-4">{isEditing ? <input className="border px-2 py-1 rounded w-32" value={editForm.scacAndCaat} onChange={(e) => handleChange(e, 'scacAndCaat')} /> : record.scacAndCaat}</td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-slate-500">
                      No hay registros todavía. Haz clic en "Nuevo Registro" para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
