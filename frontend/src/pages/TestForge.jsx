import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Rocket, Sparkles, Play, Copy, Check, Download, Plus, Trash2, Globe, FileCode2, Activity, ExternalLink } from 'lucide-react';
import { forgeApi } from '../api/client';

const ACTIONS = ['GOTO', 'CLICK', 'TYPE', 'ASSERT_TITLE_CONTAINS', 'ASSERT_TEXT_PRESENT', 'WAIT_SECONDS', 'SCREENSHOT'];

const LOGIN_TEMPLATE = [
  { action: 'GOTO', selector: '', value: 'https://example.com/login' },
  { action: 'TYPE', selector: '#username', value: 'testuser' },
  { action: 'TYPE', selector: '#password', value: 'Pass@123' },
  { action: 'CLICK', selector: 'button[type=submit]', value: '' },
  { action: 'ASSERT_TEXT_PRESENT', selector: 'body', value: 'Dashboard' },
  { action: 'SCREENSHOT', selector: '', value: '' },
];

const SMOKE_TEMPLATE = [
  { action: 'GOTO', selector: '', value: 'https://example.com' },
  { action: 'ASSERT_TITLE_CONTAINS', selector: '', value: 'Example' },
  { action: 'SCREENSHOT', selector: '', value: '' },
];

