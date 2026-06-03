import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import ScanScreen from './screens/ScanScreen.jsx';
import LookupScreen from './screens/LookupScreen.jsx';
import { LangProvider } from './i18n.jsx';

// Auth Guard — usa la misma key que el webapp principal
const ProtectedRoute = ({ children }) => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('logimaster_user') || 'null');
    
    useEffect(() => {
        if (!user) {
            navigate('/login');
        }
    }, [navigate, user]);

    if (!user) return null;
    return children;
};

export default function App() {
    return (
        <LangProvider>
            <HashRouter>
                <div className="min-h-screen bg-[#1a1a2e] text-white">
                    <Routes>
                        <Route path="/login" element={<LoginScreen />} />
                        <Route path="/home" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
                        <Route path="/scan" element={<ProtectedRoute><ScanScreen /></ProtectedRoute>} />
                        <Route path="/lookup" element={<ProtectedRoute><LookupScreen /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                </div>
            </HashRouter>
        </LangProvider>
    );
}
