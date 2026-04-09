import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface MultiSearchableComboBoxProps {
  options: ComboOption[];
  value: string[]; // Array of selected values
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const MultiSearchableComboBox: React.FC<MultiSearchableComboBoxProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar múltiples...',
  disabled = false,
  className = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase())) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleRemoveValue = (e: React.MouseEvent, val: string) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== val));
  };

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} id={id}>
      {/* Trigger button */}
      <div
        onClick={handleOpen}
        className={`w-full min-h-[42px] flex flex-wrap items-center gap-1.5 border rounded-lg px-2 py-1.5 text-sm transition-all
          ${disabled ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 hover:border-blue-400 cursor-pointer'}
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-100' : ''}`}
      >
        {value.length === 0 ? (
          <span className="text-slate-400 ml-1">{placeholder}</span>
        ) : (
          value.map(val => {
            const opt = options.find(o => o.value === val);
            return (
              <span key={val} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                {opt ? opt.label : val}
                {!disabled && (
                  <X size={12} className="cursor-pointer hover:text-red-500" onClick={(e) => handleRemoveValue(e, val)} />
                )}
              </span>
            );
          })
        )}
        <div className="flex-1 min-w-[30px]"></div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[210] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in shadow-blue-500/10">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar modelos..."
              className="flex-1 text-sm outline-none text-slate-700"
            />
          </div>

          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">Sin resultados</div>
            ) : (
              filtered.map(o => {
                const isSelected = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => handleToggleOption(o.value)}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between
                      ${isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                  >
                    <div className="flex flex-col">
                        <span>{o.label}</span>
                        {o.sublabel && <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{o.sublabel}</span>}
                    </div>
                    {isSelected && <Check size={14} className="text-blue-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
