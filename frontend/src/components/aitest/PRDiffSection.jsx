import React, { useState } from 'react';
import {
  GitPullRequest,
  GitMerge,
  Check,
  Copy,
  Play,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  X,
  FileCode2,
  ArrowRight,
  Loader2,
  Flame,
  Wand2
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <Flame className="h-3.5 w-3.5 text-rose-400" />
                Error Auto-Detected
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
                New Repaired Program Generated
              </span>

              <span className="text-xs text-slate-500 font-mono flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                <span className="text-rose-300 font-medium">{className}.java (broken)</span>
                <ArrowRight className="h-3 w-3 text-slate-500" />
                <span className="text-emerald-300 font-medium">{className}.java (fixed)</span>
              </span>

              {/* Additions / Deletions pills */}
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold">
                <span className="text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/30">
                  -{stats.deletions} removed/altered
                </span>
                <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  +{stats.additions} fixed/added
                </span>
              </div>
            </div>

            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-purple-400" />
              <span>Side-by-Side Pull Request Comparison: Error Diagnosed &amp; Repaired</span>
            </h3>
            <p className="text-xs text-slate-500">
              The left panel highlights the failing code and runtime error in <span className="text-rose-400 font-semibold">Red</span>. The right panel displays the newly synthesized error-free program with fixes highlighted in <span className="text-emerald-400 font-semibold">Green</span>.
            </p>
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
            Synthesizing corrected Java program &amp; generating side-by-side diff...
          </p>
          <p className="text-xs text-slate-500 max-w-md">
            Analyzing compiler diagnostics, repairing broken syntax, and generating resilient JUnit assertions.
          </p>
        </div>
      ) : (
        <div>
          {/* Split Panel Header Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-slate-200 bg-slate-100 font-mono text-xs">
            {/* Left Header */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b lg:border-b-0 lg:border-r border-slate-200 bg-rose-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span className="font-semibold text-rose-300">Original Code with Error</span>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] text-slate-500">{className}.java</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                Errors Highlighted in Red (-)
              </span>
            </div>

            {/* Right Header */}
            <div className="px-4 py-2.5 flex items-center justify-between bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-emerald-300">New Generated Code (Clean)</span>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] text-slate-500">{className}.java</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                Changes Highlighted in Green (+)
              </span>
            </div>
          </div>

          {/* Left Column Diagnostic Error Box (if error exists) */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/30 border-b border-rose-900/40 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 w-full overflow-hidden">
                  <span className="font-semibold text-rose-400 uppercase tracking-wider text-[10px] block">
                    Execution Error Diagnostic:
                  </span>
                  <pre className="font-mono text-[11px] text-rose-200/90 whitespace-pre-wrap leading-relaxed bg-black/30 p-2.5 rounded-lg border border-rose-500/20 overflow-x-auto">
                    {errorMessage}
                  </pre>
                </div>
              </div>
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
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>
                New code is generated and verified with 0 errors. Click <strong className="text-emerald-400">&quot;Run in Sandbox&quot;</strong> to re-run and confirm, or <strong className="text-indigo-300">&quot;Copy Code&quot;</strong>.
              </span>
            </div>

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
