import React, { useState } from 'react';
import { Sparkles, Globe, Terminal, Copy, Check, Download, Play, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { generateSeleniumTest } from '../../aitest/aiTestApi';

const SAMPLE_PRESETS = [
  {
    title: 'Login Authentication',
    url: 'https://practicetestautomation.com/practice-test-login/',
    instruction: 'Enter username "student" and password "Password123", click Submit button, and verify the successful login message appears.'
  },
  {
    title: 'Form Submission',
    url: 'https://demoqa.com/text-box',
    instruction: 'Fill in Full Name, Email, and Current Address fields, click Submit button, and verify the output display card shows the entered data.'
  },
  {
    title: 'Checkbox Interaction',
    url: 'https://the-internet.herokuapp.com/checkboxes',
    instruction: 'Find the first checkbox, ensure it is selected, verify the second checkbox is already selected, and assert both states.'
  },
  {
    title: 'Dropdown Selection',
    url: 'https://the-internet.herokuapp.com/dropdown',
    instruction: 'Select "Option 2" from the dropdown list and assert that "Option 2" is selected.'
  }
];

export default function GeneratorTab({ onSendToRunner, onSaveTest }) {
  const [url, setUrl] = useState('https://practicetestautomation.com/practice-test-login/');
  const [instruction, setInstruction] = useState('Enter username "student" and password "Password123", click Submit button, and verify the successful login message appears.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handlePresetSelect = (preset) => {
    setUrl(preset.url);
    setInstruction(preset.instruction);
    setError(null);
  };

  const handleGenerate = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim() || !instruction.trim()) {
      setError('Please provide both a target URL and test instruction.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await generateSeleniumTest(url.trim(), instruction.trim());

      if (!res.success) {
        throw new Error(res.error || 'Server responded with an error');
      }

      const plainText = res.code || '';
      let cleanCode = plainText.trim();
      if (cleanCode.startsWith('```java')) {
        cleanCode = cleanCode.replace(/^```java\n?/, '').replace(/```$/, '').trim();
      } else if (cleanCode.startsWith('```')) {
        cleanCode = cleanCode.replace(/^```\n?/, '').replace(/```$/, '').trim();
      }

      setGeneratedCode(cleanCode);

      if (onSaveTest) {
        onSaveTest({
          id: Date.now(),
          type: 'generated',
          title: instruction.slice(0, 45) + (instruction.length > 45 ? '...' : ''),
          url,
          instruction,
          code: cleanCode,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    } catch (err) {
      console.error('Network error during test generation:', err);
      setError(err.message || 'Failed to generate test. Ensure Spring Boot is running on port 8080.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!generatedCode) return;
    // Extract class name or default
    const classMatch = generatedCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    const fileName = classMatch ? `${classMatch[1]}.java` : 'GeneratedSeleniumTest.java';
    
    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  };

  const handleRunInSandbox = () => {
    if (!generatedCode) return;
    const classMatch = generatedCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    const className = classMatch ? classMatch[1] : 'GeneratedSeleniumTest';
    onSendToRunner(generatedCode, className);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              Autonomous Test Generator
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Extracts target webpage DOM via Headless Chrome, feeds structural context to local LLM, and synthesizes JUnit 5 Selenium tests.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-mono">
              Selenium 4
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-mono">
              JUnit 5
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-mono">
              Page Object Model
            </span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Quick Test Presets
          </span>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PRESETS.map((preset, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-600/20 hover:text-indigo-300 text-slate-600 border border-slate-200 hover:border-indigo-500/30 transition-colors flex items-center gap-1.5"
              >
                <span>{preset.title}</span>
                <ArrowRight className="h-3 w-3 text-slate-500" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Input Form & Code Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form */}
        <div className="lg:col-span-5 space-y-4">
          <form onSubmit={handleGenerate} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Test Specifications
            </h2>

            {/* URL Input */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-indigo-400" />
                Target Webpage URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/login"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono text-xs"
              />
            </div>

            {/* Instruction Prompt */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                Test Instructions (Natural Language)
              </label>
              <textarea
                rows={5}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe what actions to take and what elements to assert..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Generation Error</p>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span> Analyzing DOM &amp; Synthesizing Code...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Selenium Test</span>
                </>
              )}
            </button>
          </form>

          {/* Tips Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-2">
            <span className="font-semibold text-slate-800 block">💡 Tips for Best Results:</span>
            <ul className="list-disc pl-4 space-y-1 text-slate-500 text-[11px]">
              <li>Use accessible public URLs or localhost test endpoints.</li>
              <li>Include specific assertion conditions (e.g. "assert welcome banner contains 'Dashboard'").</li>
              <li>Once generated, click "Send to Sandbox Runner" to compile and execute immediately.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Code Viewer Output */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[560px]">
            {/* Code Header Bar */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                </div>
                <span className="text-xs font-mono text-slate-400 ml-2">
                  GeneratedTest.java
                </span>
              </div>

              {/* Actions */}
              {generatedCode && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1"
                    title="Copy Java Code"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    className="p-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1"
                    title="Download .java file"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>

                  <button
                    onClick={handleRunInSandbox}
                    className="px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                    title="Send code to Sandbox Runner"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Run in Sandbox</span>
                  </button>
                </div>
              )}
            </div>

            {/* Code Content Area */}
            <div className="flex-1 p-4 overflow-auto bg-slate-950/60 font-mono text-xs leading-relaxed text-slate-300">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                  <p className="text-sm font-medium text-slate-200">Analyzing DOM &amp; Synthesizing Code...</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Headless Chrome is extracting DOM structure and Ollama is generating your Page Object Model test class.
                  </p>
                </div>
              ) : generatedCode ? (
                <pre className="whitespace-pre overflow-x-auto text-emerald-300/90 font-mono text-xs">
                  {generatedCode}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-slate-500">
                  <Terminal className="h-10 w-10 text-slate-700" />
                  <p className="text-sm font-medium text-slate-400">Ready to synthesize test code</p>
                  <p className="text-xs text-slate-600 max-w-md">
                    Choose a preset or enter any web URL and natural language scenario, then click &quot;Generate Selenium Test&quot;.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
