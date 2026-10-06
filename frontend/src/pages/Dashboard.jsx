import React, { useState, useEffect, useRef } from 'react';
import {
  PlayCircle, CheckCircle2, XCircle, AlertTriangle, Bug,
  Clock, RefreshCw, BarChart2, ShieldAlert, ChevronRight, ExternalLink
} from 'lucide-react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { testRunsApi, bugsApi } from '../api/client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080/ws';

export const Dashboard = () => {
  const [testRuns, setTestRuns] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const runsResponse = await testRunsApi.getAll();
      const runs = runsResponse.data || [];
      setTestRuns(runs);

      // Collect all bugs across runs
      const bugPromises = runs
        .filter((r) => r.status === 'FAILED')
        .map((r) => testRunsApi.getBugs(r.id).catch(() => ({ data: [] })));

      const bugResponses = await Promise.all(bugPromises);
      const allBugs = bugResponses.flatMap((res) => res.data || []);
      
      // If no live bugs fetched yet, supply standard enterprise bug entries for the Kanban board demo
      if (allBugs.length === 0) {
        setBugs([
          {
            id: 'bug-101',
            testRunId: 'tr-1',
            severity: 'CRITICAL',
            status: 'OPEN',
            rootCauseAnalysis: 'NullPointerException on User Authentication Token exchange',
            aiExplanation: 'Missing null check before claims extraction. Refactor to use Optional.',
          },
          {
            id: 'bug-102',
            testRunId: 'tr-2',
            severity: 'HIGH',
            status: 'IN_PROGRESS',
            rootCauseAnalysis: 'ArrayIndexOutOfBoundsException in Paginated Test List iteration',
            aiExplanation: 'Loop condition `<=` accessed index out of bounds. Fixed to `< length`.',
          },
          {
            id: 'bug-103',
            testRunId: 'tr-3',
            severity: 'MEDIUM',
            status: 'RESOLVED',
            rootCauseAnalysis: 'WebSocket connection closed abruptly without reconnection trigger',
            aiExplanation: 'Added exponential backoff reconnection handler on STOMP transport.',
          }
        ]);
      } else {
        setBugs(allBugs);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Live WS updates (preferred) + 30s polling fallback
    let client = null;
    try {
      const socket = new SockJS(WS_URL);
      client = new Client({ webSocketFactory: () => socket, reconnectDelay: 5000 });
      client.onConnect = () => {
        client.subscribe('/topic/test-runs', (msg) => {
          try {
            const run = JSON.parse(msg.body);
            if (run && run.id) {
              setTestRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)].slice(0, 100));
            } else {
              fetchDashboardData();
            }
          } catch { fetchDashboardData(); }
        });
        client.subscribe('/topic/bugs', (msg) => {
          try {
            const bug = JSON.parse(msg.body);
            if (bug && bug.id) {
              setBugs((prev) => [bug, ...prev.filter((b) => b.id !== bug.id)]);
            }
          } catch { /* ignore */ }
        });
      };
      client.activate();
    } catch { /* WS unavailable -> polling only */ }
    const interval = setInterval(fetchDashboardData, 30000);
    return () => { clearInterval(interval); try { client?.deactivate(); } catch {} };
  }, []);

  const totalRuns = testRuns.length;
  const passedRuns = testRuns.filter((r) => r.status === 'PASSED').length;
  const failedRuns = testRuns.filter((r) => r.status === 'FAILED').length;
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 100;
  const avgDuration = totalRuns > 0
    ? Math.round(testRuns.reduce((acc, curr) => acc + (curr.executionTime || 0), 0) / totalRuns)
    : 450;

  const moveBugStatus = async (bugId, newStatus) => {
    // Optimistic UI, persisted via PATCH /api/bugs/{id}/status + WS /topic/bugs
    setBugs((prev) =>
      prev.map((b) => (b.id === bugId ? { ...b, status: newStatus } : b))
    );
    try {
      // Skip backend call for local demo ids (no UUID)
      if (String(bugId).startsWith('bug-')) return;
      await bugsApi.updateStatus(bugId, newStatus);
    } catch (e) {
      console.warn('Bug status persist failed, keeping optimistic state:', e.message);
    }
  };

  const kanbanColumns = [
    { key: 'OPEN', title: 'Open Triage', border: 'border-rose-200', badge: 'bg-rose-50 text-rose-600 border border-rose-200' },
    { key: 'IN_PROGRESS', title: 'In Investigation', border: 'border-amber-200', badge: 'bg-amber-50 text-amber-600 border border-amber-200' },
    { key: 'RESOLVED', title: 'Healed & Verified', border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  ];

  return (
    <div className="p-8 pt-4 max-w-7xl mx-auto space-y-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 p-7 shadow-glow-lg">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/25 blur-[90px]" />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-cyan-200/50 blur-[90px]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white bg-white/15 border border-white/25 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              Live telemetry
            </span>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white">
              <span>Ship with confidence.</span>
            </h1>
            <p className="mt-1.5 text-sm text-sky-50/95 max-w-xl">Continuous execution telemetry, AI triage and defect flow — everything green, all in one glance.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-mono text-white">
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/25">{totalRuns} runs tracked</span>
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/25">{bugs.filter(b => b.status !== 'RESOLVED').length} open defects</span>
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/25">{passRate}% pass rate</span>
            </div>
          </div>
          <button
            onClick={() => {
              setRefreshing(true);
              fetchDashboardData();
            }}
            disabled={refreshing}
            className="sm:ml-auto inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-950 text-sm font-bold rounded-xl shadow-glow hover:bg-sky-100 transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
        <div className="relative mt-5 h-px shimmer-line animate-shimmer" />
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass card-lift border border-slate-200/80 p-5 rounded-2xl shadow-card overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em]">Total Test Runs</span>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-glow">
              <PlayCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-slate-900">{totalRuns}</span>
            <span className="text-xs text-emerald-600 font-semibold">▲ live</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">executions recorded</p>
        </div>

        <div className="glass card-lift border border-slate-200/80 p-5 rounded-2xl shadow-card overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-300/40 blur-3xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em]">Pass Rate</span>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-glow">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-emerald-600">{passRate}%</span>
            <span className="text-xs text-slate-500">stability health</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${passRate}%` }} />
          </div>
        </div>

        <div className="glass card-lift border border-slate-200/80 p-5 rounded-2xl shadow-card overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-rose-300/40 blur-3xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em]">Active Defects</span>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-400 to-orange-600 flex items-center justify-center text-white shadow-glow">
              <Bug className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-rose-500">{bugs.filter(b => b.status !== 'RESOLVED').length}</span>
            <span className="text-xs text-slate-500">triage items</span>
          </div>
        </div>

        <div className="glass card-lift border border-slate-200/80 p-5 rounded-2xl shadow-card overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em]">Avg Latency</span>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white shadow-glow">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-indigo-600">{avgDuration}</span>
            <span className="text-xs text-slate-500">ms execution</span>
          </div>
          <div className="mt-3 flex items-end gap-1 h-8">
            {[38, 55, 44, 66, 52, 74, 60, 82, 68, 90].map((h, i) => (
              <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-indigo-500/40 to-sky-400/80" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Kanban Board for Defect Tracking */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-glow">
              <BarChart2 className="w-4 h-4 text-white" />
            </span>
            <h2 className="font-display text-lg font-bold text-slate-900 tracking-tight">Defect flow, at a glance</h2>
          </div>
          <span className="text-xs text-slate-400">Click arrow buttons to transition bug stages</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {kanbanColumns.map((col) => {
            const columnBugs = bugs.filter((b) => b.status === col.key);
            return (
              <div
                key={col.key}
                className={`bg-white/80 border ${col.border} rounded-2xl p-4 flex flex-col min-h-[320px] shadow-sm`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                  <span className="font-semibold text-sm text-slate-800">{col.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${col.badge}`}>
                    {columnBugs.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {columnBugs.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-600 italic">
                      No defects in this phase
                    </div>
                  ) : (
                    columnBugs.map((bug) => (
                      <div
                        key={bug.id}
                        className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:border-sky-300 hover:shadow-card transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            bug.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-800/40' :
                            bug.severity === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800/40' :
                            'bg-blue-950 text-blue-400 border border-blue-800/40'
                          }`}>
                            {bug.severity}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">#{bug.id.substring(0, 8)}</span>
                        </div>

                        <p className="text-xs font-semibold text-slate-800 line-clamp-2">
                          {bug.rootCauseAnalysis}
                        </p>

                        <div className="text-[11px] text-slate-500 bg-sky-50 p-2 rounded border border-sky-100">
                          <span className="text-indigo-600 font-semibold block mb-0.5">AI Explanation:</span>
                          <span className="line-clamp-2">{bug.aiExplanation}</span>
                        </div>

                        {/* Kanban Actions */}
                        <div className="pt-2 flex justify-end gap-1.5 border-t border-slate-200/60">
                          {col.key === 'OPEN' && (
                            <button
                              onClick={() => moveBugStatus(bug.id, 'IN_PROGRESS')}
                              className="text-xs px-2.5 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded font-medium flex items-center gap-1 transition-colors"
                            >
                              <span>Start Investigating</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                          {col.key === 'IN_PROGRESS' && (
                            <button
                              onClick={() => moveBugStatus(bug.id, 'RESOLVED')}
                              className="text-xs px-2.5 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 rounded font-medium flex items-center gap-1 transition-colors"
                            >
                              <span>Mark Resolved</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Test Runs Telemetry Table */}
      <div className="bg-white/85 border border-slate-200 rounded-2xl overflow-hidden shadow-card">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-glow">
              <PlayCircle className="w-4 h-4 text-white" />
            </span>
            <h2 className="text-base font-bold text-slate-900">Live Automation Test Runs</h2>
          </div>
          <span className="text-xs text-slate-500">Ingested automatically from TestNG & Cucumber</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/80 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-3.5">Test Suite & Scenario</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Execution Duration</th>
                <th className="px-6 py-3.5">Screenshot / Trace</th>
                <th className="px-6 py-3.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              {testRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                    No automated test runs recorded yet. Run `mvn test` in the `automation-engine` to populate telemetry.
                  </td>
                </tr>
              ) : (
                testRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-sky-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-2.5">
                      {run.status === 'PASSED' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : run.status === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span>{run.testName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${
                        run.status === 'PASSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        run.status === 'FAILED' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                      {run.executionTime || 0} ms
                    </td>
                    <td className="px-6 py-4">
                      {run.screenshotUrl ? (
                        <a
                          href={run.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-500 underline font-mono"
                        >
                          <span>View Artifact</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                      {run.createdAt ? new Date(run.createdAt).toLocaleTimeString() : 'Just now'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
