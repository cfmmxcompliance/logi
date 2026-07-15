import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Ship, FileText, FileCheck, BarChart3, Settings, Menu, X, LogOut, Users, Anchor, Container, ClipboardCheck, Bell, Scale, Truck, Globe, Activity, FolderOpen,
  Navigation, Monitor,
  Box, DollarSign, BookOpen, PackageOpen, Cpu, Sparkles, CalendarCheck, History, Package, CalendarDays, ClipboardList, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { UserRole } from '../types.ts';
import { storageService } from '../services/storageService.ts';
import { useLanguage } from '../context/LanguageContext';
import { demandaCarga53Service } from '../services/demandaCarga53Service.ts';
import { reservaVentana53Service } from '../services/reservaVentana53Service.ts';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebaseConfig.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { liberacionService } from '../services/liberacionService.ts';
import { transportLineService } from '../services/transportLineService.ts';

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

const SidebarItem = ({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) => {
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
      <div className="relative">
        <Icon size={20} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        )}
      </div>
      <span className="font-medium flex-1">{label}</span>
      {badge != null && badge > 0 && label && (
        <span className="ml-auto bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </NavLink>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ventanasBadge, setVentanasBadge] = useState(0);
  const [reservasBadge, setReservasBadge] = useState(0);
  const [asignacionesBadge, setAsignacionesBadge] = useState(0);       // Carrier/Transportista
  const [asignacionesBadgeAdmin, setAsignacionesBadgeAdmin] = useState(0); // Admin/Expo/Embarques
  const { user, logout } = useAuth();
  const { toggleLanguage, language, t } = useLanguage();
  const location = useLocation();

  // useRef so the event listener always reads the latest values without stale closures
  const checkRef = React.useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const check = async () => {
      try {
        // --- Badges 1 y 2: Ventanas 53 ---
        const [demandas, allVentanas, reservas] = await Promise.all([
          demandaCarga53Service.getAllDemandas().catch(() => []),
          getDocs(collection(db, 'ventanasCarga53')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))).catch(() => []),
          reservaVentana53Service.getAllReservas().catch(() => []),
        ]);

        const activas = demandas.filter((d: any) =>
          ['Confirmada', 'Enviada a carriers', 'En proceso de reserva'].includes(d.estatus)
        );

        const needVentanas = activas.filter((d: any) => {
          const cap = allVentanas
            .filter((v: any) => v.fecha === d.fechaDemanda)
            .reduce((s: number, v: any) => s + v.capacidadCajas, 0);
          return cap < d.totalCajasSolicitadas;
        }).length;

        const needCarrier = activas.filter((d: any) => {
          const cap = allVentanas
            .filter((v: any) => v.fecha === d.fechaDemanda)
            .reduce((s: number, v: any) => s + v.capacidadCajas, 0);
          if (cap < d.totalCajasSolicitadas) return false;
          const reserved = (reservas as any[])
            .filter(r => r.demandaId === d.id && ['Reservada', 'Confirmada'].includes(r.estatus))
            .reduce((s: number, r: any) => s + r.cajasReservadas, 0);
          return reserved < d.totalCajasSolicitadas;
        }).length;

        setVentanasBadge(needVentanas);
        setReservasBadge(needCarrier);

        // --- Badge 3: Asignación Diaria de Cajas ---
        // getDocs directo igual que Ventana 53
        let badge = 0;
        try {
          // Leer el rango de fechas que el usuario tiene seleccionado en el módulo
          const savedRange = (() => { try { return JSON.parse(localStorage.getItem('asig_dateRange') || 'null'); } catch { return null; } })();
          const today = new Date().toISOString().split('T')[0];
          const rangeStart = savedRange?.start || today;
          const rangeEnd = savedRange?.end || today;

          const [asignaciones, liberaciones, transportLines] = await Promise.all([
             asignacionCajaService.getAsignacionesByDateRange(rangeStart, rangeEnd).catch(() => []),
             liberacionService.getLiberacionesByDateRange(rangeStart, rangeEnd).catch(() => []),
             transportLineService.getAllTransportLines().catch(() => [])
          ]);

          const userScac = String(user?.scac || '').trim().toUpperCase();
          const matchingTLs = new Set(
            transportLines
                .filter(tl => String(tl.TransportLine || '').trim().toUpperCase() === userScac)
                .map(tl => tl.transportLineId)
                .filter(Boolean)
          );

          badge = asignaciones.filter(a => {
            // Role-based visibility filtering
            if (user?.role === UserRole.CARRIER && user?.scac) {
              if (String((a as any).carrierCodigo || '').trim().toUpperCase() !== userScac) return false;
            }
            if (user?.role === UserRole.TRANSPORTISTA && user?.scac) {
              const matchesId = (a as any).transportLineId && matchingTLs.has((a as any).transportLineId);
              const matchesName = String((a as any).subLinea || (a as any).scac || '').trim().toUpperCase() === userScac;
              if (!matchesId && !matchesName) return false;
            }

            const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
            const isRechazado = dockVal === 'RECHAZADO';
            const isDrop = dockVal === 'DROP';
            const isNoShow = dockVal === 'NO SHOW';
            const hasUSDB1 = String((a as any).observaciones || '').toUpperCase().includes('USDB1');
            if (isRechazado || isDrop || isNoShow || hasUSDB1) return false;

            const hasLayout = !!(a as any).layoutUrl || !!(a as any).layoutUploadedAt;
            const hasCCP = !!(a as any).ccpUrl || !!(a as any).ccpUploadedAt;
            const isClosed = liberaciones.some(l => (l as any).asignacionCajaId === a.id && !!(l as any).selloValidado);
            return hasLayout && !hasCCP && !isClosed;
          }).length;

          // Admin/Expo/Embarques: CCP subido pero sin cierre (selloValidado)
          const badgeAdmin = asignaciones.filter(a => {
            const fecha = (a as any).fecha || '';
            const inRange = fecha >= rangeStart && fecha <= rangeEnd;
            const dockVal2 = String((a as any).dockArribo || '').trim().toUpperCase();
            const isRechazado = dockVal2 === 'RECHAZADO';
            const isDrop = dockVal2 === 'DROP';
            const isNoShow = dockVal2 === 'NO SHOW';
            const hasUSDB1 = String((a as any).observaciones || '').toUpperCase().includes('USDB1');
            if (isRechazado || isDrop || isNoShow || hasUSDB1) return false;

            const hasCCP = !!(a as any).ccpUrl || !!(a as any).ccpUploadedAt;
            const isClosed = liberaciones.some(l => (l as any).asignacionCajaId === a.id && !!(l as any).selloValidado);
            return inRange && hasCCP && !isClosed;
          }).length;
          setAsignacionesBadgeAdmin(badgeAdmin);
        } catch { /* sin permisos o sin datos */ }
        setAsignacionesBadge(badge);
      } catch { /* silent */ }
    };

    // Ref siempre apunta a la versión más reciente de check()
    checkRef.current = check;
    check();
  }, [location.pathname, user?.email]);

  // Listener registrado UNA sola vez, llama siempre al check() más reciente
  useEffect(() => {
    const handler = () => checkRef.current();
    window.addEventListener('reserva:changed', handler);
    return () => window.removeEventListener('reserva:changed', handler);
  }, []);

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
            <>
              <SidebarItem to="/" icon={LayoutDashboard} label={sidebarOpen ? "Dashboard" : ""} />
              <SidebarItem to="/wms-control" icon={PackageOpen} label={sidebarOpen ? "WMS Control" : ""} />
            </>
          )}

          {user?.role !== UserRole.AGENT && user?.role !== UserRole.EXPO && user?.role !== UserRole.EXPO_ANALIST && user?.role !== UserRole.CARRIER && user?.role !== UserRole.TRANSPORTISTA && user?.role !== UserRole.EMBARQUES && user?.role !== UserRole.CLIENT && user?.role !== UserRole.FINANZAS && (
            <>
              <SidebarItem to="/historico-expo" icon={History} label={sidebarOpen ? "Histórico Expo" : ""} />
              <SidebarItem to="/operations" icon={Ship} label={sidebarOpen ? "Shipment Plan" : ""} />
              <SidebarItem to="/pre-alerts" icon={Bell} label={sidebarOpen ? "Pre-Alerts" : ""} />
              <SidebarItem to="/vessel-tracking" icon={Anchor} label={sidebarOpen ? "Tracking" : ""} />
              <SidebarItem to="/equipment-tracking" icon={Container} label={sidebarOpen ? "Equipment" : ""} />
              <SidebarItem to="/spare-parts-tracking" icon={Box} label={sidebarOpen ? "SpareParts" : ""} />
              <SidebarItem to="/customs-clearance" icon={ClipboardCheck} label={sidebarOpen ? "Customs Clearance" : ""} />
              <SidebarItem to="/commercial-invoices" icon={FileText} label={sidebarOpen ? "CI Extractor" : ""} />
              <SidebarItem to="/factura" icon={FileText} label={sidebarOpen ? "Factura" : ""} />
              {user?.role !== UserRole.EDITOR && (
                <>
                  <SidebarItem to="/xml-invoices" icon={Database} label={sidebarOpen ? "Facturas XML" : ""} />
                  <SidebarItem to="/xml-ci" icon={FileText} label={sidebarOpen ? "XMLCI" : ""} />
                  <SidebarItem to="/ccp-builder" icon={Truck} label={sidebarOpen ? "CCP Builder" : ""} />
                </>
              )}
            </>
          )}

          {/* Saldo Fianza: Desktop Only */ }
          {![UserRole.CLIENT, UserRole.CARRIER, UserRole.TRANSPORTISTA, UserRole.EMBARQUES, UserRole.EXPO, UserRole.EXPO_ANALIST].includes(user?.role as UserRole) && (
             <div className="hidden lg:block">
                 <SidebarItem to="/saldo-fianza" icon={DollarSign} label={sidebarOpen ? "Saldo Fianza" : ""} />
             </div>
          )}

          {(user?.role === UserRole.ADMIN || user?.role === UserRole.CONTROLLER) && (
            <>
              <SidebarItem to="/controller" icon={Settings} label={sidebarOpen ? "Payments" : ""} />
            </>
          )}

          {/* RBAC: Restricted Areas (Admins only) */}
          {user?.role === UserRole.ADMIN && (
            <>
              <SidebarItem to="/activos-fijos" icon={Monitor} label={sidebarOpen ? "Activo Fijo" : ""} />
              <SidebarItem to="/r8va" icon={FileCheck} label={sidebarOpen ? "Control R8va" : ""} />
              <SidebarItem to="/data-stage" icon={Scale} label={sidebarOpen ? "Data Stage (SAT)" : ""} />
              <SidebarItem to="/catalogo-sat" icon={BookOpen} label={sidebarOpen ? "Catálogo SAT" : ""} />
              <SidebarItem to="/vucem" icon={Globe} label={sidebarOpen ? "VUCEM" : ""} />
              <SidebarItem to="/expediente-electronico" icon={FolderOpen} label={sidebarOpen ? "Expedientes Digitales" : ""} />
              <SidebarItem to="/proforma-validator" icon={FileCheck} label={sidebarOpen ? "Validador Proforma" : ""} />
              <SidebarItem to="/bom-analyzer" icon={Cpu} label={sidebarOpen ? "BOM Analyzer" : ""} />
              <SidebarItem to="/documents" icon={FileText} label={sidebarOpen ? "Smart Docs" : ""} />
              <SidebarItem to="/ai-assistant" icon={Sparkles} label={sidebarOpen ? t("menu.ai") : ""} />
              <SidebarItem to="/incidencias-vigilancia" icon={AlertTriangle} label={sidebarOpen ? "Incidencias Vigilancia" : ""} />
            </>
          )}

          {/* Apéndice 10: Accessible to Admin, Controller */}
          {[UserRole.ADMIN, UserRole.CONTROLLER].includes(user?.role as UserRole) && (
              <SidebarItem to="/apendice10" icon={BookOpen} label={sidebarOpen ? "Apéndice 10" : ""} />
          )}

          {/* Master Data: Accessible to Admin, Editor, Controller (NOT Agent anymore) */}
          {[UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTROLLER].includes(user?.role as UserRole) && (
            <SidebarItem to="/database" icon={Database} label={sidebarOpen ? "Master Data" : ""} />
          )}
          {[UserRole.ADMIN, UserRole.CONTROLLER].includes(user?.role as UserRole) && (
            <SidebarItem to="/bpm" icon={Box} label={sidebarOpen ? "BPM Clasificación" : ""} />
          )}

          {/* Agent specific block: BPM, Master Data, and Audit */}
          {user?.role === UserRole.AGENT && (
            <>
              <SidebarItem to="/database" icon={Database} label={sidebarOpen ? "Master Data" : ""} />
              <SidebarItem to="/bpm" icon={Box} label={sidebarOpen ? "BPM Clasificación" : ""} />
            </>
          )}

          {/* Logistics Planning -> Admin, Controller (NOT Agent/Editor/Expo) */}
          {[UserRole.ADMIN, UserRole.CONTROLLER].includes(user?.role as UserRole) && (
            <>
              <SidebarItem to="/models" icon={Box} label={sidebarOpen ? "Models (Expo)" : ""} />
              <SidebarItem to="/pricing-matrix" icon={DollarSign} label={sidebarOpen ? "Pricing Matrix" : ""} />
              <SidebarItem to="/shipping-schedules" icon={Ship} label={sidebarOpen ? "Shipping Sched." : ""} />
              <SidebarItem to="/daily-van-assignment" icon={CalendarCheck} label={sidebarOpen ? "Daily Van Assignment" : ""} />
            </>
          )}

          {/* Macro Module -> Admin solamente */}
          {[UserRole.ADMIN].includes(user?.role as UserRole) && (
            <>
              <SidebarItem to="/macro" icon={PackageOpen} label={sidebarOpen ? "Motor de Captura (Macro)" : ""} />
              <SidebarItem to="/historial-capturas" icon={History} label={sidebarOpen ? "Historial de Capturas" : ""} />
            </>
          )}

          {/* Operational Transport -> Admin, Controller, Carrier, Embarques (NOT Agent/Expo/Editor) */}
          {[UserRole.ADMIN, UserRole.CONTROLLER, UserRole.CARRIER, UserRole.TRANSPORTISTA, UserRole.EMBARQUES].includes(user?.role as UserRole) && (
            <>
              {/* Carriers catalog: solo ADMIN y CONTROLLER (no CARRIER, no TRANSPORTISTA, no EMBARQUES) */}
              {user?.role !== UserRole.CARRIER && user?.role !== UserRole.TRANSPORTISTA && user?.role !== UserRole.EMBARQUES && (
                  <SidebarItem to="/carriers" icon={Anchor} label={sidebarOpen ? t("menu.carriers") : ""} />
              )}
              {user?.role !== UserRole.EMBARQUES && (
                <>
                  <SidebarItem to="/transport-lines" icon={Truck} label={sidebarOpen ? t("menu.líneas") : ""} />
                  <SidebarItem to="/drivers" icon={Users} label={sidebarOpen ? t("menu.drivers") : ""} />
                  <SidebarItem to="/cajas" icon={Container} label={sidebarOpen ? t("menu.cajas") : ""} />
                </>
              )}
              <SidebarItem 
                to="/asignaciones-diarias" 
                icon={Navigation} 
                label={sidebarOpen ? t("menu.asignaciones") : ""} 
                badge={
                  (user?.role === UserRole.CARRIER || user?.role === UserRole.TRANSPORTISTA)
                    ? (asignacionesBadge > 0 ? asignacionesBadge : undefined)
                    : (asignacionesBadgeAdmin > 0 ? asignacionesBadgeAdmin : undefined)
                }
              />
              {/* Daily Van Assignment para Operational Transport (no EMBARQUES ni TRANSPORTISTA) */}
              {user?.role !== UserRole.EMBARQUES && user?.role !== UserRole.TRANSPORTISTA && (
                <SidebarItem to="/daily-van-assignment" icon={CalendarCheck} label={sidebarOpen ? "Daily Van Assignment" : ""} />
              )}
              {/* Módulos Demanda / Reserva 53' — Admin y Controller */}
              {user?.role !== UserRole.CARRIER && user?.role !== UserRole.TRANSPORTISTA && user?.role !== UserRole.EMBARQUES && (
                <>
                  <SidebarItem to="/admin-productos-53" icon={Package} label={sidebarOpen ? 'Productos 53\'' : ''} />
                  <SidebarItem to="/admin-ventanas-53" icon={CalendarDays} label={sidebarOpen ? 'Ventanas 53\'' : ''}
                    badge={ventanasBadge > 0 ? ventanasBadge : undefined} />
                  <SidebarItem to="/demanda-cajas-53" icon={ClipboardList} label={sidebarOpen ? 'Demanda 53\'' : ''} />
                </>
              )}
              {/* Reserva: visible para Admin, Controller, Carrier y Transportista */}
              <SidebarItem to="/reserva-ventanas-53" icon={Truck} label={sidebarOpen ? 'Reserva Ventanas 53\'' : ''}
                badge={reservasBadge > 0 ? reservasBadge : undefined} />
            </>
          )}

          {/* Expo: only Asignaciones (read-only) and XML */}
          {user?.role === UserRole.EXPO && (
            <>
              <SidebarItem 
                to="/asignaciones-diarias" 
                icon={Navigation} 
                label={sidebarOpen ? t("menu.asignaciones") : ""} 
                badge={asignacionesBadgeAdmin > 0 ? asignacionesBadgeAdmin : undefined} 
              />
              <SidebarItem to="/xml-invoices" icon={Database} label={sidebarOpen ? "XML Invoice Extractor" : ""} />
              <SidebarItem to="/xml-ci" icon={FileText} label={sidebarOpen ? "XMLCI Consolidated" : ""} />
            </>
          )}

          {/* Expo_Analist Specific Block */}
          {user?.role === UserRole.EXPO_ANALIST && (
            <>
              <SidebarItem to="/wms-control" icon={PackageOpen} label={sidebarOpen ? "WMS Control" : ""} />
              <SidebarItem to="/daily-van-assignment" icon={CalendarCheck} label={sidebarOpen ? "Daily Van Assignment" : ""} />
              <SidebarItem 
                to="/asignaciones-diarias" 
                icon={Navigation} 
                label={sidebarOpen ? t("menu.asignaciones") : ""} 
                badge={asignacionesBadgeAdmin > 0 ? asignacionesBadgeAdmin : undefined} 
              />
              <SidebarItem to="/admin-productos-53" icon={Package} label={sidebarOpen ? 'Productos 53\'' : ''} />
              <SidebarItem to="/admin-ventanas-53" icon={CalendarDays} label={sidebarOpen ? 'Ventanas 53\'' : ''}
                badge={ventanasBadge > 0 ? ventanasBadge : undefined} />
              <SidebarItem to="/demanda-cajas-53" icon={ClipboardList} label={sidebarOpen ? 'Demanda 53\'' : ''} />
            </>
          )}

          {/* Cliente: solo lectura de Asignaciones Diarias */}
          {user?.role === UserRole.CLIENT && (
            <SidebarItem to="/asignaciones-diarias" icon={Navigation} label={sidebarOpen ? 'Asignaciones Diarias' : ''} />
          )}

          {/* Daily Audit: Accessible to Everyone (except Pending, Carrier, Expo, Embarques, Client, Editor) */}
          {user?.role !== UserRole.EDITOR && user?.role !== UserRole.PENDING && user?.role !== UserRole.EXPO && user?.role !== UserRole.EXPO_ANALIST && user?.role !== UserRole.CARRIER && user?.role !== UserRole.TRANSPORTISTA && user?.role !== UserRole.EMBARQUES && user?.role !== UserRole.CLIENT && user?.role !== UserRole.FINANZAS && (
            <SidebarItem to="/daily-audit" icon={Activity} label={sidebarOpen ? "Control de Auditoría" : ""} />
          )}

          {/* Partners & Setup: Admins only */}
          {user?.role === UserRole.ADMIN && (
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
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-8 sticky top-0 z-[100]">
          <h2 className="text-lg font-semibold text-slate-700">CFMoto Import/Export Control</h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs font-bold shadow-sm">
              {(['es','en','zh'] as const).map((lang, i) => (
                <button
                  key={lang}
                  onClick={() => language !== lang && toggleLanguage()}
                  className={`px-2.5 py-1.5 transition-colors ${
                    language === lang
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  } ${i > 0 ? 'border-l border-slate-200' : ''}`}
                  title={lang === 'es' ? 'Español' : lang === 'en' ? 'English' : '中文'}
                >
                  {lang === 'zh' ? '中' : lang.toUpperCase()}
                </button>
              ))}
            </div>
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