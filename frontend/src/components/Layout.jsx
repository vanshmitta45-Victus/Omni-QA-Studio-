import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Search } from 'lucide-react';

const titles = {
  '/': { kicker: 'Mission Control', title: 'QA Intelligence Dashboard' },
  '/ai-studio': { kicker: 'AI Engine', title: 'AI Code Healing Studio' },
  '/chat': { kicker: 'Realtime', title: 'Collaboration Hub' },
  '/lab': { kicker: 'AI Lab', title: 'AI Test Lab' },
  '/users': { kicker: 'Workspace', title: 'User Management' },
  '/forge': { kicker: 'No-Code', title: 'AI Test Forge' },
};

export const Layout = () => {
  const { pathname } = useLocation();
  const meta = titles[pathname] || { kicker: 'OmniQA', title: 'Studio' };

  return (
    <div className="flex min-h-screen aurora-bg text-slate-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Ambient art */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-grid" />
          <div className="absolute -top-32 left-1/4 w-[480px] h-[480px] rounded-full bg-sky-300/40 blur-[120px] animate-aurora-drift" />
          <div className="absolute top-10 right-0 w-[380px] h-[380px] rounded-full bg-fuchsia-300/30 blur-[110px] animate-aurora-drift" />
        </div>

        {/* Topbar */}
        <header className="relative z-10 flex items-center gap-4 px-8 pt-6">
          <h1 className="font-display text-xl font-bold text-slate-900 tracking-tight truncate">
            {meta.title}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <label className="hidden md:flex items-center gap-2 glass border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-500 w-64 focus-within:border-sky-400 transition-colors shadow-sm">
              <Search className="w-4 h-4" />
              <input
                placeholder="Search runs, bugs, notes…"
                className="bg-transparent outline-none placeholder:text-slate-400 text-slate-800 w-full text-sm"
              />
              <kbd className="text-[10px] font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">⌘K</kbd>
            </label>
          </div>
        </header>

        <main className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
