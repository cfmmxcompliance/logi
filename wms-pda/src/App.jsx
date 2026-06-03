import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import ScanScreen from './screens/ScanScreen.jsx';
import LookupScreen from './screens/LookupScreen.jsx';

// Auth Guard
const ProtectedRoute = ({ children }) => {
    const navigate = useNavigate();
    const token = sessionStorage.getItem('wms_jwt');
    const user = JSON.parse(sessionStorage.getItem('wms_user') || 'null');
    const loginTime = parseInt(sessionStorage.getItem('wms_login_time') || '0', 10);
    
    useEffect(() => {
        const checkAuth = () => {
            if (!token || !user) {
                navigate('/login');
                return;
            }
            // Auto logout after 10 mins inactivity
            const now = Date.now();
            if (now - loginTime > 10 * 60 * 1000) {
                sessionStorage.clear();
                navigate('/login');
            } else {
                // Refresh activity timer
                sessionStorage.setItem('wms_login_time', now.toString());
            }
        };
        checkAuth();
        
        // Setup listener for user activity to reset timer
        const resetTimer = () => sessionStorage.setItem('wms_login_time', Date.now().toString());
        window.addEventListener('click', resetTimer);
        window.addEventListener('keypress', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        
        return () => {
            window.removeEventListener('click', resetTimer);
            window.removeEventListener('keypress', resetTimer);
            window.removeEventListener('touchstart', resetTimer);
        };
    }, [navigate, token, user, loginTime]);

    if (!token || !user) return null;
    return children;
};

export default function App() {
    return (
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
    );
}
