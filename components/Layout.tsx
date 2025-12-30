import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Ship, FileText, BarChart3, Settings, Menu, X, LogOut, Users, Anchor, Container, ClipboardCheck, Bell, Scale, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { UserRole } from '../types.ts';

const SidebarItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <NavLink
      to={to}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 flex-shrink-0 transition-all duration-300 flex flex-col`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {sidebarOpen && <h1 className="text-xl font-bold text-white tracking-wider">LOGIMASTER</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-2 space-y-2">
          {user?.role === 'Admin' && (
            <SidebarItem to="/" icon={LayoutDashboard} label={sidebarOpen ? "Dashboard" : ""} />
          )}
          <SidebarItem to="/operations" icon={Ship} label={sidebarOpen ? "Shipment Plan" : ""} />
          <SidebarItem to="/pre-alerts" icon={Bell} label={sidebarOpen ? "Pre-Alerts" : ""} />
          <SidebarItem to="/vessel-tracking" icon={Anchor} label={sidebarOpen ? "Tracking" : ""} />
          <SidebarItem to="/equipment-tracking" icon={Container} label={sidebarOpen ? "Equipment" : ""} />
          <SidebarItem to="/customs-clearance" icon={ClipboardCheck} label={sidebarOpen ? "Customs Clearance" : ""} />
          <SidebarItem to="/commercial-invoices" icon={FileText} label={sidebarOpen ? "CI Extractor" : ""} />
          <SidebarItem to="/ccp-builder" icon={Truck} label={sidebarOpen ? "CCP Builder" : ""} />

          {/* RBAC: Restricted Areas */}
          {(user?.role === 'Admin' || user?.role === 'Editor') && (
            <>
              <SidebarItem to="/data-stage" icon={Scale} label={sidebarOpen ? "Data Stage (SAT)" : ""} />
              <SidebarItem to="/database" icon={Database} label={sidebarOpen ? "Master Data" : ""} />
            </>
          )}

          {user?.role === 'Admin' && (
            <>
              <SidebarItem to="/documents" icon={FileText} label={sidebarOpen ? "Smart Docs (AI)" : ""} />
              <SidebarItem to="/suppliers" icon={Users} label={sidebarOpen ? "Partners" : ""} />
              <SidebarItem to="/reports" icon={BarChart3} label={sidebarOpen ? "Reports & KPIs" : ""} />
              <SidebarItem to="/settings" icon={Settings} label={sidebarOpen ? "Settings" : ""} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {sidebarOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 bg-slate-800 p-2 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                  {user?.avatarInitials}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 justify-center w-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <button onClick={logout} className="mx-auto w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white bg-slate-800 rounded-lg">
              <LogOut size={20} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-slate-700">CFMoto Import/Export Control</h2>
          <div className="flex items-center space-x-4">
            <ConnectionStatus />
            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${user?.role === 'Admin' ? 'bg-red-50 text-red-600 border-red-200' :
              user?.role === 'Editor' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
              {user?.role.toUpperCase()} ACCESS
            </div>
          </div>
        </header>
        <div className="p-8 pb-20">
          {children}
        </div>
      </main>
    </div>
  );
};