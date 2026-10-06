import React, { useState } from 'react';
import { FlaskConical, Sparkles, Rocket, Code2, ShieldAlert, Terminal, BookOpen } from 'lucide-react';
import GeneratorTab from '../components/aitest/GeneratorTab';
import HealingTab from '../components/aitest/HealingTab';
import RunnerTab from '../components/aitest/RunnerTab';
import HistoryTab from '../components/aitest/HistoryTab';
import { TestForge } from './TestForge';
import { AiHealingStudio } from './AiHealingStudio';

const TABS = [
  { id: 'generate', label: 'Generate Tests', icon: Sparkles, hint: 'URL + plain words → Selenium code (reads the live page)' },
  { id: 'run', label: 'Smart Test Runs', icon: Rocket, hint: 'Login / flows / manual steps → headless browser runs' },
  { id: 'healcode', label: 'Fix Code', icon: Code2, hint: 'Paste any buggy code → AI fix + plain-English explanation' },
  { id: 'heal', label: 'Fix Locators', icon: ShieldAlert, hint: 'Broken selector + page HTML → working replacement' },
  { id: 'runner', label: 'Run Sandbox', icon: Terminal, hint: 'Compile + run Java instantly, auto-repair failures' },
  { id: 'history', label: 'History', icon: BookOpen, hint: 'Your generated tests and runs' },
];

// Single merged lab: Autonomous generator/healing/sandbox +
// Test Forge no-code runs + Healing Studio code repair.
export function AiLab() {
  const [activeTab, setActiveTab] = useState('generate');
  const [runnerCode, setRunnerCode] = useState('');
  const [runnerClassName, setRunnerClassName] = useState('');
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('autoqa_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleSaveToHistory = (item) => {
    setHistory((prev) => {
      const updated = [item, ...prev].slice(0, 50);
      try {
        localStorage.setItem('autoqa_history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history to localStorage', e);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('autoqa_history');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveHistoryItem = (id) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('autoqa_history', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleSendToRunner = (code, className) => {
    setRunnerCode(code);
    setRunnerClassName(className);
    setActiveTab('runner');
  };

  const active = TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-glow">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">AI Test Lab</h1>
          <p className="text-sm text-slate-500">{active?.hint}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/70 border border-slate-200 rounded-xl px-4 py-2.5">
        <span className="font-bold text-slate-700">How it flows:</span>
        <span>Generate Tests <span className="text-slate-300 mx-1">→</span> Smart Test Runs / Run Sandbox</span>
        <span className="text-slate-300">•</span>
        <span>broken? Fix Code / Fix Locators</span>
        <span className="text-slate-300">•</span>
        <span>everything lands in History</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.hint}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-transparent shadow-glow'
                  : 'text-slate-500 bg-white/70 border-slate-200 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'history' && history.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
                  {history.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'generate' && (
        <GeneratorTab onSendToRunner={handleSendToRunner} onSaveTest={handleSaveToHistory} />
      )}
      {activeTab === 'run' && <TestForge />}
      {activeTab === 'healcode' && <AiHealingStudio />}
      {activeTab === 'heal' && (
        <HealingTab onSaveTest={handleSaveToHistory} />
      )}
      {activeTab === 'runner' && (
        <RunnerTab
          key={runnerCode || 'default'}
          codeFromGenerator={runnerCode}
          classNameFromGenerator={runnerClassName}
          onSaveTest={handleSaveToHistory}
        />
      )}
      {activeTab === 'history' && (
        <HistoryTab
          history={history}
          onClearHistory={handleClearHistory}
          onSendToRunner={handleSendToRunner}
          onRemoveItem={handleRemoveHistoryItem}
        />
      )}
    </div>
  );
}
