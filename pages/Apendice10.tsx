import React, { useState, useEffect, useMemo } from 'react';
import { apendice10Service } from '../services/apendice10Service';
import { Apendice10Model } from '../types/apendice10';
import { Plus, Edit2, Trash2, Search, Filter, BookOpen } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

const DEFAULT_CATALOG: Apendice10Model[] = [
  { clave: "1", descripcion: "Contenedor estándar 20' (standard container 20')" },
  { clave: "2", descripcion: "Contenedor estándar 40' (standard container 40')" },
  { clave: "3", descripcion: "Contenedor estándar de cubo alto 40' (high cube standard container 40')" },
  { clave: "4", descripcion: "Contenedor tapa dura 20' (hardtop container 20')" },
  { clave: "5", descripcion: "Contenedor tapa dura 40' (hardtop container 40')" },
  { clave: "6", descripcion: "Contenedor tapa abierta 20' (open top container 20')" },
  { clave: "7", descripcion: "Contenedor tapa abierta 40' (open top container 40')" },
  { clave: "8", descripcion: "Flat 20' (flat 20')" },
  { clave: "9", descripcion: "Flat 40' (flat 40')" },
  { clave: "10", descripcion: "Plataforma 20' (platform 20')" },
  { clave: "11", descripcion: "Plataforma 40' (platform 40')" },
  { clave: "12", descripcion: "Contenedor ventilado 20' (ventilated container 20')" },
  { clave: "13", descripcion: "Contenedor térmico 20' (insulated container 20')" },
  { clave: "14", descripcion: "Contenedor térmico 40' (insulated container 40')" },
  { clave: "15", descripcion: "Contenedor refrigerante 20' (refrigerated container 20')" },
  { clave: "16", descripcion: "Contenedor refrigerante 40' (refrigerated container 40')" },
  { clave: "17", descripcion: "Contenedor refrigerante cubo alto 40' (high cube refrigerated container 40')" },
  { clave: "18", descripcion: "Contenedor carga a granel 20' (bulk container 20')" },
  { clave: "19", descripcion: "Contenedor tipo tanque 20' (tank container 20')" },
  { clave: "20", descripcion: "Contenedor estándar 45' (standard container 45')" },
  { clave: "21", descripcion: "Contenedor estándar 48' (standard container 48')" },
  { clave: "22", descripcion: "Contenedor estándar 53' (standard container 53')" },
  { clave: "23", descripcion: "Contenedor estándar 8' (standard container 8')" },
  { clave: "24", descripcion: "Contenedor estándar 10' (standard container 10')" },
  { clave: "25", descripcion: "Contenedor estándar de cubo alto 45' (high cube standard container 45')" },
  { clave: "26", descripcion: "Semirremolque con racks para envases de bebidas" },
  { clave: "27", descripcion: "Semirremolque cuello de ganso" },
  { clave: "28", descripcion: "Semirremolque tolva cubierto" },
  { clave: "29", descripcion: "Semirremolque tolva (abierto)" },
  { clave: "30", descripcion: "Auto-tolva cubierto/descarga neumática" },
  { clave: "31", descripcion: "Semirremolque chasis" },
  { clave: "32", descripcion: "Semirremolque autocargable (con sistema de elevación)" },
  { clave: "33", descripcion: "Semirremolque con temperatura controlada" },
  { clave: "34", descripcion: "Semirremolque corto trasero" },
  { clave: "35", descripcion: "Semirremolque de cama baja" },
  { clave: "36", descripcion: "Plataforma de 28'" },
  { clave: "37", descripcion: "Plataforma de 45'" },
  { clave: "38", descripcion: "Plataforma de 48'" },
  { clave: "39", descripcion: "Semirremolque para transporte de caballos" },
  { clave: "40", descripcion: "Semirremolque para transporte de ganado" },
  { clave: "41", descripcion: "Semirremolque tanque (líquidos)/sin calefacción/sin aislar" },
  { clave: "42", descripcion: "Semirremolque tanque (líquidos)/con calefacción/sin aislar" },
  { clave: "43", descripcion: "Semirremolque tanque (líquidos)/sin calefacción/aislado" },
  { clave: "44", descripcion: "Semirremolque tanque (líquidos)/con calefacción/aislado" },
  { clave: "45", descripcion: "Semirremolque tanque (gas)/sin calefacción/sin aislar" },
  { clave: "46", descripcion: "Semirremolque tanque (gas)/con calefacción/sin aislar" },
  { clave: "47", descripcion: "Semirremolque tanque (gas)/sin calefacción/aislado" },
  { clave: "48", descripcion: "Semirremolque tanque (gas)/con calefacción/aislado" },
  { clave: "49", descripcion: "Semirremolque tanque (químicos)/sin calefacción/sin aislar" },
  { clave: "50", descripcion: "Semirremolque tanque (químicos)/con calefacción/sin aislar" },
  { clave: "51", descripcion: "Semirremolque tanque (químicos)/sin calefacción/aislado" },
  { clave: "52", descripcion: "Semirremolque tanque (químicos)/con calefacción/aislado" },
  { clave: "53", descripcion: "Semirremolque góndola-cerrada" },
  { clave: "54", descripcion: "Semirremolque góndola-abierta" },
  { clave: "55", descripcion: "Semirremolque tipo caja cerrada 48'" },
  { clave: "56", descripcion: "Semirremolque tipo caja cerrada 53'" },
  { clave: "57", descripcion: "Semirremolque tipo caja refrigerada 48'" },
  { clave: "58", descripcion: "Semirremolque tipo caja refrigerada 53'" },
  { clave: "59", descripcion: "Doble semirremolque" },
  { clave: "60", descripcion: "Otros" },
  { clave: "61", descripcion: "Tanque 20'" },
  { clave: "62", descripcion: "Tanque 40'" },
  { clave: "63", descripcion: "Carro de ferrocarril" },
  { clave: "64", descripcion: "High cube 20'" },
  { clave: "65", descripcion: "Automóvil" },
  { clave: "66", descripcion: "Camión unitario de dos ejes" },
  { clave: "67", descripcion: "Camión unitario de tres ejes" },
  { clave: "68", descripcion: "Vehículos con capacidad de carga de hasta 3.5 toneladas" },
  { clave: "69", descripcion: "Tractocamión" }
].map(item => ({ clave: item.clave, descripcion: item.descripcion.toUpperCase() }));

