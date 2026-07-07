import { createContext } from 'react';
import { User, UserRole } from '../types.ts';

export interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (roles: UserRole[]) => boolean;
  loading: boolean;
}

export const sanitizeRole = (roleStr: string): UserRole => {
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

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
