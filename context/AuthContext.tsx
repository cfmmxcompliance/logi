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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const storedUser = localStorage.getItem('logimaster_user');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          // Validate against DB if possible
          if (parsedUser.email) {
            try {
              const dbUser = await authService.getUser(parsedUser.email);
              if (dbUser) {
                setUser(dbUser); // Use fresh data (e.g. Role updates)
              } else {
                console.warn("⚠️ Session Expired: User deleted from database.");
                localStorage.removeItem('logimaster_user');
                setUser(null);
              }
            } catch (err) {
              // STRICT SECURITY: If DB validation errors, assume session invalid.
              // Do NOT allow offline fallback if we suspect the user might be deleted/revoked.
              console.error("Session Validation Failed (Possible Revocation):", err);
              localStorage.removeItem('logimaster_user');
              setUser(null);
            }
          } else {
            // Invalid structure
            localStorage.removeItem('logimaster_user');
            setUser(null);
          }
        } catch (e) {
          console.error("Failed to parse user session");
          localStorage.removeItem('logimaster_user');
        }
      }
      setLoading(false);
    };

    initSession();
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