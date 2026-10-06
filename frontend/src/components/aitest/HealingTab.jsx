import React, { useState } from 'react';
import { ShieldAlert, Sparkles, Copy, Check, AlertCircle, Loader2, ArrowRight, Wand2, CheckCircle2 } from 'lucide-react';
import { healBrokenLocator } from '../../aitest/aiTestApi';

const SAMPLE_HEALING_CASES = [
  {
    title: 'Changed Submit Button ID',
    failedLocator: 'button#btn_submit_old',
    currentDom: `<form id="auth-form" class="auth-box">
  <input type="text" name="username" placeholder="Username" />
  <input type="password" name="password" placeholder="Password" />
  <button id="btn-login-submit" type="submit" class="btn-primary w-full">Sign In to Dashboard</button>
</form>`
  },
  {
    title: 'Migrated Input Field Name',
    failedLocator: 'input[name="user_email"]',
    currentDom: `<div class="account-settings">
  <label for="acc-email">Primary Email Address</label>
  <input id="acc-email" name="customer_email" type="email" class="form-control" placeholder="user@company.com" />
</div>`
  },
  {
    title: 'Obsolete Search Icon Class',
    failedLocator: '.search-trigger-v1',
    currentDom: `<header class="top-nav">
  <div class="logo">App</div>
  <button type="button" aria-label="Search documentation" class="search-btn-modern flex items-center">
    <svg class="search-icon"></svg>
    <span>Search docs...</span>
  </button>
</header>`
  }
];

export default function HealingTab({ onSaveTest }) {
  const [failedLocator, setFailedLocator] = useState('button#btn_submit_old');
  const [currentDom, setCurrentDom] = useState(SAMPLE_HEALING_CASES[0].currentDom);
  const [isHealing, setIsHealing] = useState(false);
  const [healedLocator, setHealedLocator] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSelectCase = (sample) => {
    setFailedLocator(sample.failedLocator);
    setCurrentDom(sample.currentDom);
    setHealedLocator('');
    setError(null);
  };

  const handleHeal = async (e) => {
    if (e) e.preventDefault();
    if (!failedLocator.trim() || !currentDom.trim()) {
      setError('Please provide both the failed locator and current HTML DOM snippet.');
      return;
    }

    setIsHealing(true);
    setError(null);

    try {
      const res = await healBrokenLocator(failedLocator.trim(), currentDom.trim());

      if (!res.success) {
        throw new Error(res.error || 'Server responded with an error');
      }

      const plainText = res.healedLocator || '';
      let cleaned = plainText.trim().replace(/`/g, '');
      setHealedLocator(cleaned);

      if (onSaveTest) {
        onSaveTest({
          id: Date.now(),
          type: 'healed',
          title: `Healed: ${failedLocator} -> ${cleaned}`,
          failedLocator,
          healedLocator: cleaned,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    } catch (err) {
      console.error('Network error during self-healing:', err);
      setError(err.message || 'Failed to heal locator. Ensure backend is running on port 8080.');
    } finally {
      setIsHealing(false);
    }
  };

  const handleCopy = () => {
    if (!healedLocator) return;
    navigator.clipboard.writeText(healedLocator);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-purple-400" />
              Self-Healing Locator Engine
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Did a frontend deployment break your test locators? Feed the failed selector and updated DOM to have AI adaptively infer the new resilient locator.
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold self-start md:self-auto">
            Zero Test Downtime
          </span>
        </div>

        {/* Sample Scenarios */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Load Sample Broken Scenarios
          </span>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_HEALING_CASES.map((sample, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSelectCase(sample)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-600/20 hover:text-purple-300 text-slate-600 border border-slate-200 hover:border-purple-500/30 transition-colors flex items-center gap-1.5"
              >
                <span>{sample.title}</span>
                <ArrowRight className="h-3 w-3 text-slate-500" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form */}
        <div className="lg:col-span-7 space-y-4">
          <form onSubmit={handleHeal} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Broken Locator Context
            </h2>

            {/* Failed Locator */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Broken / Failed Locator (CSS Selector or XPath)
              </label>
              <input
                type="text"
                value={failedLocator}
                onChange={(e) => setFailedLocator(e.target.value)}
                placeholder="e.g. button#old-id or //button[@name='btn']"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors font-mono text-xs"
              />
            </div>

            {/* Current DOM Snippet */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Current HTML DOM Snippet of Target Page
              </label>
              <textarea
                rows={8}
                value={currentDom}
                onChange={(e) => setCurrentDom(e.target.value)}
                placeholder="<form>...</form>"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors font-mono leading-relaxed resize-none"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Healing Error</p>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Action Button */}
            <button
              type="submit"
              disabled={isHealing}
              className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isHealing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span> Computing Adaptive Locator...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  <span>Heal Broken Locator</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Healing Results */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              Healing Analysis Output
            </h2>

            {isHealing ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                <p className="text-sm font-medium text-slate-800">Evaluating DOM candidate elements...</p>
                <p className="text-xs text-slate-500 max-w-xs">
                  AI is cross-referencing attributes, semantic roles, text, and structure.
                </p>
              </div>
            ) : healedLocator ? (
              <div className="space-y-4">
                {/* Status Callout */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="font-medium">Resilient locator successfully inferred!</span>
                </div>

                {/* Diff Comparison */}
                <div className="space-y-3">
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-rose-500/30">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-rose-400 block mb-1">
                      Failed Original Locator:
                    </span>
                    <code className="text-xs font-mono text-rose-300 line-through">
                      {failedLocator}
                    </code>
                  </div>

                  <div className="p-3.5 bg-slate-950/90 rounded-xl border border-emerald-500/40 relative">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400 block mb-1">
                      ✨ New Healed Locator:
                    </span>
                    <code className="text-sm font-mono text-emerald-300 font-semibold block break-all">
                      {healedLocator}
                    </code>

                    <button
                      onClick={handleCopy}
                      className="mt-3 w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs rounded-lg border border-emerald-500/30 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy Healed Locator'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-slate-500">
                <Wand2 className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Awaiting Analysis</p>
                <p className="text-xs text-slate-600 max-w-xs">
                  Pick a sample case on top or supply your broken locator and DOM snippet, then click Heal.
                </p>
              </div>
            )}
          </div>

          {/* Educational Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1.5">
            <span className="font-semibold text-slate-800">How it works:</span>
            <p className="text-[11px] leading-relaxed">
              When UI elements update, traditional Selenium tests crash with <code>NoSuchElementException</code>. The Self-Healing engine analyzes the semantic context, tags, classes, and accessible attributes in the current DOM to compute the most durable replacement locator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
