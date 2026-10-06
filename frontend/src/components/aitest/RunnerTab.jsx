import React, { useState } from 'react';
import { Terminal, Play, RotateCcw, AlertCircle, CheckCircle, CheckCircle2, Check, Copy, Loader2, Code2, Trash2, GitPullRequest, Sparkles } from 'lucide-react';
import { executeTestInSandbox, fixBrokenCode } from '../../aitest/aiTestApi';
import PRDiffSection from './PRDiffSection';
import { quickHealJavaCode } from '../../aitest/diffUtils';

const DEFAULT_STARTER_CODE = `public class SimpleTest {
    public static void main(String[] args) {
        System.out.println("Executing Autonomous Sandbox Test Runner...");
        System.out.println("Checking assertions and runtime components...");
        boolean condition = (2 + 2 == 4);
        if (condition) {
            System.out.println("[SUCCESS] Assertions validated!");
        } else {
            System.out.println("[FAILURE] Assertion failed!");
        }
    }
}`;

const CODE_TEMPLATES = [
  {
    name: 'Sanity Check',
    className: 'SimpleTest',
    code: DEFAULT_STARTER_CODE
  },
  {
    name: 'Selenium Mock Test',
    className: 'LoginSmokeTest',
    code: `public class LoginSmokeTest {
    public static void main(String[] args) {
        System.out.println("Starting LoginSmokeTest execution...");
        System.out.println("Target: https://practicetestautomation.com/practice-test-login/");
        System.out.println("Step 1: Navigate to target URL");
        System.out.println("Step 2: Locate username & password inputs");
        System.out.println("Step 3: Submit credentials and verify response code");
        System.out.println("[PASS] LoginSmokeTest finished with status 0 (Success)");
    }
}`
  },
  {
    name: 'Dropdown Selection Test',
    className: 'DropdownTest',
    code: `import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.Select;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class DropdownTest {
    private WebDriver driver;

    @BeforeEach
    public void setup() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--no-sandbox", "--disable-gpu");
        driver = new ChromeDriver(options);
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
    }

    @AfterEach
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    public void testDropdownSelection() {
        driver.get("https://the-internet.herokuapp.com/dropdown");
        Select select = new Select(driver.findElement(By.id("dropdown")));
        select.selectByVisibleText("Option 2");
        assertEquals("Option 2", select.getFirstSelectedOption().getText());
    }
}`
  },
  {
    name: 'JUnit 5 Selenium Test',
    className: 'HeadlessChromeTest',
    code: `import org.junit.jupiter.api.*;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import static org.junit.jupiter.api.Assertions.*;

public class HeadlessChromeTest {
    private WebDriver driver;

    @BeforeEach
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--no-sandbox", "--disable-gpu");
        driver = new ChromeDriver(options);
    }

    @Test
    public void testPageTitle() {
        driver.get("https://example.com");
        String title = driver.getTitle();
        System.out.println("Page title retrieved: " + title);
        assertTrue(title.contains("Example"), "Title should contain 'Example'");
    }

    @AfterEach
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}`
  },
  {
    name: 'Syntax Error Test (Compiler Test)',
    className: 'ErrorTest',
    code: `public class ErrorTest {
    public static void main(String[] args) {
        // Intentionally invalid syntax to test compiler error diagnostics
        int broken = "this is not an integer";
    }
}`
  }
];

