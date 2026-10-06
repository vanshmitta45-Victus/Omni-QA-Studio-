import React, { useState } from 'react';
import { BookOpen, Sparkles, ShieldAlert, Terminal, Copy, Check, Download, Play, Trash2 } from 'lucide-react';

export default function HistoryTab({ history, onClearHistory, onSendToRunner, onRemoveItem }) {
  const [filter, setFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const filteredHistory = history.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (item) => {
    if (!item.code) return;
    const fileName = `${item.className || 'Test'}.java`;
    const blob = new Blob([item.code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-400" />
              Test Library & Execution History
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Browse previously generated test suites, healed locators, and sandbox compilation results.
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors flex items-center gap-1.5 self-start md:self-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
          {['all', 'generated', 'healed', 'execution'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === tab
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : 'bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-800'
              }`}
            >
              {tab === 'all' ? 'All Activity' : `${tab}s`}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-2 shadow-sm">
          <BookOpen className="h-10 w-10 mx-auto text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No records found</p>
          <p className="text-xs text-slate-600">
            {filter === 'all'
              ? 'Generate a test or run a healing analysis to populate your library.'
              : `No activity found under the "${filter}" category.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition-all flex flex-col justify-between space-y-3 shadow-sm"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 ${
                      item.type === 'generated'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : item.type === 'healed'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {item.type === 'generated' && <Sparkles className="h-3 w-3" />}
                    {item.type === 'healed' && <ShieldAlert className="h-3 w-3" />}
                    {item.type === 'execution' && <Terminal className="h-3 w-3" />}
                    {item.type}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">{item.timestamp}</span>
                </div>

                <h3 className="text-sm font-semibold text-slate-800 line-clamp-1">{item.title}</h3>

                {/* Sub details */}
                {item.url && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1 font-mono">{item.url}</p>
                )}

                {item.healedLocator && (
                  <div className="mt-2 p-2 bg-slate-100 rounded-lg text-xs font-mono border border-slate-200 space-y-1">
                    <p className="text-rose-400/80 line-through text-[11px]">Old: {item.failedLocator}</p>
                    <p className="text-emerald-400 font-semibold text-[11px]">New: {item.healedLocator}</p>
                  </div>
                )}

                {item.output && (
                  <p className="mt-2 text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded-lg border border-slate-200 line-clamp-2">
                    {item.output}
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.code && (
                    <>
                      <button
                        onClick={() => handleCopy(item.id, item.code)}
                        className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 p-1"
                        title="Copy Code"
                      >
                        {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDownload(item)}
                        className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 p-1"
                        title="Download .java file"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onSendToRunner(item.code, item.className || 'SampleTest')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 p-1 font-medium"
                        title="Send to Runner"
                      >
                        <Play className="h-3 w-3" />
                        <span>Run</span>
                      </button>
                    </>
                  )}

                  {item.healedLocator && (
                    <button
                      onClick={() => handleCopy(item.id, item.healedLocator)}
                      className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 p-1"
                      title="Copy Locator"
                    >
                      {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                  title="Delete item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
