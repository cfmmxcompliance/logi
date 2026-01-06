import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { PedimentoRecord } from '../../types.ts';

interface ChartsProps {
  data: PedimentoRecord[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export const OperationsChart: React.FC<ChartsProps> = ({ data }) => {
  const imp = data.filter(r => r.tipoOperacion === '1').length;
  const exp = data.filter(r => r.tipoOperacion === '2').length;
  const isEmpty = imp === 0 && exp === 0;

  const chartData = [
    { name: 'Importación', value: imp },
    { name: 'Exportación', value: exp },
  ];

  if (isEmpty) {
    return (
      <div className="h-64 w-full flex flex-col items-center justify-end pb-4 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-slate-300 text-sm italic">Sin operaciones registradas</span>
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <span className="text-sm text-slate-500">Importación</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-sm text-slate-500">Exportación</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} />
          <RechartsTooltip />
          <Bar dataKey="value">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.name === 'Importación' ? '#3b82f6' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TopSuppliersChart: React.FC<ChartsProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-64 w-full flex flex-col justify-between py-8 px-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="border-b border-dashed border-slate-200 h-8 w-full"></div>
        ))}
      </div>
    );
  }

  const supplierMap = new Map<string, number>();

  data.forEach(r => {
    r.invoices.forEach(inv => {
      const name = inv.proveedor || 'DESCONOCIDO';
      const val = supplierMap.get(name) || 0;
      supplierMap.set(name, val + inv.valorDolares);
    });
  });

  const chartData = Array.from(supplierMap.entries())
    .map(([name, value]) => ({ name: name.substring(0, 15), fullName: name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={100} style={{ fontSize: '12px' }} />
          <RechartsTooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Valor USD']}
            labelFormatter={(label, payload) => {
              if (payload && payload.length > 0) return payload[0].payload.fullName;
              return label;
            }}
          />
          <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};