import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Ship, FileText, FileCheck, BarChart3, Settings, Menu, X, LogOut, Users, Anchor, Container, ClipboardCheck, Bell, Scale, Truck, Globe, Activity, FolderOpen,
  Navigation,
  Box, DollarSign, BookOpen, PackageOpen, Cpu, Sparkles, CalendarCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { UserRole } from '../types.ts';
import { storageService } from '../services/storageService.ts';
import { useLanguage } from '../context/LanguageContext';

const SyncIndicator = () => {
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    // Poll or subscribe to check sync status
    const check = () => {
      // @ts-ignore
      if (typeof storageService.isBackgroundSyncing === 'function') {
        // @ts-ignore
        setSyncing(storageService.isBackgroundSyncing());
      }
    };

    // Subscribe to storage updates
    // @ts-ignore
    const unsub = storageService.subscribe(check);
    return () => { if (unsub) unsub(); };
  }, []);

  if (!syncing) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100 animate-pulse">
      <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-200 border-t-indigo-600"></div>
      SYNCING...
    </div>
  );
};

const SidebarItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <NavLink
      to={to}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const { user, logout } = useAuth();
  const { toggleLanguage, language, t } = useLanguage();

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 flex-shrink-0 transition-all duration-300 flex flex-col`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {sidebarOpen && <h1 className="text-xl font-bold text-white tracking-wider">LOGIMASTER</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-2 space-y-2 min-h-0">
          {user?.role === UserRole.ADMIN && (
            <SidebarItem to="/" icon={LayoutDashboard} label={sidebarOpen ? "Dashboard" : ""} />
          )}

          {user?.role !== UserRole.AGENT && user?.role !== UserRole.EXPO && user?.role !== UserRole.CARRIER && user?.role !== UserRole.EMBARQUES && (
            <>
              <SidebarItem to="/operations" icon={Ship} label={sidebarOpen ? "Shipment Plan" : ""} />
              <SidebarItem to="/pre-alerts" icon={Bell} label={sidebarOpen ? "Pre-Alerts" : ""} />
              <SidebarItem to="/vessel-tracking" icon={Anchor} label={sidebarOpen ? "Tracking" : ""} />
              <SidebarItem to="/equipment-tracking" icon={Container} label={sidebarOpen ? "Equipment" : ""} />
              <SidebarItem to="/customs-clearance" icon={ClipboardCheck} label={sidebarOpen ? "Customs Clearance" : ""} />
              <SidebarItem to="/commercial-invoices" icon={FileText} label={sidebarOpen ? "CI Extractor" : ""} />
              <SidebarItem to="/xml-invoices" icon={Database} label={sidebarOpen ? "Facturas XML" : ""} />
              <SidebarItem to="/xml-ci" icon={FileText} label={sidebarOpen ? "XMLCI" : ""} />
              <SidebarItem to="/ccp-builder" icon={Truck} label={sidebarOpen ? "CCP Builder" : ""} />
            </>
          )}

          {(user?.role === UserRole.ADMIN || user?.role === UserRole.CONTROLLER || user?.role === UserRole.EDITOR) && (
            <>
              <SidebarItem to="/controller" icon={Settings} label={sidebarOpen ? "Payments" : ""} />
            </>
          )}

          {/* RBAC: Restricted Areas (Admins only) */}
          {user?.role === UserRole.ADMIN && (
            <>
              <SidebarItem to="/data-stage" icon={Scale} label={sidebarOpen ? "Data Stage (SAT)" : ""} />
              <SidebarItem to="/vucem" icon={Globe} label={sidebarOpen ? "VUCEM" : ""} />
              <SidebarItem to="/expediente-electronico" icon={FolderOpen} label={sidebarOpen ? "Expedientes Digitales" : ""} />
              <SidebarItem to="/proforma-validator" icon={FileCheck} label={sidebarOpen ? "Validador Proforma" : ""} />
              <SidebarItem to="/bom-analyzer" icon={Cpu} label={sidebarOpen ? "BOM Analyzer" : ""} />
              <SidebarItem to="/documents" icon={FileText} label={sidebarOpen ? "Smart Docs" : ""} />
              <SidebarItem to="/ai-assistant" icon={Sparkles} label={sidebarOpen ? t("menu.ai") : ""} />
            </>
          )}

          {/* Master Data: Accessible to Admin, Editor, Agent, Controller */}
          {[UserRole.ADMIN, UserRole.EDITOR, UserRole.AGENT, UserRole.CONTROLLER].includes(user?.role as UserRole) && (
            <>
              <SidebarItem to="/apendice10" icon={BookOpen} label={sidebarOpen ? "Apéndice 10" : ""} />
              <SidebarItem to="/database" icon={Database} label={sidebarOpen ? "Master Data" : ""} />
              <SidebarItem to="/bpm" icon={Box} label={sidebarOpen ? "BPM Clasificación" : ""} />
            </>
          )}

          {/* Logistics Planning -> Admin, Editor, Agent, Controller, Expo */}
          {[UserRole.ADMIN, UserRole.EDITOR, UserRole.AGENT, UserRole.CONTROLLER, UserRole.EXPO].includes(user?.role as UserRole) && (
            <>
              <SidebarItem to="/models" icon={Box} label={sidebarOpen ? "Models (Expo)" : ""} />
              <SidebarItem to="/pricing-matrix" icon={DollarSign} label={sidebarOpen ? "Pricing Matrix" : ""} />
              <SidebarItem to="/shipping-schedules" icon={Ship} label={sidebarOpen ? "Shipping Sched." : ""} />
              <SidebarItem to="/daily-van-assignment" icon={CalendarCheck} label={sidebarOpen ? "Daily Van Assignment" : ""} />
            </>
          )}

          {/* Macro Module -> Admin, Editor, Agent, Controller, Expo (EXCLUDES CARRIER) */}
          {import.meta.env.DEV && [UserRole.ADMIN, UserRole.EDITOR, UserRole.AGENT, UserRole.CONTROLLER, UserRole.EXPO].includes(user?.role as UserRole) && (
              <SidebarItem to="/macro" icon={PackageOpen} label={sidebarOpen ? "Motor de Captura (Macro)" : ""} />
          )}

          {/* Operational Transport -> Admin, Editor, Agent, Controller, Carrier, Embarques (NOT Expo) */}
          {[UserRole.ADMIN, UserRole.EDITOR, UserRole.AGENT, UserRole.CONTROLLER, UserRole.CARRIER, UserRole.EMBARQUES].includes(user?.role as UserRole) && (
            <>
              {user?.role !== UserRole.CARRIER && user?.role !== UserRole.EMBARQUES && (
                  <SidebarItem to="/carriers" icon={Anchor} label={sidebarOpen ? t("menu.carriers") : ""} />
              )}
              {user?.role !== UserRole.EMBARQUES && (
                <>
                  <SidebarItem to="/transport-lines" icon={Truck} label={sidebarOpen ? t("menu.líneas") : ""} />
                  <SidebarItem to="/drivers" icon={Users} label={sidebarOpen ? t("menu.drivers") : ""} />
                  <SidebarItem to="/cajas" icon={Container} label={sidebarOpen ? t("menu.cajas") : ""} />
                </>
              )}
              <SidebarItem to="/asignaciones-diarias" icon={Navigation} label={sidebarOpen ? t("menu.asignaciones") : ""} />
            </>
          )}

          {/* Expo: only Daily Van Assignment and Asignaciones (read-only) */}
          {user?.role === UserRole.EXPO && (
            <SidebarItem to="/asignaciones-diarias" icon={Navigation} label={sidebarOpen ? t("menu.asignaciones") : ""} />
          )}

          {/* Daily Audit: Accessible to Everyone (except Pending, Carrier, Expo, Embarques) */}
          {user?.role !== UserRole.PENDING && user?.role !== UserRole.EXPO && user?.role !== UserRole.CARRIER && user?.role !== UserRole.EMBARQUES && (
            <SidebarItem to="/daily-audit" icon={Activity} label={sidebarOpen ? "Control de Auditoría" : ""} />
          )}

          {/* Partners & Setup: Admins and Editors */}
          {(user?.role === UserRole.ADMIN || user?.role === UserRole.EDITOR) && (
            <SidebarItem to="/suppliers" icon={Users} label={sidebarOpen ? "Partners" : ""} />
          )}

          {/* Advanced Admin Modules */}
          {user?.role === UserRole.ADMIN && (
            <>
              <SidebarItem to="/reports" icon={BarChart3} label={sidebarOpen ? "Reports & KPIs" : ""} />
              <SidebarItem to="/audit-logs" icon={ClipboardCheck} label={sidebarOpen ? "Bitácora de Sistema" : ""} />
              <SidebarItem to="/settings" icon={Settings} label={sidebarOpen ? "Settings" : ""} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {sidebarOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 bg-slate-800 p-2 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                  {user?.avatarInitials}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 justify-center w-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <button onClick={logout} className="mx-auto w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white bg-slate-800 rounded-lg">
              <LogOut size={20} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-slate-700">CFMoto Import/Export Control</h2>
          <div className="flex items-center space-x-4">
            <button
               onClick={toggleLanguage} 
               className="flex items-center justify-center font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 py-1.5 transition-colors border border-slate-200"
               title="Cambiar Idioma / Toggle Language"
            >
               {language === 'es' ? 'ES | EN' : 'EN | ES'}
            </button>
            <ConnectionStatus />
            <SyncIndicator />
            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${user?.role === 'Admin' ? 'bg-red-50 text-red-600 border-red-200' :
              user?.role === 'Editor' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
              {user?.role.toUpperCase()} ACCESS
            </div>
          </div>
        </header>
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-8 pb-0">
          {children}
        </div>
      </main>
    </div>
  );
};