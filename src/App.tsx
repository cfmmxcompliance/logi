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
import { CIExtractor } from '../pages/CIExtractor.tsx';
import CCPBuilder from '../pages/CCPBuilder.tsx';
import { Controller } from '../pages/Controller.tsx';
import { Vucem } from '../pages/Vucem.tsx';
import { storageService } from '../services/storageService.ts';
import { trackingService } from '../services/trackingService.ts';
import { AuthProvider, useAuth } from '../context/AuthContext.tsx';
import { NotificationProvider } from '../context/NotificationContext.tsx';
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

    // Agent role is limited to Master Data and Daily Audit
    const isAgentAllowedPath = location.pathname === '/database' || location.pathname === '/daily-audit';
    if (user?.role === UserRole.AGENT && !isAgentAllowedPath) {
        return <Navigate to="/database" replace />;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
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
            <Route path="/ccp-builder" element={<ProtectedRoute><CCPBuilder /></ProtectedRoute>} />
            <Route path="/data-stage" element={<ProtectedRoute><DataStage /></ProtectedRoute>} />
            <Route path="/controller" element={<ProtectedRoute><Controller /></ProtectedRoute>} />
            <Route path="/vucem" element={<ProtectedRoute><Vucem /></ProtectedRoute>} />
            <Route path="/proforma-validator" element={<ProtectedRoute><ProformaValidator /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><SmartDocs /></ProtectedRoute>} />
            <Route path="/database" element={<ProtectedRoute><DatabaseView /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute><ActionLogs /></ProtectedRoute>} />
            <Route path="/daily-audit" element={<ProtectedRoute><DailyAudit /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

const App: React.FC = () => {
    return (
        <HashRouter>
            <AppContent />
            <NotificationPopup />
        </HashRouter>
    );
};

export default App;
