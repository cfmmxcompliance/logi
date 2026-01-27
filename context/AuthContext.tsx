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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    // 1. OPTIMISTIC HYDRATION: Read from localStorage immediately during initialization
    const stored = localStorage.getItem('logimaster_user');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) { return null; }
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

      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.email) {
          // BACKGROUND VALIDATION: Don't block UI if we already have a user
          const dbUser = await authService.getUser(parsedUser.email);
          if (dbUser) {
            setUser(dbUser); // Refresh with latest data (roles, etc)
            localStorage.setItem('logimaster_user', JSON.stringify(dbUser));
          } else {
            console.warn("⚠️ Session Expired: User deleted from database.");
            localStorage.removeItem('logimaster_user');
            setUser(null);
          }
        }
      } catch (err) {
        console.error("Session Validation Failed:", err);
        // We only clear if it's a definitive "user not found" or similar auth error
        // If it's just a network error, we keep the optimistic session for offline support
      } finally {
        setLoading(false);
      }
    };

    validateSession();
  }, []);

  const login = (userData: User) => {
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