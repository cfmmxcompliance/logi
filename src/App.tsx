import React, { useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout.tsx';
import { Dashboard } from '../pages/Dashboard.tsx';
import { Operations } from '../pages/Operations.tsx';
import { VesselTracking } from '../pages/VesselTracking.tsx';
import { EquipmentTracking } from '../pages/EquipmentTracking.tsx';
import { SparePartsTracking } from '../pages/SparePartsTracking.tsx';
import { CustomsClearance } from '../pages/CustomsClearance.tsx';
import { PreAlerts } from '../pages/PreAlerts.tsx';
import { ProformaValidator } from '../pages/ProformaValidator';
import { SmartDocs } from '../pages/SmartDocs.tsx';
import { DatabaseView } from '../pages/DatabaseView.tsx';
import { Suppliers } from '../pages/Suppliers.tsx';
import { Reports } from '../pages/Reports.tsx';
import { Settings } from '../pages/Settings.tsx';
import { Login } from '../pages/Login.tsx';
import { ActionLogs } from '../pages/AuditLogs.tsx';
import { DailyAudit } from '../pages/DailyAudit.tsx';
import { DataStage } from '../pages/DataStage.tsx';
import { Carriers } from '../pages/Carriers.tsx';
import { NetworkIndicator } from '../components/NetworkIndicator.tsx';
import { TransportLines } from '../pages/TransportLines.tsx';
import { Drivers } from '../pages/Drivers.tsx';
import { CIExtractor } from '../pages/CIExtractor.tsx';
import { XMLInvoiceExtractor } from '../pages/XMLInvoiceExtractor.tsx';
import { XMLCI } from '../pages/XMLCI.tsx';
import { Models } from '../pages/Models';
import { Cajas } from '../pages/Cajas.tsx';
import { AsignacionesDiarias } from '../pages/AsignacionesDiarias.tsx';
import { IncidenciasVigilancia } from '../pages/IncidenciasVigilancia.tsx';
import { Apendice10 } from '../pages/Apendice10.tsx';
import { CaptureModule } from '../pages/CaptureModule.tsx';
import { HistorialCapturas } from '../pages/HistorialCapturas.tsx';
import { ShippingSchedules } from '../pages/ShippingSchedules.tsx';
import { PricingMatrix } from '../pages/PricingMatrix.tsx';
import CCPBuilder from '../pages/CCPBuilder.tsx';
import { Controller } from '../pages/Controller.tsx';
import { Vucem } from '../pages/Vucem.tsx';
import { ExpedienteElectronico } from '../pages/ExpedienteElectronico';
import { BOMAnalyzer } from '../pages/BOMAnalyzer.tsx';
import { SaldoFianza } from '../pages/SaldoFianza.tsx';
import { AIAssistant } from '../pages/AIAssistant.tsx';
import { CatalogoSAT } from '../pages/CatalogoSAT.tsx';
import { HandheldHome } from '../pages/HandheldHome.tsx';
import { HandheldSellos } from '../pages/HandheldSellos.tsx';
import { HandheldLiberacion } from '../pages/HandheldLiberacion.tsx';
import { HandheldLiberacionDock } from '../pages/HandheldLiberacionDock.tsx';
import { HandheldArribo } from '../pages/HandheldArribo.tsx';
import { HandheldVigilancia } from '../pages/HandheldVigilancia.tsx';
import { BPMClasificacion } from '../pages/BPMClasificacion.tsx';
import { DailyVanAssignment } from '../pages/DailyVanAssignment.tsx';
import { AdminProductos53 } from '../pages/AdminProductos53.tsx';
import { AdminVentanas53 } from '../pages/AdminVentanas53.tsx';
import { DemandaCajas53 } from '../pages/DemandaCajas53.tsx';
import { ReservaVentanas53 } from '../pages/ReservaVentanas53.tsx';
import { WMSControl } from '../pages/wms/WMSControl.tsx';
import { storageService } from '../services/storageService.ts';
import { trackingService } from '../services/trackingService.ts';
import { AuthProvider, useAuth } from '../context/AuthContext.tsx';
import { NotificationProvider } from '../context/NotificationContext.tsx';
import { VucemProvider } from '../context/VucemContext.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { NotificationPopup } from '../components/NotificationPopup.tsx';
import { Database } from 'lucide-react';
import { UserRole } from '../types.ts';

import AppLoader from '../components/AppLoader.tsx';

// App version — bump this string when you want to force a fresh load for all users
const APP_VERSION = '2.1.0';

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
    if (user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2) {
        // Handheld users must be on /m/...
        if (!isHandheldPath) {
            return <Navigate to="/m/home" replace />;
        }
        
        // Strict segregation
        if (user?.role === UserRole.HANDHELD_USER2 && location.pathname === '/m/sellos') {
             return <Navigate to="/m/home" replace />;
        }
    } else if (user?.role) {
        // Non-Handheld (Desktop) users cannot access /m/...
        if (isHandheldPath) {
            return <Navigate to="/" replace />;
        }
    }

    // Carrier constraints
    if (user?.role === UserRole.CARRIER) {
        const allowed = ['/transport-lines', '/cajas', '/drivers', '/carriers', '/asignaciones-diarias', '/reserva-ventanas-53'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/transport-lines" replace />;
    }

    // Transportista constraints (same as Carrier but without /carriers)
    if (user?.role === UserRole.TRANSPORTISTA) {
        const allowed = ['/transport-lines', '/cajas', '/drivers', '/asignaciones-diarias', '/reserva-ventanas-53'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/transport-lines" replace />;
    }

    // Expo constraints
    if (user?.role === UserRole.EXPO) {
        const allowed = ['/models', '/pricing-matrix', '/shipping-schedules', '/asignaciones-diarias', '/daily-van-assignment', '/xml-ci', '/xml-invoices', '/macro', '/historial-capturas'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/daily-van-assignment" replace />;
    }

    // Embarques constraints
    if (user?.role === UserRole.EMBARQUES) {
        const allowed = ['/asignaciones-diarias'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/asignaciones-diarias" replace />;
    }

    // Editor constraints
    if (user?.role === UserRole.EDITOR) {
        const editorAllowed = ['/controller', '/database', '/bpm', '/saldo-fianza', '/suppliers'];
        // Let them see root or basically if they try to access restricted logistics ops
        const restricted = ['/apendice10', '/carriers', '/transport-lines', '/drivers', '/cajas', '/asignaciones-diarias', '/models', '/pricing-matrix', '/shipping-schedules', '/daily-van-assignment'];
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

    if (user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2) {
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

        const isHandheld = user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2;

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

                    // Launch both services in parallel right away
                    const initPromise     = storageService.init(user?.role);
                    const trackingPromise = trackingService.init();

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
        <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
            <Route path="/pre-alerts" element={<ProtectedRoute><PreAlerts /></ProtectedRoute>} />
            <Route path="/vessel-tracking" element={<ProtectedRoute><VesselTracking /></ProtectedRoute>} />
            <Route path="/equipment-tracking" element={<ProtectedRoute><EquipmentTracking /></ProtectedRoute>} />
            <Route path="/spare-parts-tracking" element={<ProtectedRoute><SparePartsTracking /></ProtectedRoute>} />
            <Route path="/customs-clearance" element={<ProtectedRoute><CustomsClearance /></ProtectedRoute>} />
            <Route path="/commercial-invoices" element={<ProtectedRoute><CIExtractor /></ProtectedRoute>} />
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

            {/* Módulos Demanda y Reserva de Cajas 53' */}
            <Route path="/admin-productos-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER]}><AdminProductos53 /></ProtectedRoute>} />
            <Route path="/admin-ventanas-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER]}><AdminVentanas53 /></ProtectedRoute>} />
            <Route path="/demanda-cajas-53" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CONTROLLER]}><DemandaCajas53 /></ProtectedRoute>} />
            <Route path="/reserva-ventanas-53" element={<ProtectedRoute><ReservaVentanas53 /></ProtectedRoute>} />

            {/* Handheld Routes */}
            <Route path="/m/home" element={<ProtectedRoute><HandheldHome /></ProtectedRoute>} />
            <Route path="/m/sellos" element={<ProtectedRoute><HandheldSellos /></ProtectedRoute>} />
            <Route path="/m/liberacion" element={<ProtectedRoute><HandheldLiberacion /></ProtectedRoute>} />
            <Route path="/m/liberacion-dock" element={<ProtectedRoute><HandheldLiberacionDock /></ProtectedRoute>} />
            <Route path="/m/arribo" element={<ProtectedRoute><HandheldArribo /></ProtectedRoute>} />
            <Route path="/m/vigilancia" element={<ProtectedRoute><HandheldVigilancia /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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

