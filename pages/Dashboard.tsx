import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { storageService } from '../services/storageService.ts';
import { ShipmentStatus, UserRole } from '../types.ts';
import { Database, Play, AlertCircle, CheckCircle, Loader2, Anchor, Ship, Container, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';

const StatCard = ({ title, value, sub, color, icon: Icon }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-start justify-between">
    <div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
        <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${color}`}>{value}</span>
        </div>
        <span className="text-xs text-slate-400 mt-1 block">{sub}</span>
    </div>
    {Icon && <div className={`p-3 rounded-lg ${color.replace('text-', 'bg-').replace('600', '50')} ${color}`}><Icon size={24} /></div>}
  </div>
);

export const Dashboard = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole([UserRole.ADMIN]);

  // Reactive State
  const [shipments, setShipments] = useState(storageService.getShipments());
  const [vessels, setVessels] = useState(storageService.getVesselTracking());
  const [equipment, setEquipment] = useState(storageService.getEquipmentTracking());
  const [customs, setCustoms] = useState(storageService.getCustomsClearance());
  const [costs, setCosts] = useState(storageService.getCosts());
  
  const [seeding, setSeeding] = useState(false);

  // Real-time listener
  useEffect(() => {
    // Initial fetch
    const refreshData = () => {
        setShipments([...storageService.getShipments()]);
        setVessels([...storageService.getVesselTracking()]);
        setEquipment([...storageService.getEquipmentTracking()]);
        setCustoms([...storageService.getCustomsClearance()]);
        setCosts([...storageService.getCosts()]);
    };
    
    refreshData();
    const unsub = storageService.subscribe(refreshData);
    return unsub;
  }, []);
  
  // --- KPI CALCULATIONS ---
  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // 1. Vessels on Water (Has ETD, No ATA Port)
  const vesselsOnWater = vessels.filter(v => v.etd && !v.ataPort).length;

  // 2. Customs Pending (At Port but not Cleared/Paid)
  // Logic: Has ATA Port but no Pedimento Payment or ATA Factory
  const customsPending = customs.filter(c => c.ataPort && !c.pedimentoPaymentDate).length;

  // 3. Delivered (This Month) - Based on ATA Factory in Customs
  const deliveredMonth = customs.filter(c => {
      if (!c.ataFactory) return false;
      const date = new Date(c.ataFactory);
      return date.getMonth() === currentMonthIdx && date.getFullYear() === currentYear;
  }).length;
  
  // 4. Total Costs (All time or MTD)
  const totalCost = costs.reduce((sum, c) => sum + (c.amount || 0), 0);

  // --- CHART DATA GENERATION ---
  
  const chartData = useMemo(() => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const data = months.map(m => ({ name: m, Planned: 0, Arrived: 0 }));
      
      vessels.forEach(v => {
          // Planned Volume (based on ETA Port)
          if (v.etaPort) {
              const d = new Date(v.etaPort);
              if (!isNaN(d.getTime())) {
                  data[d.getMonth()].Planned += 1; // Counting records/containers
              }
          }
          // Actual Volume (based on ATA Port)
          if (v.ataPort) {
              const d = new Date(v.ataPort);
              if (!isNaN(d.getTime())) {
                  data[d.getMonth()].Arrived += 1;
              }
          }
      });
      
      // Return roughly the current window of the year (e.g. up to current month + 2)
      return data;
  }, [vessels]);

  const handleQuickSeed = async () => {
      if(!window.confirm("¿Inicializar base de datos con datos de prueba ahora?")) return;
      
      setSeeding(true);
      try {
          // @ts-ignore
          await storageService.seedDatabase();
          alert("✅ Base de datos inicializada correctamente.");
          window.location.reload();
      } catch (e: any) {
          console.error(e);
          if (e.code === 'permission-denied' || e.message?.includes('permission') || e.message?.includes('Missing or insufficient permissions')) {
               alert(
                 "⛔ ERROR DE PERMISOS\n\n" +
                 "Firebase ha bloqueado la escritura de datos. Esto es normal si acabas de crear el proyecto.\n\n" +
                 "SOLUCIÓN:\n" +
                 "1. Ve a la Consola de Firebase > Firestore Database > Reglas (Rules).\n" +
                 "2. Cambia 'allow read, write: if false;' por 'allow read, write: if true;'\n" +
                 "3. Haz clic en Publicar."
               );
          } else {
              alert("Error al inicializar: " + e.message);
          }
      } finally {
          setSeeding(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Operational Overview</h1>
        <div className="flex flex-col items-end">
            <div className="text-sm text-slate-500 flex items-center gap-2">
                 <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-slate-600 font-medium ${storageService.isCloudMode() ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>
                    <Database size={14} /> {storageService.isCloudMode() ? 'Firebase Cloud' : 'Local Storage Mode'}
                 </span>
            </div>
        </div>
      </div>

      {/* EMPTY STATE BANNER FOR ADMINS */}
      {vessels.length === 0 && equipment.length === 0 && isAdmin && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top duration-500">
              <div className="flex items-start gap-4">
                  <div className="bg-blue-600 text-white p-3 rounded-full shadow-md">
                      <Database size={24} />
                  </div>
                  <div>
                      <h3 className="text-lg font-bold text-blue-900">Base de datos lista para inicializar</h3>
                      <p className="text-blue-700 mt-1 max-w-xl text-sm leading-relaxed">
                          Haz clic para cargar datos de prueba en los módulos de Operaciones, Vessel Tracking y Customs.
                      </p>
                  </div>
              </div>
              <button 
                  onClick={handleQuickSeed}
                  disabled={seeding}
                  className="whitespace-nowrap flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-lg hover:bg-blue-700 font-bold shadow-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-wait"
              >
                  {seeding ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />} 
                  {seeding ? 'Creando datos...' : 'Inicializar Datos'}
              </button>
          </div>
      )}

      {/* DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
            title="Vessels on Water" 
            value={vesselsOnWater} 
            sub="Active Shipments (En Route)" 
            color="text-blue-600" 
            icon={Anchor}
        />
        <StatCard 
            title="Containers at Port" 
            value={customsPending} 
            sub="Pending Customs Clearance" 
            color="text-amber-600" 
            icon={Container}
        />
        <StatCard 
            title="Delivered (This Month)" 
            value={deliveredMonth} 
            sub="Containers Cleared & Received" 
            color="text-emerald-600" 
            icon={ClipboardCheck}
        />
        <StatCard 
            title="Total Logistics Spend" 
            value={`$${totalCost.toLocaleString(undefined, {maximumFractionDigits: 0})}`} 
            sub="Freight + Customs + Transport" 
            color="text-slate-800" 
            icon={Ship}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-lg mb-4 text-slate-700">Inbound Volume (Containers)</h3>
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" />
                <Bar name="Planned (ETA)" dataKey="Planned" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Bar name="Arrived (ATA)" dataKey="Arrived" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-lg mb-4 text-slate-700">Delivery Flow Trend</h3>
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorArrived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Area type="monotone" dataKey="Arrived" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorArrived)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};