import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types.ts';
import { authService } from '../services/authService.ts';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (roles: UserRole[]) => boolean;
  loading: boolean;
}

const sanitizeRole = (roleStr: string): UserRole => {
  if (!roleStr) return UserRole.PENDING;
  const normalized = roleStr.trim().toUpperCase();
  const map: Record<string, UserRole> = {
    'ADMIN': UserRole.ADMIN,
    'EDITOR': UserRole.EDITOR,
    'AGENT': UserRole.AGENT,
    'CONTROLLER': UserRole.CONTROLLER,
    'PENDING': UserRole.PENDING,
    'EXPO': UserRole.EXPO,
    'EXPO_ANALIST': UserRole.EXPO_ANALIST,
    'CARRIER': UserRole.CARRIER,
    'TRANSPORTISTA': UserRole.TRANSPORTISTA,
    'EMBARQUES': UserRole.EMBARQUES,
    'CLIENT': UserRole.CLIENT,
    'CLIENTE': UserRole.CLIENT,
    'FINANZAS': UserRole.FINANZAS
  };
  return map[normalized] || (roleStr as UserRole);
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
          const dbUser = await authService.getUser(parsedUser.email);
          if (dbUser) {
            dbUser.role = sanitizeRole(dbUser.role as unknown as string);
            setUser(dbUser);
            localStorage.setItem('logimaster_user', JSON.stringify(dbUser));
          } else {
            console.warn('⚠️ Session Expired: User deleted from database.');
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};