export default function RunnerTab({ codeFromGenerator, classNameFromGenerator, onSaveTest }) {
  const [className, setClassName] = useState(() => {
    if (classNameFromGenerator) return classNameFromGenerator;
    if (codeFromGenerator) {
      const match = codeFromGenerator.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      if (match) return match[1];
    }
    return 'SimpleTest';
  });

  const [javaCode, setJavaCode] = useState(() => codeFromGenerator || DEFAULT_STARTER_CODE);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState(() => {
    if (codeFromGenerator) {
      return [{
        type: 'info',
        text: `[LOADED] Ingested generated test code for class "${classNameFromGenerator || 'SimpleTest'}"`,
        time: new Date().toLocaleTimeString()
      }];
    }
    return [];
  });
  const [lastResult, setLastResult] = useState(null);

  // PR Diff Review & Auto-Repair State
  const [fixedProgram, setFixedProgram] = useState('');
  const [brokenSnapshot, setBrokenSnapshot] = useState('');
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [errorDiagnosed, setErrorDiagnosed] = useState('');
  const [successCopied, setSuccessCopied] = useState(false);

  const handleCopyCurrentCode = () => {
    navigator.clipboard.writeText(javaCode);
    setSuccessCopied(true);
    setTimeout(() => setSuccessCopied(false), 2000);
  };

  const triggerAutoRepair = async (codeToFix, classToFix, errMsg) => {
    setBrokenSnapshot(codeToFix);
    setErrorDiagnosed(errMsg);
    setShowDiffPanel(true);
    setIsFixing(true);

    setLogs((prev) => [
      ...prev,
      {
        type: 'info',
        text: `[AI AUTO-HEAL] Execution error detected. Synthesizing repaired program and generating Pull Request diff...`,
        time: new Date().toLocaleTimeString()
      }
    ]);

    try {
      // 1. Call backend fix API
      const res = await fixBrokenCode(codeToFix, errMsg);
      let repaired = '';
      if (res.success && res.fixedCode && res.fixedCode.trim().length > 0) {
        repaired = res.fixedCode.trim();
        if (repaired.startsWith('```java')) {
          repaired = repaired.replace(/^```java\n?/, '').replace(/```$/, '').trim();
        } else if (repaired.startsWith('```')) {
          repaired = repaired.replace(/^```\n?/, '').replace(/```$/, '').trim();
        }
      } else {
        // Fallback to client-side heuristic healer
        repaired = quickHealJavaCode(codeToFix, errMsg);
      }

      setFixedProgram(repaired);
      if (repaired.replace(/\s+/g, '') === codeToFix.replace(/\s+/g, '')) {
        setLogs((prev) => [
          ...prev,
          {
            type: 'error',
            text: `[AUTO-HEAL STALLED] Repair attempt returned identical code — the error needs a manual fix (e.g. wrong locator for this page). Edit the highlighted line or correct the selector, then re-run.`,
            time: new Date().toLocaleTimeString()
          }
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          {
            type: 'success',
            text: `[PR READY] Pull Request diff generated! Review additions (green) and deletions (red) in the review panel below.`,
            time: new Date().toLocaleTimeString()
          }
        ]);
      }
    } catch (err) {
      console.error('Error during auto-repair:', err);
      const fallback = quickHealJavaCode(codeToFix, errMsg);
      setFixedProgram(fallback);
    } finally {
      setIsFixing(false);
    }
  };

  const executeProgram = async (codeToRun, classToRun) => {
    if (!codeToRun.trim() || !classToRun.trim()) {
      setLogs((prev) => [
        ...prev,
        { type: 'error', text: '[ERROR] Class name and Java code are required.', time: new Date().toLocaleTimeString() }
      ]);
      return;
    }

    setIsExecuting(true);
    setLogs((prev) => [
      ...prev,
      { type: 'info', text: `[SANDBOX] Compiling "${classToRun}.java" with JavaCompiler API...`, time: new Date().toLocaleTimeString() }
    ]);

    try {
      const res = await executeTestInSandbox(codeToRun, classToRun.trim());

      const plainText = res.success ? res.result : (res.error || 'Execution failed');
      const responseOk = res.success;
      const lower = plainText.toLowerCase();
      const isFailed = !responseOk
        || lower.includes('compilation failed')
        || lower.includes('execution error')
        || lower.includes('failures:')
        || lower.includes('❌')
        || lower.includes('exception')
        || /failed:\s*[1-9]/.test(lower);

      setLastResult({ success: !isFailed, message: plainText });

      // Format plain text output into Sandbox Terminal console output
      const rawLines = plainText.split(/\r?\n/);
      const formattedLogs = rawLines
        .filter((l) => l.trim().length > 0)
        .map((line) => {
          const lower = line.toLowerCase();
          let type = 'default';
          // Order matters: check success-with-zero-failures BEFORE generic failure keywords,
          // otherwise "Failed: 0" summary lines get painted red on a passing run.
          if (/failed:\s*0\b/.test(lower) && !lower.includes('❌') && !lower.includes('failures:')) {
            type = 'success';
          } else if (
            lower.includes('compilation failed')
            || lower.includes('execution error')
            || lower.includes('failures:')
            || lower.includes('❌')
            || lower.includes('exception')
            || /failed:\s*[1-9]/.test(lower)
          ) {
            type = 'error';
          } else if (lower.includes('warn')) {
            type = 'warning';
          } else if (lower.includes('succeeded') || lower.includes('success') || lower.includes('passed') || lower.includes('assertions validated') || lower.includes('finished with status 0')) {
            type = 'success';
          } else if (lower.includes('[sandbox]') || lower.includes('[loaded]') || lower.includes('compil') || lower.includes('[junit')) {
            type = 'info';
          }

          return {
            type,
            text: line,
            time: new Date().toLocaleTimeString()
          };
        });

      setLogs((prev) => [
        ...prev,
        ...(formattedLogs.length > 0
          ? formattedLogs
          : [{ type: isFailed ? 'error' : 'success', text: plainText, time: new Date().toLocaleTimeString() }])
      ]);

      if (onSaveTest) {
        onSaveTest({
          id: Date.now(),
          type: 'execution',
          title: `Executed: ${classToRun}`,
          className: classToRun,
          status: isFailed ? 'Failed' : 'Success',
          output: plainText,
          timestamp: new Date().toLocaleTimeString()
        });
      }

      // If execution or compilation fails, automatically generate the new program and open side-by-side split panel
      if (isFailed) {
        triggerAutoRepair(codeToRun, classToRun, plainText);
      } else {
        // Success: hide diff panel so "All is Good" panel displays
        setShowDiffPanel(false);
      }
    } catch (err) {
      console.error('Network error during sandbox test execution:', err);
      setLastResult({ success: false, message: err.message });
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          text: `[NETWORK ERROR] ${err.message || 'Failed to connect to backend on port 8080'}`,
          time: new Date().toLocaleTimeString()
        }
      ]);
      triggerAutoRepair(codeToRun, classToRun, err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRun = () => {
    executeProgram(javaCode, className);
  };

  const handleApplyFix = (codeToApply) => {
    if (!codeToApply) return;
    setJavaCode(codeToApply);
    const match = codeToApply.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    if (match) {
      setClassName(match[1]);
    }
    setLogs((prev) => [
      ...prev,
      {
        type: 'success',
        text: `[PR MERGED] Successfully applied AI repair patch into code editor!`,
        time: new Date().toLocaleTimeString()
      }
    ]);
  };

  const handleRunFixed = async (codeToRun) => {
    if (!codeToRun) return;
    setJavaCode(codeToRun);
    let targetClass = className;
    const match = codeToRun.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    if (match) {
      targetClass = match[1];
      setClassName(targetClass);
    }
    setLogs((prev) => [
      ...prev,
      {
        type: 'info',
        text: `[PR RUN] Re-compiling and launching repaired ${targetClass}.java in sandbox...`,
        time: new Date().toLocaleTimeString()
      }
    ]);
    await executeProgram(codeToRun, targetClass);
  };

  const handleSelectTemplate = (template) => {
    setClassName(template.className);
    setJavaCode(template.code);
    setShowDiffPanel(false);
    setFixedProgram('');
  };

  const handleClearLogs = () => {
    setLogs([]);
    setLastResult(null);
  };

  const handleResetCode = () => {
    setClassName('SimpleTest');
    setJavaCode(DEFAULT_STARTER_CODE);
    setShowDiffPanel(false);
    setFixedProgram('');
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-400" />
              In-Memory Test Sandbox Runner
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Compiles Java tests on the fly using Java standard <code>JavaCompiler</code> and dynamically executes within an isolated JVM sandbox.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold font-mono">
              Java SE Compiler
            </span>
          </div>
        </div>

        {/* Template Selectors */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Presets:
          </span>
          {CODE_TEMPLATES.map((tmpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectTemplate(tmpl)}
              className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors"
            >
              {tmpl.name}
            </button>
          ))}
          <button
            type="button"
            onClick={handleResetCode}
            className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200 transition-colors flex items-center gap-1 ml-auto"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Editor & Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Editor */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-[520px] shadow-sm">
            {/* Header */}
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">Java Class Name:</span>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  placeholder="ClassName"
                />
                <span className="text-xs text-slate-500 font-mono">.java</span>
              </div>

              <button
                onClick={handleRun}
                disabled={isExecuting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isExecuting ? ' Compiling & Running...' : 'Run in Sandbox'}</span>
              </button>
            </div>

            {/* Code Textarea */}
            <div className="flex-1 bg-slate-950/70 p-4">
              <textarea
                value={javaCode}
                onChange={(e) => setJavaCode(e.target.value)}
                placeholder="public class SampleTest { ... }"
                spellCheck="false"
                className="w-full h-full bg-transparent text-slate-200 font-mono text-xs leading-relaxed outline-none resize-none overflow-auto"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Console Output */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-[520px] shadow-sm">
            {/* Console Bar */}
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-mono text-slate-300">Sandbox Terminal</span>
                {lastResult && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                      lastResult.success
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {lastResult.success ? <CheckCircle className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                    {lastResult.success ? 'Success' : 'Error'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastResult && !lastResult.success && (
                  <button
                    onClick={() => triggerAutoRepair(javaCode, className, lastResult.message)}
                    disabled={isFixing}
                    className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1 transition-all"
                    title="Generate and review AI Auto-Fix Pull Request"
                  >
                    <GitPullRequest className="h-3 w-3 text-purple-400" />
                    <span>{showDiffPanel ? 'Refresh AI PR' : 'View AI PR Diff'}</span>
                  </button>
                )}
                <button
                  onClick={handleClearLogs}
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                  title="Clear console output"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 bg-slate-950/90 p-4 font-mono text-xs overflow-auto space-y-2">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 space-y-2">
                  <Terminal className="h-8 w-8 text-slate-700" />
                  <p className="text-xs">No execution runs yet.</p>
                  <p className="text-[11px] text-slate-600">Click &quot;Run in Sandbox&quot; to compile and launch.</p>
                </div>
              ) : (
                logs.map((log, index) => {
                  let colorClass = 'text-slate-300';
                  if (log.type === 'error') colorClass = 'text-rose-400';
                  else if (log.type === 'success') colorClass = 'text-emerald-300';
                  else if (log.type === 'warning') colorClass = 'text-amber-300/90';
                  else if (log.type === 'info') colorClass = 'text-cyan-400';

                  return (
                    <div key={index} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-600 select-none text-[10px] shrink-0">
                        {log.time}
                      </span>
                      <span className={`${colorClass} break-words whitespace-pre-wrap`}>{log.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SUCCESS SCENARIO: "All is Good" Panel */}
      {lastResult && lastResult.success && !isExecuting && !showDiffPanel && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/20 border border-emerald-500/40 rounded-2xl p-6 shadow-xl backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">All is Good!</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold font-mono">
                    0 Errors
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Your code compiled and executed cleanly in the sandbox with zero errors. You can run or copy this code easily.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={handleCopyCurrentCode}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                {successCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                <span>{successCopied ? 'Code Copied!' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={handleRun}
                disabled={isExecuting}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span>Run in Sandbox</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ERROR SCENARIO: Automatic Side-by-Side Split Panel (Left: Red Errors vs Right: Green Fixes) */}
      {(showDiffPanel || isFixing) && (
        <div id="pr-diff-panel" className="pt-2 animate-in fade-in duration-300">
          <PRDiffSection
            originalCode={brokenSnapshot || javaCode}
            fixedCode={fixedProgram}
            className={className}
            errorMessage={errorDiagnosed}
            isFixing={isFixing}
            onApplyFix={handleApplyFix}
            onRunFixed={handleRunFixed}
            onClose={() => setShowDiffPanel(false)}
          />
        </div>
      )}
    </div>
  );
}
