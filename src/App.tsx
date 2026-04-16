import React, { useEffect, useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout.tsx';
import { storageService } from '../services/storageService.ts';
import { trackingService } from '../services/trackingService.ts';
import { AuthProvider, useAuth } from '../context/AuthContext.tsx';
import { NotificationProvider } from '../context/NotificationContext.tsx';
import { VucemProvider } from '../context/VucemContext.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { NotificationPopup } from '../components/NotificationPopup.tsx';
import { Database, Loader2 } from 'lucide-react';
import { UserRole } from '../types.ts';

// ─── Lazy page imports — cada página es su propio chunk (carga bajo demanda) ───
const Login               = lazy(() => import('../pages/Login.tsx').then(m => ({ default: m.Login })));
const Dashboard           = lazy(() => import('../pages/Dashboard.tsx').then(m => ({ default: m.Dashboard })));
const Operations          = lazy(() => import('../pages/Operations.tsx').then(m => ({ default: m.Operations })));
const VesselTracking      = lazy(() => import('../pages/VesselTracking.tsx').then(m => ({ default: m.VesselTracking })));
const EquipmentTracking   = lazy(() => import('../pages/EquipmentTracking.tsx').then(m => ({ default: m.EquipmentTracking })));
const CustomsClearance    = lazy(() => import('../pages/CustomsClearance.tsx').then(m => ({ default: m.CustomsClearance })));
const PreAlerts           = lazy(() => import('../pages/PreAlerts.tsx').then(m => ({ default: m.PreAlerts })));
const ProformaValidator   = lazy(() => import('../pages/ProformaValidator').then(m => ({ default: m.ProformaValidator })));
const SmartDocs           = lazy(() => import('../pages/SmartDocs.tsx').then(m => ({ default: m.SmartDocs })));
const DatabaseView        = lazy(() => import('../pages/DatabaseView.tsx').then(m => ({ default: m.DatabaseView })));
const Suppliers           = lazy(() => import('../pages/Suppliers.tsx').then(m => ({ default: m.Suppliers })));
const Reports             = lazy(() => import('../pages/Reports.tsx').then(m => ({ default: m.Reports })));
const Settings            = lazy(() => import('../pages/Settings.tsx').then(m => ({ default: m.Settings })));
const ActionLogs          = lazy(() => import('../pages/AuditLogs.tsx').then(m => ({ default: m.ActionLogs })));
const DailyAudit          = lazy(() => import('../pages/DailyAudit.tsx').then(m => ({ default: m.DailyAudit })));
const DataStage           = lazy(() => import('../pages/DataStage.tsx').then(m => ({ default: m.DataStage })));
const Carriers            = lazy(() => import('../pages/Carriers.tsx').then(m => ({ default: m.Carriers })));
const TransportLines      = lazy(() => import('../pages/TransportLines.tsx').then(m => ({ default: m.TransportLines })));
const Drivers             = lazy(() => import('../pages/Drivers.tsx').then(m => ({ default: m.Drivers })));
const CIExtractor         = lazy(() => import('../pages/CIExtractor.tsx').then(m => ({ default: m.CIExtractor })));
const XMLInvoiceExtractor = lazy(() => import('../pages/XMLInvoiceExtractor.tsx').then(m => ({ default: m.XMLInvoiceExtractor })));
const XMLCI               = lazy(() => import('../pages/XMLCI.tsx').then(m => ({ default: m.XMLCI })));
const Models              = lazy(() => import('../pages/Models').then(m => ({ default: m.Models })));
const Cajas               = lazy(() => import('../pages/Cajas.tsx').then(m => ({ default: m.Cajas })));
const AsignacionesDiarias = lazy(() => import('../pages/AsignacionesDiarias.tsx').then(m => ({ default: m.AsignacionesDiarias })));
const Apendice10          = lazy(() => import('../pages/Apendice10.tsx').then(m => ({ default: m.Apendice10 })));
const CaptureModule       = lazy(() => import('../pages/CaptureModule.tsx').then(m => ({ default: m.CaptureModule })));
const HistorialCapturas   = lazy(() => import('../pages/HistorialCapturas.tsx').then(m => ({ default: m.HistorialCapturas })));
const ShippingSchedules   = lazy(() => import('../pages/ShippingSchedules.tsx').then(m => ({ default: m.ShippingSchedules })));
const PricingMatrix       = lazy(() => import('../pages/PricingMatrix.tsx').then(m => ({ default: m.PricingMatrix })));
const CCPBuilder          = lazy(() => import('../pages/CCPBuilder.tsx'));
const Controller          = lazy(() => import('../pages/Controller.tsx').then(m => ({ default: m.Controller })));
const Vucem               = lazy(() => import('../pages/Vucem.tsx').then(m => ({ default: m.Vucem })));
const ExpedienteElectronico = lazy(() => import('../pages/ExpedienteElectronico').then(m => ({ default: m.ExpedienteElectronico })));
const BOMAnalyzer         = lazy(() => import('../pages/BOMAnalyzer.tsx').then(m => ({ default: m.BOMAnalyzer })));
const AIAssistant         = lazy(() => import('../pages/AIAssistant.tsx').then(m => ({ default: m.AIAssistant })));
const BPMClasificacion    = lazy(() => import('../pages/BPMClasificacion.tsx').then(m => ({ default: m.BPMClasificacion })));
const DailyVanAssignment  = lazy(() => import('../pages/DailyVanAssignment.tsx').then(m => ({ default: m.DailyVanAssignment })));

// ─── Handheld — prioridad de carga (primeras en el chunk handheld) ──────────
const HandheldHome        = lazy(() => import('../pages/HandheldHome.tsx').then(m => ({ default: m.HandheldHome })));
const HandheldSellos      = lazy(() => import('../pages/HandheldSellos.tsx').then(m => ({ default: m.HandheldSellos })));
const HandheldLiberacion  = lazy(() => import('../pages/HandheldLiberacion.tsx').then(m => ({ default: m.HandheldLiberacion })));
const HandheldArribo      = lazy(() => import('../pages/HandheldArribo.tsx').then(m => ({ default: m.HandheldArribo })));

// ─── Fallback liviano mientras carga el chunk ────────────────────────────────
const PageLoader = () => (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900">
        <Loader2 size={32} className="animate-spin text-blue-400" />
    </div>
);


// Authenticated Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }: { children?: React.ReactNode, allowedRoles?: string[] }) => {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Agent role is limited to BPM, Daily Audit, and Master Data
    const isAgentAllowedPath = location.pathname === '/bpm' || location.pathname === '/daily-audit' || location.pathname === '/database';
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
        const allowed = ['/transport-lines', '/cajas', '/drivers', '/carriers', '/asignaciones-diarias'];
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

    // Cliente constraints — solo lectura de Asignaciones Diarias
    if (user?.role === UserRole.CLIENT) {
        const allowed = ['/asignaciones-diarias'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/asignaciones-diarias" replace />;
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
    const [isReady, setIsReady] = useState(false);
    const { isAuthenticated, loading, user } = useAuth();

    useEffect(() => {
        if (loading) return;

        // Async Init for IndexedDB and Services
        const init = async () => {
            try {
                // Skip heavy desktop init for handheld users
                const isHandheld = user?.role === UserRole.HANDHELD_USER || user?.role === UserRole.HANDHELD_USER2;
                if (!isHandheld) {
                    await storageService.init(user?.role);
                    await trackingService.init();
                }
                setIsReady(true);
            } catch (e) {
                console.error("Failed to initialize DB", e);
                console.warn("Database init failure. App loading anyway.");
            } finally {
                setIsReady(true);
            }
        };
        init();
    }, [loading, user?.role]);

    if (!isReady) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-4">
                <div className="animate-spin text-blue-600">
                    <Database size={48} />
                </div>
                <p className="font-medium animate-pulse">Loading Database...</p>
                <p className="text-xs">Migrating and indexing large datasets (High Capacity Mode)</p>
            </div>
        );
    }

    return (
        <Suspense fallback={<PageLoader />}>
        <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
            <Route path="/pre-alerts" element={<ProtectedRoute><PreAlerts /></ProtectedRoute>} />
            <Route path="/vessel-tracking" element={<ProtectedRoute><VesselTracking /></ProtectedRoute>} />
            <Route path="/equipment-tracking" element={<ProtectedRoute><EquipmentTracking /></ProtectedRoute>} />
            <Route path="/customs-clearance" element={<ProtectedRoute><CustomsClearance /></ProtectedRoute>} />
            <Route path="/commercial-invoices" element={<ProtectedRoute><CIExtractor /></ProtectedRoute>} />
            <Route path="/xml-invoices" element={<ProtectedRoute><XMLInvoiceExtractor /></ProtectedRoute>} />
            <Route path="/xml-ci" element={<ProtectedRoute><XMLCI /></ProtectedRoute>} />
            <Route path="/ccp-builder" element={<ProtectedRoute><CCPBuilder /></ProtectedRoute>} />
            <Route path="/data-stage" element={<ProtectedRoute><DataStage /></ProtectedRoute>} />
            <Route path="/controller" element={<ProtectedRoute><Controller /></ProtectedRoute>} />
            <Route path="/vucem" element={<ProtectedRoute><Vucem /></ProtectedRoute>} />
            <Route path="/models" element={<ProtectedRoute><Models /></ProtectedRoute>} />
            <Route path="/shipping-schedules" element={<ProtectedRoute><ShippingSchedules /></ProtectedRoute>} />
            <Route path="/pricing-matrix" element={<ProtectedRoute><PricingMatrix /></ProtectedRoute>} />
            <Route path="/cajas" element={<ProtectedRoute><Cajas /></ProtectedRoute>} />
            <Route path="/asignaciones-diarias" element={<ProtectedRoute><AsignacionesDiarias /></ProtectedRoute>} />
            <Route path="/macro" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EXPO]}><CaptureModule /></ProtectedRoute>} />
            <Route path="/historial-capturas" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EXPO]}><HistorialCapturas /></ProtectedRoute>} />
            <Route path="/apendice10" element={<ProtectedRoute><Apendice10 /></ProtectedRoute>} />
            <Route path="/carriers" element={<ProtectedRoute><Carriers /></ProtectedRoute>} />
            <Route path="/transport-lines" element={<ProtectedRoute><TransportLines /></ProtectedRoute>} />
            <Route path="/drivers" element={<ProtectedRoute><Drivers /></ProtectedRoute>} />
            <Route path="/expediente-electronico" element={
                <ProtectedRoute>
                    <ExpedienteElectronico setActiveTab={(tab) => {
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

            {/* Handheld Routes */}
            <Route path="/m/home" element={<ProtectedRoute><HandheldHome /></ProtectedRoute>} />
            <Route path="/m/sellos" element={<ProtectedRoute><HandheldSellos /></ProtectedRoute>} />
            <Route path="/m/liberacion" element={<ProtectedRoute><HandheldLiberacion /></ProtectedRoute>} />
            <Route path="/m/arribo" element={<ProtectedRoute><HandheldArribo /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
    );
};

const App: React.FC = () => {
    return (
        <LanguageProvider>
            <HashRouter>
                <VucemProvider>
                    <AppContent />
                </VucemProvider>
                <NotificationPopup />
            </HashRouter>
        </LanguageProvider>
    );
};

export default App;

