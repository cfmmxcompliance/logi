import React, { useState, useMemo } from 'react';
import { CustomsClearanceRecord } from '../types.ts';
import { Calendar, Filter } from 'lucide-react';

interface Props {
  customs: CustomsClearanceRecord[];
}

const SPECIALIST_CONFIG: Record<string, { num: string, bg: string, color: string }> = {
  Jorge: { num: '01', bg: '#000080', color: '#ffffff' },
  Imelda: { num: '02', bg: '#800060', color: '#ffffff' }, // Magenta oscuro
  'Héctor': { num: '04', bg: '#2b5329', color: '#ffffff' }, // Verde oscuro
  Hector: { num: '04', bg: '#2b5329', color: '#ffffff' }, // Alternativa sin acento
  Alessandro: { num: '05', bg: '#40e0d0', color: '#000000' }, // Turquesa
  Alejandra: { num: '06', bg: '#9932cc', color: '#ffffff' }, // Morado
  Daniela: { num: '07', bg: '#d4af37', color: '#000000' }, // Dorado / Mostaza
  Hannia: { num: '08', bg: '#f08080', color: '#000000' }, // Salmon
  Luis: { num: '09', bg: '#8b0000', color: '#ffffff' }, // Rojo oscuro
  Michelle: { num: '10', bg: '#a3ff00', color: '#000000' }, // Verde lima
  Alan: { num: '11', bg: '#4682b4', color: '#ffffff' }, // Azul acero
  Carlos: { num: '12', bg: '#4169e1', color: '#ffffff' }, // Azul rey
};

