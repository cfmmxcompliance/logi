import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout.tsx';
import { Dashboard } from '../pages/Dashboard.tsx';
import { Operations } from '../pages/Operations.tsx';
import { VesselTracking } from '../pages/VesselTracking.tsx';
import { EquipmentTracking } from '../pages/EquipmentTracking.tsx';
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
import { TransportLines } from '../pages/TransportLines.tsx';
import { Drivers } from '../pages/Drivers.tsx';
import { CIExtractor } from '../pages/CIExtractor.tsx';
import { XMLInvoiceExtractor } from '../pages/XMLInvoiceExtractor.tsx';
import { XMLCI } from '../pages/XMLCI.tsx';
import { Models } from '../pages/Models';
import { Cajas } from '../pages/Cajas.tsx';
import { AsignacionesDiarias } from '../pages/AsignacionesDiarias.tsx';
import { Apendice10 } from '../pages/Apendice10.tsx';
import { CaptureModule } from '../pages/CaptureModule.tsx';
import { ShippingSchedules } from '../pages/ShippingSchedules.tsx';
import { PricingMatrix } from '../pages/PricingMatrix.tsx';
import CCPBuilder from '../pages/CCPBuilder.tsx';
import { Controller } from '../pages/Controller.tsx';
import { Vucem } from '../pages/Vucem.tsx';
import { ExpedienteElectronico } from '../pages/ExpedienteElectronico';
import { BOMAnalyzer } from '../pages/BOMAnalyzer.tsx';
import { AIAssistant } from '../pages/AIAssistant.tsx';
import { HandheldHome } from '../pages/HandheldHome.tsx';
import { HandheldSellos } from '../pages/HandheldSellos.tsx';
import { HandheldLiberacion } from '../pages/HandheldLiberacion.tsx';
import { BPMClasificacion } from '../pages/BPMClasificacion.tsx';
import { DailyVanAssignment } from '../pages/DailyVanAssignment.tsx';
import { storageService } from '../services/storageService.ts';
import { trackingService } from '../services/trackingService.ts';
import { AuthProvider, useAuth } from '../context/AuthContext.tsx';
import { NotificationProvider } from '../context/NotificationContext.tsx';
import { VucemProvider } from '../context/VucemContext.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { NotificationPopup } from '../components/NotificationPopup.tsx';
import { Database } from 'lucide-react';
import { UserRole } from '../types.ts';

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
        const allowed = ['/models', '/pricing-matrix', '/shipping-schedules', '/asignaciones-diarias', '/daily-van-assignment', '/xml-ci', '/xml-invoices'];
        if (!allowed.includes(location.pathname)) return <Navigate to="/daily-van-assignment" replace />;
    }

    // Embarques constraints
    if (user?.role === UserRole.EMBARQUES) {
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
                await storageService.init(user?.role);
                // storageService.initAutoBackup();

                // Initialize Automated 4AM Tracking Check
                await trackingService.init();

                setIsReady(true);
            } catch (e) {
                console.error("Failed to initialize DB", e);
                // Do NOT alert blocking. Just log. User can proceed with degraded functionality.
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
            {import.meta.env.DEV && (
               <Route path="/macro" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EDITOR, UserRole.AGENT, UserRole.CONTROLLER, UserRole.EXPO]}><CaptureModule /></ProtectedRoute>} />
            )}
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

            {/* Handheld Routes */}
            <Route path="/m/home" element={<ProtectedRoute><HandheldHome /></ProtectedRoute>} />
            <Route path="/m/sellos" element={<ProtectedRoute><HandheldSellos /></ProtectedRoute>} />
            <Route path="/m/liberacion" element={<ProtectedRoute><HandheldLiberacion /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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

