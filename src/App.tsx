import React, { Suspense, useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout.tsx';
import { Login } from '../pages/Login.tsx';
import { NetworkIndicator } from '../components/NetworkIndicator.tsx';
import { storageService } from '../services/storageService.ts';
import { trackingService } from '../services/trackingService.ts';
import { AuthProvider, useAuth } from '../context/useAuth';
import { NotificationProvider } from '../context/NotificationContext.tsx';
import { VucemProvider } from '../context/VucemContext.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { NotificationPopup } from '../components/NotificationPopup.tsx';
import { Database, Loader2 } from 'lucide-react';
import { UserRole } from '../types.ts';
import AppLoader from '../components/AppLoader.tsx';

// ─── Lazy-loaded pages (each loads only when navigated to) ───────────────────
const Dashboard            = React.lazy(() => import('../pages/Dashboard.tsx').then(m => ({ default: m.Dashboard })));
const HistoricoExpo        = React.lazy(() => import('../pages/HistoricoExpo.tsx').then(m => ({ default: m.HistoricoExpo })));
const Operations           = React.lazy(() => import('../pages/Operations.tsx').then(m => ({ default: m.Operations })));
const VesselTracking       = React.lazy(() => import('../pages/VesselTracking.tsx').then(m => ({ default: m.VesselTracking })));
const EquipmentTracking    = React.lazy(() => import('../pages/EquipmentTracking.tsx').then(m => ({ default: m.EquipmentTracking })));
const SparePartsTracking   = React.lazy(() => import('../pages/SparePartsTracking.tsx').then(m => ({ default: m.SparePartsTracking })));
const CustomsClearance     = React.lazy(() => import('../pages/CustomsClearance.tsx').then(m => ({ default: m.CustomsClearance })));
const PreAlerts            = React.lazy(() => import('../pages/PreAlerts.tsx').then(m => ({ default: m.PreAlerts })));
const ProformaValidator    = React.lazy(() => import('../pages/ProformaValidator').then(m => ({ default: m.ProformaValidator })));
const SmartDocs            = React.lazy(() => import('../pages/SmartDocs.tsx').then(m => ({ default: m.SmartDocs })));
const DatabaseView         = React.lazy(() => import('../pages/DatabaseView.tsx').then(m => ({ default: m.DatabaseView })));
const Suppliers            = React.lazy(() => import('../pages/Suppliers.tsx').then(m => ({ default: m.Suppliers })));
const Reports              = React.lazy(() => import('../pages/Reports.tsx').then(m => ({ default: m.Reports })));
const Settings             = React.lazy(() => import('../pages/Settings.tsx').then(m => ({ default: m.Settings })));
const ActionLogs           = React.lazy(() => import('../pages/AuditLogs.tsx').then(m => ({ default: m.ActionLogs })));
const DailyAudit           = React.lazy(() => import('../pages/DailyAudit.tsx').then(m => ({ default: m.DailyAudit })));
const DataStage            = React.lazy(() => import('../pages/DataStage.tsx').then(m => ({ default: m.DataStage })));
const Carriers             = React.lazy(() => import('../pages/Carriers.tsx').then(m => ({ default: m.Carriers })));
const TransportLines       = React.lazy(() => import('../pages/TransportLines.tsx').then(m => ({ default: m.TransportLines })));
const Drivers              = React.lazy(() => import('../pages/Drivers.tsx').then(m => ({ default: m.Drivers })));
const CIExtractor          = React.lazy(() => import('../pages/CIExtractor.tsx').then(m => ({ default: m.CIExtractor })));
const Factura              = React.lazy(() => import('../pages/Factura.tsx').then(m => ({ default: m.Factura })));
const XMLInvoiceExtractor  = React.lazy(() => import('../pages/XMLInvoiceExtractor.tsx').then(m => ({ default: m.XMLInvoiceExtractor })));
const XMLCI                = React.lazy(() => import('../pages/XMLCI.tsx').then(m => ({ default: m.XMLCI })));
const Models               = React.lazy(() => import('../pages/Models').then(m => ({ default: m.Models })));
const Cajas                = React.lazy(() => import('../pages/Cajas.tsx').then(m => ({ default: m.Cajas })));
const AsignacionesDiarias  = React.lazy(() => import('../pages/AsignacionesDiarias.tsx').then(m => ({ default: m.AsignacionesDiarias })));
const IncidenciasVigilancia= React.lazy(() => import('../pages/IncidenciasVigilancia.tsx').then(m => ({ default: m.IncidenciasVigilancia })));
const Apendice10           = React.lazy(() => import('../pages/Apendice10.tsx').then(m => ({ default: m.Apendice10 })));
const CaptureModule        = React.lazy(() => import('../pages/CaptureModule.tsx').then(m => ({ default: m.CaptureModule })));
const HistorialCapturas    = React.lazy(() => import('../pages/HistorialCapturas.tsx').then(m => ({ default: m.HistorialCapturas })));
const ShippingSchedules    = React.lazy(() => import('../pages/ShippingSchedules.tsx').then(m => ({ default: m.ShippingSchedules })));
const PricingMatrix        = React.lazy(() => import('../pages/PricingMatrix.tsx').then(m => ({ default: m.PricingMatrix })));
const CCPBuilder           = React.lazy(() => import('../pages/CCPBuilder.tsx'));
const Controller           = React.lazy(() => import('../pages/Controller.tsx').then(m => ({ default: m.Controller })));
const Vucem                = React.lazy(() => import('../pages/Vucem.tsx').then(m => ({ default: m.Vucem })));
const ExpedienteElectronico= React.lazy(() => import('../pages/ExpedienteElectronico').then(m => ({ default: m.ExpedienteElectronico })));
const BOMAnalyzer          = React.lazy(() => import('../pages/BOMAnalyzer.tsx').then(m => ({ default: m.BOMAnalyzer })));
const SaldoFianza          = React.lazy(() => import('../pages/SaldoFianza.tsx').then(m => ({ default: m.SaldoFianza })));
const AIAssistant          = React.lazy(() => import('../pages/AIAssistant.tsx').then(m => ({ default: m.AIAssistant })));
const CatalogoSAT          = React.lazy(() => import('../pages/CatalogoSAT.tsx').then(m => ({ default: m.CatalogoSAT })));
const HandheldHome         = React.lazy(() => import('../pages/HandheldHome.tsx').then(m => ({ default: m.HandheldHome })));
const HandheldSellos       = React.lazy(() => import('../pages/HandheldSellos.tsx').then(m => ({ default: m.HandheldSellos })));
const HandheldLiberacion   = React.lazy(() => import('../pages/HandheldLiberacion.tsx').then(m => ({ default: m.HandheldLiberacion })));
const HandheldLiberacionDock = React.lazy(() => import('../pages/HandheldLiberacionDock.tsx').then(m => ({ default: m.HandheldLiberacionDock })));
const HandheldArribo       = React.lazy(() => import('../pages/HandheldArribo.tsx').then(m => ({ default: m.HandheldArribo })));
const HandheldVigilancia   = React.lazy(() => import('../pages/HandheldVigilancia.tsx').then(m => ({ default: m.HandheldVigilancia })));
const HandheldAsignaciones = React.lazy(() => import('../pages/HandheldAsignaciones.tsx').then(m => ({ default: m.HandheldAsignaciones })));
const BPMClasificacion     = React.lazy(() => import('../pages/BPMClasificacion.tsx').then(m => ({ default: m.BPMClasificacion })));
const DailyVanAssignment   = React.lazy(() => import('../pages/DailyVanAssignment.tsx').then(m => ({ default: m.DailyVanAssignment })));
const AdminProductos53     = React.lazy(() => import('../pages/AdminProductos53.tsx').then(m => ({ default: m.AdminProductos53 })));
const AdminVentanas53      = React.lazy(() => import('../pages/AdminVentanas53.tsx').then(m => ({ default: m.AdminVentanas53 })));
const DemandaCajas53       = React.lazy(() => import('../pages/DemandaCajas53.tsx').then(m => ({ default: m.DemandaCajas53 })));
const ReservaVentanas53    = React.lazy(() => import('../pages/ReservaVentanas53.tsx').then(m => ({ default: m.ReservaVentanas53 })));
const WMSControl           = React.lazy(() => import('../pages/wms/WMSControl.tsx').then(m => ({ default: m.WMSControl })));
const ActivosFijos         = React.lazy(() => import('../pages/ActivosFijos.tsx').then(m => ({ default: m.ActivosFijos })));
const ReglaOctava          = React.lazy(() => import('../pages/ReglaOctavaR8.tsx').then(m => ({ default: m.ReglaOctavaR8 })));
// ─── Fallback spinner while lazy chunk loads ─────────────────────────────────
const PageSkeleton = () => (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={36} className="animate-spin text-indigo-500" />
            <span className="text-sm font-medium">Cargando módulo...</span>
        </div>
    </div>
);

// App version — bump this string when you want to force a fresh load for all users
const APP_VERSION = '2.2.0'; // bump → force cache refresh (lazy loading enabled)

// Detect if this is a first load / cache miss / new app version
const checkIsFirstLoad = () => {
    try {
        const hasDb     = !!localStorage.getItem('logimaster_db');
        const hasReady  = localStorage.getItem('logimaster_app_ready') === APP_VERSION;
        return !hasDb || !hasReady;
    } catch {
        return true; // localStorage unavailable (private mode etc.) — treat as first load
    }
};

// Authenticated Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }: { children?: React.ReactNode, allowedRoles?: string[] }) => {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Agent role is limited to BPM, Daily Audit, Master Data, and Saldo Fianza
    const isAgentAllowedPath = location.pathname === '/bpm' || location.pathname === '/daily-audit' || location.pathname === '/database' || location.pathname === '/saldo-fianza';
    if (user?.role === UserRole.AGENT && !isAgentAllowedPath) {
        return <Navigate to="/bpm" replace />;
    }

    // Handheld constraints (Bidirectional)
    const isHandheldPath = location.pathname.startsWith('/m/');
    const isHandheldRole = user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2 || user?.role === UserRole.HANDHELD_AF;
    if (isHandheldRole) {
        // Handheld users must be on /m/...
        if (!isHandheldPath) {
            return <Navigate to="/m/home" replace />;
        }
        
        // Strict segregation
        if (user?.role === UserRole.HANDHELD_USER2 && location.pathname === '/m/sellos') {
             return <Navigate to="/m/home" replace />;
        }
    } else if (user?.role) {
        // Non-Handheld (Desktop) users cannot access /m/... (except ADMIN for testing)
        if (isHandheldPath && user.role !== UserRole.ADMIN) {
            return <Navigate to="/" replace />;
        }
    }

    // Carrier constraints
    if (user?.role === UserRole.CARRIER) {
        const allowed = ['/transport-lines', '/cajas', '/drivers', '/carriers', '/asignaciones-diarias', '/reserva-ventanas-53', '/daily-van-assignment'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/transport-lines" replace />;
    }

    // Transportista constraints (same as Carrier but without /carriers)
    if (user?.role === UserRole.TRANSPORTISTA) {
        const allowed = ['/transport-lines', '/cajas', '/drivers', '/asignaciones-diarias', '/reserva-ventanas-53'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/transport-lines" replace />;
    }

    // Expo constraints
    if (user?.role === UserRole.EXPO) {
        const allowed = ['/asignaciones-diarias', '/xml-ci', '/xml-invoices'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/asignaciones-diarias" replace />;
    }

    // Expo Analist constraints
    if (user?.role === UserRole.EXPO_ANALIST) {
        const allowed = ['/wms-control', '/daily-van-assignment', '/asignaciones-diarias', '/admin-productos-53', '/demanda-cajas-53', '/admin-ventanas-53'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/wms-control" replace />;
    }

    // Embarques constraints
    if (user?.role === UserRole.EMBARQUES) {
        const allowed = ['/asignaciones-diarias'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/asignaciones-diarias" replace />;
    }

    // Dashboard constraints (Solo ADMIN)
    if (location.pathname === '/' && user?.role !== UserRole.ADMIN) {
        if (user?.role === UserRole.CONTROLLER) return <Navigate to="/controller" replace />;
        return <Navigate to="/database" replace />;
    }

    // Editor constraints
    if (user?.role === UserRole.EDITOR) {
        const restricted = ['/apendice10', '/carriers', '/transport-lines', '/drivers', '/cajas', '/asignaciones-diarias', '/models', '/pricing-matrix', '/shipping-schedules', '/daily-van-assignment', '/bpm', '/suppliers', '/controller', '/daily-audit', '/xml-invoices', '/xml-ci', '/ccp-builder'];
        if (restricted.includes(location.pathname)) {
            return <Navigate to="/database" replace />;
        }
    }

    // Cliente constraints — solo lectura de Asignaciones Diarias
    if (user?.role === UserRole.CLIENT) {
        const allowed = ['/asignaciones-diarias'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/asignaciones-diarias" replace />;
    }

    // Finanzas constraints — solo lectura de Saldo Fianza
    if (user?.role === UserRole.FINANZAS) {
        const allowed = ['/saldo-fianza'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/saldo-fianza" replace />;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    // Si la ruta es de Handheld, renderizamos sin el Layout lateral para que funcione en móviles
    if (isHandheldPath) {
        return <>{children}</>;
    }

    return <Layout>{children}</Layout>;
};

const AppContent = () => {
    const [isReady, setIsReady]               = useState(false);
    const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
    const [showFullLoader, setShowFullLoader] = useState(false);
    const [loaderStep, setLoaderStep]         = useState('auth');
    const [loaderProgress, setLoaderProgress] = useState(0);
    const [loaderError, setLoaderError]       = useState<string | null>(null);

    const { isAuthenticated, loading, user } = useAuth();
    const initCalledRef = useRef(false);

    useEffect(() => {
        if (loading) return;

        // ── Not authenticated: show login, reset guard so re-login works ────
        if (!isAuthenticated) {
            initCalledRef.current = false;  // allow re-run after next login
            setIsReady(true);               // let Routes render /login
            return;
        }

        if (initCalledRef.current) return;  // already initialised this session
        initCalledRef.current = true;

        const isHandheld = user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2 || user?.role === UserRole.HANDHELD_AF;

        // ── Handheld users: skip heavy DB init entirely ─────────────────────
        if (isHandheld) {
            setIsReady(true);
            return;
        }

        // ── Decide: first-load vs return visit ──────────────────────────────
        const firstLoad = checkIsFirstLoad();

        if (firstLoad) {
            setShowFullLoader(true);

            // Safety timeout: if init takes > 60 s, allow entry anyway
            const safetyTimer = setTimeout(() => {
                console.warn('[AppLoader] Safety timeout reached — allowing entry.');
                try { localStorage.setItem('logimaster_app_ready', APP_VERSION); } catch {}
                setShowFullLoader(false);
                setIsReady(true);
            }, 60_000);

            const runInit = async () => {
                try {
                    // ── Start ALL real work immediately — zero artificial delay ──────
                    setLoaderStep('auth');  setLoaderProgress(8);

                    // Helper to prevent infinite hangs
                    const withTimeout = (promise: Promise<any>, ms: number, name: string) => {
                        let timeoutId: NodeJS.Timeout;
                        const timeoutPromise = new Promise((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error(`Timeout in ${name}`)), ms);
                        });
                        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
                    };

                    // Launch both services in parallel right away with a timeout
                    console.log('[AppLoader] Starting initPromises');
                    const initPromise = withTimeout(storageService.init(user?.role), 8000, 'storageService.init')
                        .catch(e => console.error(e));
                    const trackingPromise = withTimeout(trackingService.init(), 8000, 'trackingService.init')
                        .catch(e => console.error(e));

                    // ── Smooth progress animation while real work runs ───────────────
                    // Moves from 8 → 88% over time using a live interval.
                    // Steps through realistic phase labels so the screen feels active.
                    const PHASES = [
                        { at: 15, step: 'idb'      },
                        { at: 30, step: 'parts'    },
                        { at: 50, step: 'invoices' },
                        { at: 68, step: 'firebase' },
                        { at: 83, step: 'tracking' },
                    ];
                    let currentProgress = 8;
                    const animInterval = setInterval(() => {
                        currentProgress = Math.min(88, currentProgress + 0.8); // ~110 ticks to reach 88%
                        setLoaderProgress(currentProgress);
                        const nextPhase = PHASES.find(p => currentProgress >= p.at && currentProgress < p.at + 1);
                        if (nextPhase) setLoaderStep(nextPhase.step);
                    }, 80); // fires every 80 ms → smooth 60-fps feel, ~8.8 seconds to reach 88%

                    // ── Wait for the REAL work to finish ────────────────────────────
                    await Promise.all([initPromise, trackingPromise]);

                    // Real work done — clear animation, snap to 100%
                    clearInterval(animInterval);
                    setLoaderStep('ready'); setLoaderProgress(100);

                    // Brief "¡Listo!" moment (400ms only, not blocking data)
                    await new Promise(r => setTimeout(r, 400));

                    clearTimeout(safetyTimer);
                    try { localStorage.setItem('logimaster_app_ready', APP_VERSION); } catch {}
                    setShowFullLoader(false);
                    setIsReady(true);
                } catch (e: any) {
                    clearTimeout(safetyTimer);
                    console.error('[AppLoader] Init failed:', e);
                    setLoaderError(e?.message || 'Error desconocido durante la inicialización.');
                    // Auto-recover after 8 s — never leave user stuck
                    setTimeout(() => {
                        setLoaderError(null);
                        setShowFullLoader(false);
                        setIsReady(true);
                    }, 8_000);
                }
            };

            runInit();
        } else {
            // ── RETURN VISIT: instant UI, silent background init ─────────────
            setIsReady(true);
            setIsBackgroundLoading(true);
            Promise.all([
                storageService.init(user?.role),
                trackingService.init(),
            ])
            .catch(e => console.warn('[AppLoader] Background init (non-critical):', e))
            .finally(() => setIsBackgroundLoading(false));
        }
    }, [loading, isAuthenticated]);

    // Auth still resolving — tiny neutral spinner
    if (!isReady && !showFullLoader) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-900">
                <div className="animate-spin text-indigo-500">
                    <Database size={36} />
                </div>
            </div>
        );
    }

    // First load — full animated loader
    if (showFullLoader) {
        return (
            <AppLoader
                currentStep={loaderStep}
                targetProgress={loaderProgress}
                error={loaderError}
                onRetry={() => { initCalledRef.current = false; window.location.reload(); }}
            />
        );
    }

    return (
        <>
        {/* Subtle background-sync indicator on return visits */}
        {isBackgroundLoading && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-800/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-sm">
                <Database size={14} className="animate-pulse text-blue-400" />
                <span>Sincronizando datos...</span>
            </div>
        )}
        <Suspense fallback={<PageSkeleton />}>
        <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/historico-expo" element={<ProtectedRoute><HistoricoExpo /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
            <Route path="/pre-alerts" element={<ProtectedRoute><PreAlerts /></ProtectedRoute>} />
            <Route path="/vessel-tracking" element={<ProtectedRoute><VesselTracking /></ProtectedRoute>} />
            <Route path="/equipment-tracking" element={<ProtectedRoute><EquipmentTracking /></ProtectedRoute>} />
            <Route path="/spare-parts-tracking" element={<ProtectedRoute><SparePartsTracking /></ProtectedRoute>} />
            <Route path="/customs-clearance" element={<ProtectedRoute><CustomsClearance /></ProtectedRoute>} />
            <Route path="/commercial-invoices" element={<ProtectedRoute><CIExtractor /></ProtectedRoute>} />
            <Route path="/factura" element={<ProtectedRoute><Factura /></ProtectedRoute>} />
            <Route path="/xml-invoices" element={<ProtectedRoute><XMLInvoiceExtractor /></ProtectedRoute>} />
            <Route path="/xml-ci" element={<ProtectedRoute><XMLCI /></ProtectedRoute>} />
            <Route path="/saldo-fianza" element={<ProtectedRoute><SaldoFianza /></ProtectedRoute>} />
            <Route path="/catalogo-sat" element={<ProtectedRoute><CatalogoSAT /></ProtectedRoute>} />
            <Route path="/ccp-builder" element={<ProtectedRoute><CCPBuilder /></ProtectedRoute>} />
            <Route path="/data-stage" element={<ProtectedRoute><DataStage /></ProtectedRoute>} />
            <Route path="/controller" element={<ProtectedRoute><Controller /></ProtectedRoute>} />
            <Route path="/vucem" element={<ProtectedRoute><Vucem /></ProtectedRoute>} />
            <Route path="/models" element={<ProtectedRoute><Models /></ProtectedRoute>} />
            <Route path="/shipping-schedules" element={<ProtectedRoute><ShippingSchedules /></ProtectedRoute>} />
            <Route path="/pricing-matrix" element={<ProtectedRoute><PricingMatrix /></ProtectedRoute>} />
            <Route path="/cajas" element={<ProtectedRoute><Cajas /></ProtectedRoute>} />
            <Route path="/asignaciones-diarias" element={<ProtectedRoute><AsignacionesDiarias /></ProtectedRoute>} />
            <Route path="/incidencias-vigilancia" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><IncidenciasVigilancia /></ProtectedRoute>} />
            <Route path="/macro" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EXPO]}><CaptureModule /></ProtectedRoute>} />
            <Route path="/historial-capturas" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EXPO]}><HistorialCapturas /></ProtectedRoute>} />
            <Route path="/apendice10" element={<ProtectedRoute><Apendice10 /></ProtectedRoute>} />
            <Route path="/carriers" element={<ProtectedRoute><Carriers /></ProtectedRoute>} />
            <Route path="/transport-lines" element={<ProtectedRoute><TransportLines /></ProtectedRoute>} />
            <Route path="/drivers" element={<ProtectedRoute><Drivers /></ProtectedRoute>} />
            <Route path="/expediente-electronico" element={
                <ProtectedRoute>
                    <ExpedienteElectronico setActiveTab={(tab) => {
                        // Simple shim: if tab is 'vucem', navigate there.
                        if (tab === 'vucem') window.location.hash = '#/vucem';
                    }} />
                </ProtectedRoute>
            } />
            <Route path="/proforma-validator" element={<ProtectedRoute><ProformaValidator /></ProtectedRoute>} />
            <Route path="/bom-analyzer" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EDITOR]}><BOMAnalyzer /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AIAssistant /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><SmartDocs /></ProtectedRoute>} />
            <Route path="/database" element={<ProtectedRoute><DatabaseView /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute><ActionLogs /></ProtectedRoute>} />
            <Route path="/daily-audit" element={<ProtectedRoute><DailyAudit /></ProtectedRoute>} />
            <Route path="/bpm" element={<ProtectedRoute><BPMClasificacion /></ProtectedRoute>} />
            <Route path="/daily-van-assignment" element={<ProtectedRoute><DailyVanAssignment /></ProtectedRoute>} />
            <Route path="/wms-control" element={<ProtectedRoute><WMSControl /></ProtectedRoute>} />
            <Route path="/activos-fijos" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><ActivosFijos /></ProtectedRoute>} />
            <Route path="/r8va" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER]}><ReglaOctava /></ProtectedRoute>} />

            {/* Módulos Demanda y Reserva de Cajas 53' */}
            <Route path="/admin-productos-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER, UserRole.EXPO_ANALIST]}><AdminProductos53 /></ProtectedRoute>} />
            <Route path="/admin-ventanas-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER, UserRole.EXPO_ANALIST]}><AdminVentanas53 /></ProtectedRoute>} />
            <Route path="/demanda-cajas-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER, UserRole.EXPO_ANALIST]}><DemandaCajas53 /></ProtectedRoute>} />
            <Route path="/reserva-ventanas-53" element={<ProtectedRoute><ReservaVentanas53 /></ProtectedRoute>} />

            {/* Handheld Routes */}
            <Route path="/m/home" element={<ProtectedRoute><HandheldHome /></ProtectedRoute>} />
            <Route path="/m/sellos" element={<ProtectedRoute><HandheldSellos /></ProtectedRoute>} />
            <Route path="/m/liberacion" element={<ProtectedRoute><HandheldLiberacion /></ProtectedRoute>} />
            <Route path="/m/liberacion-dock" element={<ProtectedRoute><HandheldLiberacionDock /></ProtectedRoute>} />
            <Route path="/m/arribo" element={<ProtectedRoute><HandheldArribo /></ProtectedRoute>} />
            <Route path="/m/vigilancia" element={<ProtectedRoute><HandheldVigilancia /></ProtectedRoute>} />
            <Route path="/m/asignaciones" element={<ProtectedRoute><HandheldAsignaciones /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </>
    );
};

const App: React.FC = () => {
    return (
        <LanguageProvider>
            <HashRouter>
                <VucemProvider>
                    <AppContent />
                </VucemProvider>
                <NetworkIndicator />
                <NotificationPopup />
            </HashRouter>
        </LanguageProvider>
    );
};

export default App;