export const SpecialistsPerformanceTable: React.FC<Props> = ({ customs }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const performanceData = useMemo(() => {
    let filtered = customs;
    
    if (startDate) {
      filtered = filtered.filter(c => c.updatedAt && c.updatedAt >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(c => c.updatedAt && c.updatedAt <= endDate + 'T23:59:59');
    }

    const grouped = filtered.reduce((acc, record) => {
      // Tomar nombre de primer nombre (e.g., "Jorge Pérez" -> "Jorge") para clasificar
      const rawSpec = record.assignedSpecialist || record.proformaRevisionBy || 'Unassigned';
      const firstName = rawSpec.split(' ')[0]; 
      
      const configKey = Object.keys(SPECIALIST_CONFIG).find(k => k.toLowerCase() === firstName.toLowerCase()) || rawSpec;
      
      if (!acc[configKey]) {
        acc[configKey] = {
          name: configKey,
          bls: new Set<string>(),
          completedBls: new Set<string>(),
          totalContainers: 0,
          completedContainers: 0
        };
      }
      
      acc[configKey].totalContainers += 1;
      
      if (record.blNo) {
        acc[configKey].bls.add(record.blNo);
      }
      
      const isComplete = !!record.pedimentoPaymentDate || !!record.ataFactory;
      if (isComplete) {
        acc[configKey].completedContainers += 1;
        if (record.blNo) acc[configKey].completedBls.add(record.blNo);
      }
      
      return acc;
    }, {} as Record<string, { name: string, bls: Set<string>, completedBls: Set<string>, totalContainers: number, completedContainers: number }>);

    const baseData = Object.values(grouped).map(g => ({
      name: g.name,
      config: SPECIALIST_CONFIG[g.name] || { num: '??', bg: '#ffffff', color: '#000000' },
      totalBls: g.bls.size,
      completedBls: g.completedBls.size,
      totalContainers: g.totalContainers,
      completedContainers: g.completedContainers,
      pendingContainers: g.totalContainers - g.completedContainers
    }));

    // Asegurar que salgan siempre los de la configuracion aunque estén en 0
    const finalData = Object.keys(SPECIALIST_CONFIG).map(configName => {
      const existing = baseData.find(d => d.name === configName);
      if (existing) return existing;
      return {
        name: configName,
        config: SPECIALIST_CONFIG[configName],
        totalBls: 0,
        completedBls: 0,
        totalContainers: 0,
        completedContainers: 0,
        pendingContainers: 0
      };
    });

    return finalData.sort((a, b) => {
       const numA = parseInt(a.config.num) || 999;
       const numB = parseInt(b.config.num) || 999;
       return numA - numB;
    });
  }, [customs, startDate, endDate]);

  const totals = performanceData.reduce((acc, row) => ({
    totalBls: acc.totalBls + row.totalBls,
    completedBls: acc.completedBls + row.completedBls,
    totalContainers: acc.totalContainers + row.totalContainers,
    completedContainers: acc.completedContainers + row.completedContainers,
    pendingContainers: acc.pendingContainers + row.pendingContainers,
  }), { totalBls: 0, completedBls: 0, totalContainers: 0, completedContainers: 0, pendingContainers: 0 });

  return (
    <div className="w-full mt-8">
      {/* Filtro de Fechas solicitado */}
      <div className="flex items-center mb-2 gap-2 bg-slate-50 w-fit p-1.5 border border-slate-300">
        <Calendar size={16} className="text-slate-600" />
        <input 
          type="date" 
          className="bg-transparent border-none text-sm focus:ring-0 text-slate-800 outline-none p-0"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <span className="text-slate-600 font-bold px-2">-</span>
        <input 
          type="date" 
          className="bg-transparent border-none text-sm focus:ring-0 text-slate-800 outline-none p-0"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse border border-black font-sans text-sm" style={{ minWidth: '800px' }}>
          <thead>
            {/* overarching header */}
            <tr>
              <th colSpan={7} className="border border-black bg-[#f2cc66] font-bold text-black py-1 px-2 italic text-[13px]">
                Operaciones asignadas a los especialistas
              </th>
            </tr>
            {/* column headers */}
            <tr className="bg-[#3b4b6b] text-white">
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full break-words">Nombre del<br/>especialista</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full break-words">Número de<br/>expeicalista</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[10%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full uppercase">TOTAL DE BLS</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full uppercase">COMPLETADOS</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full uppercase break-words">TOTAL DE<br/>CONTENEDORES</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full uppercase break-words">TOTAL DE<br/>CONTENEDORES<br/>COMPLETADOS</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
              <th className="border border-black py-2 px-2 w-[15%]">
                <div className="flex items-center justify-between">
                  <span className="text-center w-full uppercase break-words">CONTENEDORES<br/>PENDIENTES</span>
                  <div className="bg-white bg-opacity-20 p-0.5 rounded text-white ml-1">
                    <Filter size={12} fill="white" />
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {performanceData.map((row, idx) => (
              <tr key={idx} className="bg-white text-black font-semibold">
                <td className="border border-black py-1 px-2">{row.name}</td>
                <td className="border border-black p-0">
                  <div style={{ backgroundColor: row.config.bg, color: row.config.color }} className="w-full relative py-1 px-2 overflow-hidden shadow-inner">
                    <div className="absolute top-0 left-0 w-3 h-full border-r border-[#ffffff33] bg-[#ffffff1a] skew-x-12 transform -translate-x-1"></div>
                    {row.config.num}
                  </div>
                </td>
                <td className="border border-black py-1 px-2 font-normal text-[15px]">{row.totalBls}</td>
                <td className="border border-black py-1 px-2 font-normal text-[15px]">{row.completedBls}</td>
                <td className="border border-black py-1 px-2 font-normal text-[15px]">{row.totalContainers}</td>
                <td className="border border-black py-1 px-2 font-normal text-[15px]">{row.completedContainers}</td>
                <td className="border border-black py-1 px-2 font-normal text-[15px]">{row.pendingContainers}</td>
              </tr>
            ))}
            
            {/* Total Row */}
            <tr className="bg-[#f2cc66] font-bold">
              <td className="border border-black py-1 px-2 text-right" colSpan={2}>Total</td>
              <td className="border border-black py-1 px-2 text-black text-[15px]">{totals.totalBls}</td>
              <td className="border border-black py-1 px-2 text-[#00b050] text-[15px]">{totals.completedBls}</td>
              <td className="border border-black py-1 px-2 text-black text-[15px]">{totals.totalContainers}</td>
              <td className="border border-black py-1 px-2 text-[#00b050] text-[15px]">{totals.completedContainers}</td>
              <td className="border border-black py-1 px-2 text-red-600 text-[15px]">{totals.pendingContainers}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
