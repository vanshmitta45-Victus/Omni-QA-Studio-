import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, FlaskConical, LogOut, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar = () => {
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', desc: 'Telemetry & triage', icon: LayoutDashboard },
    { to: '/lab', label: 'AI Test Lab', desc: 'Generate, run & heal', icon: FlaskConical },
    { to: '/chat', label: 'Collaboration Hub', desc: 'Team war-rooms', icon: MessageSquare },
    { to: '/users', label: 'User Management', desc: 'Team & access', icon: Users },
  ];

  return (
    <aside className="w-[268px] shrink-0 flex flex-col h-screen sticky top-0 border-r border-slate-200/80 bg-white/70 backdrop-blur-xl">
      {/* Brand */}
      <div className="p-5 pb-4 flex items-center gap-3">
        <div className="relative">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-400 via-blue-600 to-violet-600 flex items-center justify-center text-white shadow-glow">
            <Terminal className="w-5 h-5" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[17px] text-slate-900 leading-tight tracking-tight">OmniQA Studio</h1>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase bg-gradient-to-r from-sky-600 to-fuchsia-600 bg-clip-text text-transparent">Future QA Suite</p>
        </div>
      </div>

      {/* Usage pulse */}
      <div className="mx-5 mb-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          Pipeline pulse
          <span className="ml-auto text-[10px] font-mono text-emerald-600">● live</span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-violet-500" />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">74% suites green in last 24h</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3.5 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-2.5 mb-2">Platform</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all border ${
                  isActive
                    ? 'bg-gradient-to-r from-sky-500 to-violet-600 text-white border-transparent shadow-glow'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-sky-50 border-transparent'
                }`
              }
            >
              <span className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/10 transition-colors">
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight truncate">{item.label}</span>
                <span className="block text-[11px] opacity-70 truncate">{item.desc}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4">
        <div className="rounded-2xl glass border border-slate-200 p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm shadow-glow">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="truncate min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.username || 'QA Engineer'}</p>
              <span className="inline-flex items-center text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md">
                <ShieldCheck className="w-3 h-3 mr-1" />
                {user?.role ? user.role.replace('ROLE_', '') : 'QA_ENGINEER'}
              </span>
            </div>
            <button
              onClick={logout}
              title="Log Out"
              className="ml-auto p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
