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

  const chartData = [
    { name: 'Importación', value: imp },
    { name: 'Exportación', value: exp },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#ef4444'} />
            ))}
          </Pie>
          <RechartsTooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TopSuppliersChart: React.FC<ChartsProps> = ({ data }) => {
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