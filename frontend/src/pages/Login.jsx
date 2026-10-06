import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Lock, User, AlertCircle, ArrowRight, Sparkles, PlayCircle, MessageSquare, ShieldCheck, Orbit } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="min-h-screen aurora-bg flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-sky-300/50 blur-[130px] animate-aurora-drift" />
        <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-fuchsia-300/40 blur-[120px] animate-aurora-drift" />
        <Orbit className="absolute top-16 right-[12%] w-10 h-10 text-sky-300/70 animate-aurora-drift" />
      </div>

      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 overflow-hidden rounded-3xl border border-white bg-white/70 shadow-glow-lg backdrop-blur-xl">
        {/* Showcase */}
        <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-sky-500 via-blue-600 to-violet-700 relative overflow-hidden text-white">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/20 blur-[100px]" />
          <div className="absolute bottom-10 left-10 w-56 h-56 rounded-full bg-cyan-300/30 blur-[90px]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white text-blue-700 flex items-center justify-center shadow-lg">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-tight">OmniQA Studio</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-100/90">Future QA Suite · 2030</p>
              </div>
            </div>
            <h2 className="mt-10 font-display text-4xl font-bold leading-[1.05] tracking-tight">
              Quality that ships itself.
            </h2>
            <p className="mt-4 text-sm text-sky-50/90 max-w-sm leading-relaxed">
              Live test telemetry, AI code healing and team war-rooms — one mission control for the whole release.
            </p>
            <div className="mt-8 space-y-3 text-sm">
              {[
                { icon: PlayCircle, t: 'Parallel Selenium + API runs stream in live' },
                { icon: Sparkles, t: 'AI heals buggy code side-by-side' },
                { icon: MessageSquare, t: 'War-rooms with screenshots & video' },
              ].map((f) => (
                <div key={f.t} className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-white/15 border border-white/20"><f.icon className="w-4 h-4" /></span>
                  <span>{f.t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex items-center gap-2 text-[11px] font-mono text-sky-50/80">
            <ShieldCheck className="w-4 h-4" />
            SOC2-ready · JWT · Rate-limited gateway
          </div>
        </div>

        {/* Form */}
        <div className="bg-white/90 p-8 sm:p-10">
          <h3 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h3>
          <p className="mt-1.5 text-sm text-slate-500">Sign in to your QA mission control.</p>

          {error && (
            <div className="mt-5 flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-[0.16em] mb-2">
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username or email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-[0.16em]">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-sky-600 hover:text-sky-500 font-bold transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-glow text-sm font-bold text-white bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 hover:from-sky-400 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-400 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Studio</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-sky-600 hover:text-sky-500 transition-colors">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
