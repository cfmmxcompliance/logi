import React, { useState, useEffect, ReactNode } from 'react';
import { User } from '../types.ts';
import { authService } from '../services/authService.ts';
import { AuthContext, AuthContextType, sanitizeRole } from './authContext';

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    // 1. OPTIMISTIC HYDRATION: Read from localStorage immediately during initialization
    const stored = localStorage.getItem('logimaster_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed) parsed.role = sanitizeRole(parsed.role as unknown as string);
        return parsed;
      } catch (e) { return null; }
    }
    return null;
  });
  const [loading, setLoading] = useState(!localStorage.getItem('logimaster_user'));

  useEffect(() => {
    const validateSession = async () => {
      const storedUser = localStorage.getItem('logimaster_user');
      if (!storedUser) {
        setLoading(false);
        return;
      }

      // Immediately unblock the UI - the user is already loaded from localStorage
      setLoading(false);

      // Background re-validation: refresh role data silently without blocking
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.email) {
          // Retry up to 3 times with 2s delay before concluding user doesn't exist.
          // Prevents false logouts caused by transient Firestore unavailability
          // (HMR reloads, concurrent heavy DB operations, network hiccups, etc.)
          let dbUser = null;
          const MAX_RETRIES = 3;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            dbUser = await authService.getUser(parsedUser.email);
            if (dbUser) break;
            if (attempt < MAX_RETRIES) {
              console.warn(`⚠️ Session validation attempt ${attempt}/${MAX_RETRIES} returned null — retrying in 2s...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          if (dbUser) {
            dbUser.role = sanitizeRole(dbUser.role as unknown as string);
            setUser(dbUser);
            localStorage.setItem('logimaster_user', JSON.stringify(dbUser));
          } else {
            // Only clear session after 3 failed attempts — user truly doesn't exist
            console.warn('⚠️ Session Expired: User not found after 3 attempts.');
            localStorage.removeItem('logimaster_user');
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Background session validation failed (non-blocking):', err);
        // Keep the optimistic session - don't clear on network errors
      }
    };

    validateSession();
  }, []);


  const login = (userData: User) => {
    userData.role = sanitizeRole(userData.role as unknown as string);
    setUser(userData);
    localStorage.setItem('logimaster_user', JSON.stringify(userData));
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    localStorage.removeItem('logimaster_user');
  };

  const hasRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, hasRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// useAuth hook is in ./useAuth.ts (separated to fix Vite Fast Refresh HMR)