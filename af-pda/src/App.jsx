import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LangProvider } from './i18n.jsx';
import ActivosFijosScreen from './screens/ActivosFijosScreen.tsx';
import LoginScreen from './screens/LoginScreen.jsx';


// Auth Guard
const ProtectedRoute = ({ children }) => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('logimaster_user') || 'null');
    const isAllowed = user && (user.role === 'ADMIN' || user.role === 'HANDHELD_AF');
    
    useEffect(() => {
        if (!isAllowed) {
            navigate('/login');
        }
    }, [navigate, isAllowed]);

    if (!isAllowed) return null;
    return children;
};

export default function App() {
    return (
        <LangProvider>
            <HashRouter>
                <div className="min-h-screen bg-[#0f172a] text-white">
                    <Routes>
                        <Route path="/login" element={<LoginScreen />} />
                        <Route path="/activos-fijos" element={<ProtectedRoute><ActivosFijosScreen /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/activos-fijos" replace />} />
                    </Routes>
                </div>
            </HashRouter>
        </LangProvider>
    );
}
