import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableComboBoxProps {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  id?: string;
}

export const SearchableComboBox: React.FC<SearchableComboBoxProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false,
  className = '',
  required = false,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(o => o.value === value);

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

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (option: ComboOption) => {
    onChange(option.value);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} id={id}>
      {/* Hidden native select for form validation */}
      {required && (
        <select
          required
          value={value}
          onChange={() => {}}
          aria-hidden
          tabIndex={-1}
          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <option value=""></option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2.5 text-sm text-left transition-all outline-none
          ${disabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60' : 'bg-white border-slate-300 hover:border-blue-400 cursor-pointer'}
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-100' : ''}`}
      >
        <span className={`flex-1 truncate font-mono ${selectedOption ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedOption ? (
            <span>
              {selectedOption.label}
              {selectedOption.sublabel && <span className="text-slate-400 ml-1 font-normal text-xs">— {selectedOption.sublabel}</span>}
            </span>
          ) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span onClick={handleClear} className="text-slate-400 hover:text-red-500 transition-colors p-0.5">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[200] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in">
          {/* Search input */}
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">Sin resultados para "{search}"</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o)}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2
                    ${o.value === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                >
                  <span className="font-mono text-xs text-slate-500 shrink-0">{o.value}</span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.sublabel && <span className="text-xs text-slate-400 shrink-0">{o.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
