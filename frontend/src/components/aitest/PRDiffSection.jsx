import React, { useState } from 'react';
import {
  GitPullRequest,
  GitMerge,
  Check,
  Copy,
  Play,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2
} from 'lucide-react';
import { computeLineDiff } from '../../aitest/diffUtils';

export default function PRDiffSection({
  originalCode,
  fixedCode,
  className = 'Test',
  errorMessage = '',
  isFixing = false,
  onApplyFix,
  onRunFixed,
  onClose
}) {
  const [copied, setCopied] = useState(false);

  // Compute side-by-side split rows with LCS
  const diffResult = React.useMemo(() => {
    if (!originalCode || !fixedCode) {
      return { splitRows: [], stats: { additions: 0, deletions: 0, totalChanges: 0 } };
    }
    return computeLineDiff(originalCode, fixedCode);
  }, [originalCode, fixedCode]);

  const { splitRows, stats } = diffResult;

  // Parse compiler diagnostic line numbers (e.g. "Line 4: ...") so the
  // left panel can highlight the exact failing lines in red even when
  // the diff itself marks them as equal.
  const errorLines = React.useMemo(() => {
    const set = new Set();
    if (!errorMessage) return set;
    const re = /line\s+(\d+)/gi;
    let m;
    while ((m = re.exec(errorMessage)) !== null) {
      set.add(parseInt(m[1], 10));
    }
    return set;
  }, [errorMessage]);

  const handleCopy = () => {
    if (!fixedCode) return;
    navigator.clipboard.writeText(fixedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all">
      {/* Top Banner / PR Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-50 via-white to-indigo-50 border-b border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-purple-400" />
              <span>Code Comparison</span>
              <span className="text-xs font-mono font-semibold">
                <span className="text-rose-500">-{stats.deletions}</span>
                <span className="text-slate-300 mx-1">/</span>
                <span className="text-emerald-600">+{stats.additions}</span>
              </span>
            </h3>
          </div>

          {/* Right Top of Panel: Action Options Toolbar */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
            {/* Option 1: Copy Code (Copy whole code in one go) */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={isFixing || !fixedCode}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              title="Copy the entire newly generated code in one go"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Code Copied!' : 'Copy Code'}</span>
            </button>

            {/* Option 2: Run in Sandbox (Rerun code using sandbox and test again) */}
            <button
              type="button"
              onClick={() => onRunFixed && onRunFixed(fixedCode)}
              disabled={isFixing || !fixedCode}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
              title="Run this code using sandbox to test again if there is error or not"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run in Sandbox</span>
            </button>

            {/* Option 3: Apply to Editor */}
            <button
              type="button"
              onClick={() => onApplyFix && onApplyFix(fixedCode)}
              disabled={isFixing || !fixedCode}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
              title="Apply fixed code into the main editor"
            >
              <GitMerge className="h-3.5 w-3.5" />
              <span>Apply to Editor</span>
            </button>

            {/* Dismiss Button */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ml-1"
                title="Dismiss comparison"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State while AI synthesizes fix */}
      {isFixing ? (
        <div className="p-16 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          <p className="text-sm font-medium text-slate-800">
            Fixing code &amp; building comparison...
          </p>
        </div>
      ) : (
        <div>
          {/* Split Panel Header Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-slate-200 bg-slate-100 font-mono text-xs">
            {/* Left Header */}
            <div className="px-4 py-2 flex items-center gap-2 border-b lg:border-b-0 lg:border-r border-slate-200">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span className="font-semibold text-slate-700">{className}.java</span>
            </div>

            {/* Right Header */}
            <div className="px-4 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-slate-700">{className}.java (fixed)</span>
            </div>
          </div>

          {/* Error Box (if error exists) */}
          {errorMessage && (
            <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100">
              <pre className="font-mono text-[11px] text-rose-600 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {errorMessage}
              </pre>
            </div>
          )}

          {/* Side-by-Side Split View Rows */}
          <div className="max-h-[520px] overflow-auto bg-[#0a0f1d] font-mono text-xs select-text divide-y divide-slate-900/60">
            {splitRows.map((row, idx) => {
              const isLeftDel = row.left.type === 'delete';
              const isRightIns = row.right.type === 'insert';
              const isLeftEmpty = row.left.type === 'empty';
              const isRightEmpty = row.right.type === 'empty';
              // Highlight compiler-reported error lines in red, even if unchanged by the fix
              const isErrorLine = row.left.line != null && errorLines.has(row.left.line);

              const leftBg = (isLeftDel || isErrorLine)
                ? 'bg-rose-950/40 text-rose-200 border-l-4 border-rose-500 font-medium'
                : isLeftEmpty
                ? 'bg-slate-950/40 text-transparent'
                : 'text-slate-400 hover:bg-slate-900/40';

              const rightBg = isRightIns
                ? 'bg-emerald-950/40 text-emerald-200 border-l-4 border-emerald-500 font-medium'
                : isRightEmpty
                ? 'bg-slate-950/40 text-transparent'
                : 'text-slate-400 hover:bg-slate-900/40';

              return (
                <div key={idx} className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80 min-h-[22px] leading-relaxed">
                  {/* Left Column (Original Code) */}
                  <div className={`flex items-stretch overflow-hidden ${leftBg}`}>
                    {/* Line number */}
                    <div className="w-11 text-right pr-2 py-0.5 select-none shrink-0 font-mono text-[11px] text-slate-600 bg-slate-950/70 border-r border-slate-800/60">
                      {row.left.line || ''}
                    </div>
                    {/* Marker */}
                    <div className="w-6 text-center py-0.5 select-none shrink-0 text-rose-400 font-bold">
                      {(isLeftDel || isErrorLine) ? '-' : ' '}
                    </div>
                    {/* Code */}
                    <div className="py-0.5 pr-2 pl-1 flex-1 overflow-x-auto whitespace-pre">
                      {row.left.text}
                    </div>
                  </div>

                  {/* Right Column (New Repaired Code) */}
                  <div className={`flex items-stretch overflow-hidden ${rightBg}`}>
                    {/* Line number */}
                    <div className="w-11 text-right pr-2 py-0.5 select-none shrink-0 font-mono text-[11px] text-slate-600 bg-slate-950/70 border-r border-slate-800/60">
                      {row.right.line || ''}
                    </div>
                    {/* Marker */}
                    <div className="w-6 text-center py-0.5 select-none shrink-0 text-emerald-400 font-bold">
                      {isRightIns ? '+' : ' '}
                    </div>
                    {/* Code */}
                    <div className="py-0.5 pr-2 pl-1 flex-1 overflow-x-auto whitespace-pre">
                      {row.right.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Bar with quick actions */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => onRunFixed && onRunFixed(fixedCode)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Run in Sandbox</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