export const Apendice10: React.FC = () => {
  const [registros, setRegistros] = useState<Apendice10Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Apendice10Model>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'clave', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
        const data = await apendice10Service.getAllRegistros();
        if (data.length === 0) {
            await autoSeed();
            return;
        }
        setRegistros(data.sort((a,b) => parseInt(a.clave) - parseInt(b.clave)));
    } catch(err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const autoSeed = async () => {
      setIsSeeding(true);
      console.log('Initiating Apéndice 10 Auto-Seed...');
      let seeded = 0;
      for (const reg of DEFAULT_CATALOG) {
          try {
              await apendice10Service.addRegistro(reg);
              seeded++;
          } catch(e) {
              console.error("Error seeding", reg.clave, e);
          }
      }
      setIsSeeding(false);
      const data = await apendice10Service.getAllRegistros();
      setRegistros(data.sort((a,b) => parseInt(a.clave) - parseInt(b.clave)));
      setLoading(false);
  };

  const filteredRegistros = useMemo(() => {
      let result = registros;
      if (searchTerm) {
          const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
          result = result.filter(c => 
             terms.some(term =>
                c.clave.toLowerCase().includes(term) || 
                c.descripcion.toLowerCase().includes(term)
             )
          );
      }
      if (activeMassQuery && activeMassQuery.length > 0) {
          result = result.filter(c => {
             return activeMassQuery.every(cond => {
                 const targetVal = c[cond.column as keyof Apendice10Model];
                 return evaluateCondition(targetVal, cond);
             });
          });
      }
      return result;
  }, [registros, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'clave', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clave || !formData.descripcion) return;

    if (isEditing) {
      await apendice10Service.updateRegistro(formData.clave, formData);
    } else {
      await apendice10Service.addRegistro(formData as Apendice10Model);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (clave: string) => {
    if (confirm("¿Estás seguro de eliminar este código aduanero?")) {
      await apendice10Service.deleteRegistro(clave);
      loadData();
    }
  };

  const openEdit = (reg: Apendice10Model) => {
    setFormData(reg);
    setIsEditing(true);
    setShowModal(true);
  };

  const openNew = () => {
    setFormData({});
    setIsEditing(false);
    setShowModal(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in relative">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BookOpen className="text-green-600" />
              Apéndice 10 (Anexo 22)
           </h1>
           <p className="text-slate-500 text-sm mt-1">Diccionario aduanero de Tipos de Contenedores y Vehículos de Autotransporte (RGCE).</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Búsqueda rápida..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none w-64 shadow-sm"
                />
             </div>
             <button 
                 onClick={() => setIsMassQueryOpen(true)} 
                 className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
             >
                 <Filter size={16} className="mr-2" />
                 Filtros
             </button>
             <button onClick={autoSeed} disabled={isSeeding} className="bg-indigo-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-indigo-700 shadow-md transition-all font-medium text-sm disabled:opacity-70 disabled:cursor-not-allowed">
                Retomar Catálogo Oficial
             </button>
             <button onClick={openNew} className="bg-green-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-green-700 shadow-md shadow-green-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Nueva Clave
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium w-32 border-r border-slate-100">Clave Apéndice</th>
              <th className="p-4 font-medium">Descripción Oficial SAT</th>
              <th className="p-4 font-medium text-right w-32">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredRegistros.map(c => (
              <tr key={c.clave} className="hover:bg-slate-50 transition-colors group">
                <td className="p-4 font-semibold text-green-700 font-mono text-center border-r border-slate-100 text-lg">{c.clave}</td>
                <td className="p-4 text-slate-700 font-medium">{c.descripcion}</td>
                <td className="p-4 flex gap-2 justify-end">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(c.clave)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredRegistros.length === 0 && !loading && !isSeeding && (
              <tr><td colSpan={3} className="p-12 text-center text-slate-400">No hay claves aduaneras registradas.</td></tr>
            )}
            {isSeeding && <tr><td colSpan={3} className="p-12 text-center text-green-600 font-bold animate-pulse">Sincronizando y Descargando catálogo SAT oficial en la red...</td></tr>}
            {loading && !isSeeding && <tr><td colSpan={3} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={['clave', 'descripcion']}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in">
           <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform scale-100 transition-transform">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                <BookOpen className="text-green-600" />
                {isEditing ? 'Editar Clave' : 'Nueva Clave'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clave (ID Numérico)</label>
                <input required disabled={isEditing} value={formData.clave || ''} onChange={e => setFormData({...formData, clave: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:outline-none disabled:bg-slate-50 font-mono disabled:text-slate-400" placeholder="Ej. 11, 23" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Contenedor</label>
                <textarea required value={formData.descripcion || ''} onChange={e => setFormData({...formData, descripcion: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none uppercase min-h-[100px] resize-none" placeholder="Ej. CONTENEDOR ESTÁNDAR 20'" />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