export const TestForge = () => {
  const [mode, setMode] = useState('smart'); // smart = zero-knowledge, manual = steps
  const [testName, setTestName] = useState('ForgeLoginTest');
  const [url, setUrl] = useState('https://example.com');
  const [requirements, setRequirements] = useState('Open the login page, sign in with testuser / Pass@123, and verify the dashboard welcomes the user.');
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [flowText, setFlowText] = useState('open https://www.saucedemo.com\ntype "standard_user" in Username\ntype "secret_sauce" in Password\nclick "Login"\nverify "Products"\nscreenshot');
  const [parsed, setParsed] = useState(null);
  const [steps, setSteps] = useState(LOGIN_TEMPLATE);
  const [code, setCode] = useState('// Click "Generate Code" — AI likhega Selenium TestNG code\n// ya "Run Test" dabao — headless browser khud test chalayega.');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);
  const navigate = useNavigate();

  // 401/403 on these endpoints always means dead session (backend restart
  // wipes H2) — guide back to login instead of cryptic axios message.
  const sessionDead = (e) => e.response && (e.response.status === 401 || e.response.status === 403);

  const payload = () => ({ testName, url, requirements, browser: 'chrome-headless', steps });

  // Zero-knowledge run: sirf URL + ID + password + requirement — selector ki jarurat nahi
  const handleSmartRun = async () => {
    if (!url.startsWith('http')) {
      setRun({ status: 'ERROR', logs: 'Application URL http(s) se start hona chahiye.' });
      return;
    }
    if (!loginId.trim() || !loginPass) {
      setRun({ status: 'ERROR', logs: 'Login ID aur password dono likho — AI khud field dhundh lega.' });
      return;
    }
    setRunning(true);
    setRun(null);
    try {
      const res = await forgeApi.smartLogin({ testName, url, username: loginId.trim(), password: loginPass, requirements });
      const runId = res.data.runId;
      setRun({ id: runId, status: 'RUNNING' });
      startPolling(runId);
    } catch (e) {
      if (sessionDead(e)) {
        setRun({ status: 'ERROR', logs: 'Session expired — logout karke dobara Register/Login karo. Login page pe le ja rahe hai…' });
        setTimeout(() => navigate('/login'), 1800);
      } else {
        setRun({ status: 'ERROR', logs: e.response?.data?.message || e.message });
      }
      setRunning(false);
    }
  };

  const startPolling = (runId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const st = await forgeApi.status(runId);
        setRun(st.data);
        if (st.data.status === 'PASSED' || st.data.status === 'FAILED') {
          clearInterval(pollRef.current);
          setRunning(false);
        }
      } catch {
        clearInterval(pollRef.current);
        setRunning(false);
      }
    }, 3000);
  };

  // Smart Flow: koi bhi testing, plain-words steps
  const handleParse = async () => {
    try {
      const res = await forgeApi.parse(flowText);
      setParsed(res.data.steps || []);
    } catch (e) {
      setParsed(null);
    }
  };

  const handleFlowRun = async () => {
    if (!url.startsWith('http')) {
      setRun({ status: 'ERROR', logs: 'Application URL http(s) se start hona chahiye.' });
      return;
    }
    if (!flowText.trim()) {
      setRun({ status: 'ERROR', logs: 'Steps likho — kya karna hai, line by line.' });
      return;
    }
    setRunning(true);
    setRun(null);
    try {
      const res = await forgeApi.smartRun({ testName, url, instructions: flowText });
      const runId = res.data.runId;
      setRun({ id: runId, status: 'RUNNING' });
      startPolling(runId);
    } catch (e) {
      if (sessionDead(e)) {
        setRun({ status: 'ERROR', logs: 'Session expired — logout karke dobara Register/Login karo. Login page pe le ja rahe hai…' });
        setTimeout(() => navigate('/login'), 1800);
      } else {
        setRun({ status: 'ERROR', logs: e.response?.data?.message || e.message });
      }
      setRunning(false);
    }
  };

  const updateStep = (i, k, v) => setSteps((s) => s.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const addStep = () => setSteps((s) => [...s, { action: 'CLICK', selector: '', value: '' }]);
  const removeStep = (i) => setSteps((s) => s.filter((_, j) => j !== i));

  // Instant validation — galat step API tak pahuche usse pehle pakdo,
  // taaki 16-second timeout wait na karna pade.
  const validateSteps = () => {
    if (!url.startsWith('http')) return 'Application URL http(s) se start hona chahiye.';
    if (steps.length === 0) return 'Kam se kam ek step add karo (GOTO).';
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const n = `Step ${i + 1} (${s.action}): `;
      if (s.action === 'GOTO' && !s.value.startsWith('http')) return n + 'URL likho, jaise https://site.com/login';
      if ((s.action === 'CLICK' || s.action === 'TYPE') && !s.selector.trim()) return n + 'CSS selector khaali hai.';
      if (s.action === 'TYPE' && !s.value) return n + 'type karne wala text likho.';
      if (s.action === 'ASSERT_TITLE_CONTAINS' && !s.value.trim()) return n + 'expected title text likho.';
      if (s.action === 'ASSERT_TEXT_PRESENT' && (!s.selector.trim() || !s.value.trim())) return n + 'selector + expected text dono likho.';
      if (s.action === 'WAIT_SECONDS' && !/^\d+$/.test((s.value || '').trim())) return n + 'seconds me number likho.';
      if ((s.action === 'CLICK' || s.action === 'TYPE') && !/^[#.\[]|^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s.selector.trim()))
        return n + `'${s.selector}' valid CSS selector nahi lag raha — #id, .class ya [name=x] use karo.`;
    }
    return null;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await forgeApi.generate(payload());
      setCode(res.data.code || '// no code returned');
    } catch (e) {
      if (sessionDead(e)) {
        setCode('// Session expired (backend restart karta hai to login wipe ho jata hai).\n// Logout karke dobara Register/Login karo, phir Generate dabao.');
        setTimeout(() => navigate('/login'), 1500);
      } else {
        setCode('// Generate failed: ' + (e.response?.data?.message || e.message));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRun = async () => {
    if (mode === 'smart') return handleSmartRun();
    if (mode === 'flow') return handleFlowRun();
    const err = validateSteps();
    if (err) {
      setRun({ status: 'ERROR', logs: err });
      return;
    }
    setRunning(true);
    setRun(null);
    try {
      const res = await forgeApi.run(payload());
      const runId = res.data.runId;
      setRun({ id: runId, status: 'RUNNING' });
      startPolling(runId);
    } catch (e) {
      if (sessionDead(e)) {
        setRun({ status: 'ERROR', logs: 'Session expired — logout karke dobara Register/Login karo (pehla user auto-admin banta hai). Login page pe le ja rahe hai…' });
        setTimeout(() => navigate('/login'), 1800);
      } else {
        setRun({ status: 'ERROR', logs: e.response?.data?.message || e.message });
      }
      setRunning(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/x-java' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${testName.replace(/[^A-Za-z0-9_]/g, '') || 'ForgeTest'}.java`;
    a.click();
  };

  const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all';
  const labelCls = 'block text-[11px] font-bold text-slate-600 uppercase tracking-[0.14em] mb-1.5';

  return (
    <div className="p-8 pt-4 max-w-7xl mx-auto space-y-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-600 p-7 shadow-glow-lg">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/25 blur-[90px]" />
        <div className="relative flex items-center gap-4">
          <span className="p-3 rounded-2xl bg-white/15 border border-white/25"><Rocket className="w-6 h-6 text-white" /></span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">AI Test Forge — bina code likhe testing</h1>
            <p className="mt-1 text-sm text-sky-50/90">URL + requirement batao → AI Selenium code dega, ya headless browser test khud chala dega.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: requirement + steps */}
        <div className="bg-white/85 border border-slate-200 rounded-2xl shadow-card p-6 space-y-4">
          {/* Mode tabs */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setMode('smart')}
              className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${mode === 'smart' ? 'bg-white text-slate-900 shadow-glow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Smart Login
            </button>
            <button
              onClick={() => setMode('flow')}
              className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${mode === 'flow' ? 'bg-white text-slate-900 shadow-glow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Smart Flow — koi bhi test
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${mode === 'manual' ? 'bg-white text-slate-900 shadow-glow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Manual + Code
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Test name</label><input value={testName} onChange={(e) => setTestName(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Browser</label><input value="Headless Chrome" disabled className={inputCls + ' opacity-70'} /></div>
          </div>
          <div>
            <label className={labelCls}>Application URL *</label>
            <div className="relative">
              <Globe className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/login" className={inputCls + ' pl-10'} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Requirement — plain words me batao kya test karna hai</label>
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder='Jaise: login karke "Dashboard" text verify karo' />
          </div>

          {mode === 'smart' ? (
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-violet-50 p-4 space-y-3">
              <p className="text-xs font-bold text-sky-700">AI khud login form dhundhega — username field, password field, submit button. Koi selector nahi chahiye.</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Login ID / Username *</label><input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="Vansh_Mittal" className={inputCls} /></div>
                <div><label className={labelCls}>Password *</label><input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="••••••••" className={inputCls} /></div>
              </div>
              <button onClick={handleSmartRun} disabled={running} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-glow disabled:opacity-50 transition-all">
                <Play className="w-4 h-4" />{running ? 'Testing chal rahi…' : 'Login & Test Karo'}
              </button>
              <p className="text-[11px] text-slate-400">Tip: requirement me <span className="font-mono">"quotes"</span> me likha text verify hota hai — jaise verify the "Dashboard" page.</p>
            </div>
          ) : mode === 'flow' ? (
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-sky-50 p-4 space-y-3">
              <p className="text-xs font-bold text-violet-700">Koi bhi testing — steps plain words me likho, AI button/field/text khud dhundhega. Selector bilkul nahi chahiye.</p>
              <div>
                <label className={labelCls}>Steps — ek line me ek kaam</label>
                <textarea value={flowText} onChange={(e) => setFlowText(e.target.value)} rows={7} className={inputCls + ' resize-none font-mono text-[13px]'} placeholder={'open https://site.com\ntype "alex" in Username\nclick "Sign in"\nverify "Dashboard"'} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleParse} className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 transition-all">
                  Check — AI ne kya samjha?
                </button>
                <button onClick={handleFlowRun} disabled={running} className="flex-[2] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 shadow-glow disabled:opacity-50 transition-all">
                  <Play className="w-4 h-4" />{running ? 'Testing chal rahi…' : 'Flow Chalao'}
                </button>
              </div>
              {parsed && (
                <div className="flex flex-wrap gap-1.5">
                  {parsed.map((p, i) => (
                    <span key={i} title={p.raw} className={`text-[10px] font-mono px-2 py-1 rounded-lg border ${p.understood ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                      {i + 1}. {p.understood ? `${p.action} ✓` : `?? ${p.raw}`}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Chalega: <span className="font-mono">open / click / type / fill / select / check / verify / wait / screenshot / scroll</span> —
                jaise <span className="font-mono">type "demo" in Search</span>, <span className="font-mono">click "Add to cart"</span>, <span className="font-mono">verify "Thank you"</span>.
              </p>
            </div>
          ) : (
          <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>Steps (code + run dono isi se bante hai)</label>
              <div className="flex gap-2">
                <button onClick={() => setSteps(LOGIN_TEMPLATE)} className="text-[11px] font-bold text-sky-600 hover:text-sky-500">Login template</button>
                <button onClick={() => setSteps(SMOKE_TEMPLATE)} className="text-[11px] font-bold text-violet-600 hover:text-violet-500">Smoke template</button>
              </div>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="grid grid-cols-[130px_1fr_1fr_36px] gap-2 items-center">
                  <select value={s.action} onChange={(e) => updateStep(i, 'action', e.target.value)} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
                    {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <input value={s.selector} onChange={(e) => updateStep(i, 'selector', e.target.value)} placeholder="CSS selector" className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  <input value={s.value} onChange={(e) => updateStep(i, 'value', e.target.value)} placeholder="value / expected" className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  <button onClick={() => removeStep(i)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-500"><Plus className="w-3.5 h-3.5" /> Add step</button>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              Selector nahi pata? Site kholo → field pe right-click → <b>Inspect</b> → element pe right-click → <b>Copy → Copy selector</b>, yaha paste karo.
              Type karne ke liye action <b>TYPE</b> rakho (CLICK nahi), selector jaise <span className="font-mono">#username</span>, <span className="font-mono">#password</span>.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleGenerate} disabled={generating} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 shadow-glow disabled:opacity-50 transition-all">
              <Sparkles className="w-4 h-4" />{generating ? 'Writing code…' : 'Generate Code'}
            </button>
            <button onClick={handleRun} disabled={running} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-glow disabled:opacity-50 transition-all">
              <Play className="w-4 h-4" />{running ? 'Running…' : 'Run Test Now'}
            </button>
          </div>
          </>
          )}
        </div>

        {/* Right: code + result */}
        <div className="space-y-6">
          <div className="bg-white/85 border border-slate-200 rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider"><FileCode2 className="w-4 h-4 text-violet-500" /> Generated Selenium code</span>
              <div className="flex gap-2">
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-700 transition-all">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 transition-all">
                  <Download className="w-3.5 h-3.5" />.java
                </button>
              </div>
            </div>
            <Editor height="380px" language="java" theme="vs-dark" value={code} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12.5, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12 } }} />
          </div>

          <div className="bg-white/85 border border-slate-200 rounded-2xl shadow-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-800">Live run result</h3>
              {run && (
                <span className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                  run.status === 'PASSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  run.status === 'FAILED' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                  run.status === 'ERROR' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                  'bg-sky-50 text-sky-700 border-sky-200 animate-pulse-soft'
                }`}>{run.status}</span>
              )}
            </div>
            {!run ? (
              <p className="text-xs text-slate-400 italic">Run dabao — headless Chrome test chalayega, result yahi aayega + Dashboard me save hoga.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {run.executionTime != null && <p className="text-slate-500 font-mono">Duration: {run.executionTime} ms</p>}
                {run.logs && <pre className="max-h-44 overflow-y-auto bg-slate-900 text-emerald-300 font-mono text-[11px] p-3 rounded-xl whitespace-pre-wrap">{run.logs}</pre>}
                {run.screenshotUrl && (
                  <a href={run.screenshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-sky-600 hover:text-sky-500">
                    View screenshot <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
