package com.omniqa.studio.service;

import org.springframework.stereotype.Service;

/**
 * Rule-based AI bug triage: derives severity + explanation from logs.
 * Called synchronously on test-run ingest; LLM enrichment happens in AiCodeAnalyzerService.
 */
@Service
public class BugTriageService {

    public String triageSeverity(String testName, String logs) {
        String hay = ((testName == null ? "" : testName) + " " + (logs == null ? "" : logs)).toLowerCase();
        if (hay.contains("nullpointer") || hay.contains("security") || hay.contains("auth")
                || hay.contains("critical") || hay.contains("outofmemory")) {
            return "CRITICAL";
        }
        if (hay.contains("arrayindex") || hay.contains("indexoutofbounds") || hay.contains("assertion")
                || hay.contains("failed") || hay.contains("timeout") || hay.contains("exception")) {
            return "HIGH";
        }
        if (hay.contains("warn") || hay.contains("slow") || hay.contains("flaky") || hay.contains("skipped")) {
            return "MEDIUM";
        }
        return "LOW";
    }

    public String triageExplanation(String testName, String severity, String logs) {
        String snippet = logs == null ? "" : logs.length() > 500 ? logs.substring(0, 500) + "..." : logs;
        return "Auto-triaged as " + severity + " for [" + testName + "]. "
                + "Heuristic scan of stack trace suggests developer triage. Logs excerpt: " + snippet;
    }
}
