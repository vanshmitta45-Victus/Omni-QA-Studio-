import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Sparkles, Copy, Check, Play, RefreshCw, AlertCircle, CheckCircle, Code2, BookOpen } from 'lucide-react';
import { codeApi } from '../api/client';

export const AiHealingStudio = () => {
  const [language, setLanguage] = useState('java');
  const [originalCode, setOriginalCode] = useState(`public class TestProcessor {
    public void printItems(String[] items) {
        // Bug: Off-by-one ArrayIndexOutOfBoundsException
        for (int i = 0; i <= items.length; i++) {
            System.out.println("Processing: " + items[i]);
        }
    }
}`);
  const [fixedCode, setFixedCode] = useState(`// Corrected code will appear here after AI analysis...`);
  const [context, setContext] = useState('java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3');
  const [explanation, setExplanation] = useState('');
  const [issuesFound, setIssuesFound] = useState([]);
  const [diffSummary, setDiffSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const sampleSnippets = {
    java: {
      offByOne: `public class ArrayTest {
    public void iterate(int[] arr) {
        for (int i = 0; i <= arr.length; i++) {
            System.out.println(arr[i]);
        }
    }
}`,
      stringEquals: `public class AuthValidator {
    public boolean verifyToken(String receivedToken, String expectedToken) {
        // Bug: String comparison with == instead of .equals()
        if (receivedToken == expectedToken) {
            return true;
        }
        return false;
    }
}`,
      nullPointer: `public class UserProfileService {
    public String getCity(User user) {
        // Bug: Potential NullPointerException if address or user is null
        return user.getAddress().getCity().toUpperCase();
    }
}`
    },
    javascript: {
      equality: `function validateAccess(role, targetRole) {
    // Bug: Loose equality allows unexpected type coercion
    if (role == targetRole) {
        return grantAccess();
    }
    return denyAccess();
}`
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await codeApi.analyze({
        code: originalCode,
        language,
        context,
      });

      setFixedCode(response.data.fixedCode || '');
      setExplanation(response.data.explanation || 'Code healed successfully.');
      setIssuesFound(response.data.issuesFound || []);
      setDiffSummary(response.data.diffSummary || '');
    } catch (err) {
      console.error('Code analysis failed:', err);
      setExplanation('Analysis failed. Please verify backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!fixedCode) return;
    navigator.clipboard.writeText(fixedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-violet-500" />
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">AI Code Healing Studio</h1>
          </div>
          <p className="text-sm text-slate-500">
            Automated bug detection, side-by-side refactoring, and beginner-friendly defect explanations
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 font-medium shadow-sm"
          >
            <option value="java">Java 21</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
          </select>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 hover:from-sky-400 hover:to-violet-500 text-white text-sm font-bold rounded-xl shadow-glow disabled:opacity-50 transition-all"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>{loading ? 'Healing Code...' : 'Analyze & Heal Code'}</span>
          </button>
        </div>
      </div>

      {/* Preset Bug Selectors */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="font-semibold text-slate-500 uppercase tracking-wider">Load Sample Defect:</span>
        <button
          onClick={() => {
            setOriginalCode(sampleSnippets.java.offByOne);
            setContext('java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3');
          }}
          className="px-2.5 py-1 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-600 rounded-lg font-mono transition-all shadow-sm"
        >
          Off-By-One Boundary
        </button>
        <button
          onClick={() => {
            setOriginalCode(sampleSnippets.java.stringEquals);
            setContext('AssertionError: Expected true but got false due to reference equality check');
          }}
          className="px-2.5 py-1 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-600 rounded-lg font-mono transition-all shadow-sm"
        >
          String == Bug
        </button>
        <button
          onClick={() => {
            setOriginalCode(sampleSnippets.java.nullPointer);
            setContext('NullPointerException: user.getAddress() returned null during order processing');
          }}
          className="px-2.5 py-1 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-600 rounded-lg font-mono transition-all shadow-sm"
        >
          Null Pointer Guard
        </button>
      </div>

      {/* Split-Pane Monaco Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Pane: Original Buggy Code */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card flex flex-col h-[480px]">
          <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Original Code (Buggy Input)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">Editable</span>
          </div>
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={originalCode}
              onChange={(value) => setOriginalCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>

        {/* Right Pane: Corrected Healed Code with Top-Right Copy Button */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card flex flex-col h-[480px] relative">
          <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-200 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Healed & Refactored Code
              </span>
            </div>

            {/* Prominent One-Click Copy Button */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                copied
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="flex-1 relative">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={fixedCode}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>
      </div>

      {/* Explanation & Issues Found Panel Below */}
      {(explanation || issuesFound.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <BookOpen className="w-5 h-5 text-violet-500" />
            <h3 className="text-base font-bold text-slate-900">AI Diagnostic & Fix Explanation</h3>
          </div>

          {issuesFound.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Detected Code Deficiencies
              </h4>
              <div className="space-y-2">
                {issuesFound.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-700 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {explanation && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Why this happens & How it was solved
              </h4>
              <div className="max-w-none text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed font-sans whitespace-pre-line">
                {explanation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
