import React from 'react';
import { Search } from 'lucide-react';

interface Props {
  dateStart: string;
  setDateStart: (d: string) => void;
  dateEnd: string;
  setDateEnd: (d: string) => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  onSearch?: () => void;
}

export const HandheldToolbar: React.FC<Props> = ({ dateStart, setDateStart, dateEnd, setDateEnd, searchTerm, setSearchTerm, onSearch }) => {
  return (
    <div className="bg-slate-900 border-b border-slate-800 p-3 shadow-md z-10 sticky top-[60px]">
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase ml-1">Desde</label>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} onBlur={onSearch} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:border-sky-500 outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-slate-400 font-bold uppercase ml-1">Hasta</label>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} onBlur={onSearch} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:border-sky-500 outline-none" />
        </div>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
        <input 
          type="text" 
          placeholder="Buscar caja, placas, transporte..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-sky-500 outline-none" 
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white">✕</button>
        )}
      </div>
    </div>
  );
};
