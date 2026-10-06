package com.omniqa.studio.aitest;

import org.springframework.stereotype.Service;

/**
 * Self-healing locator engine (merged from Autonomous).
 * Prefers Gemini when configured, falls back to local Ollama.
 */
@Service
public class SelfHealingService {

    private final OllamaClient ollama;
    private final GeminiClient gemini;

    public SelfHealingService(OllamaClient ollama, GeminiClient gemini) {
        this.ollama = ollama;
        this.gemini = gemini;
    }

    public String healBrokenLocator(String failedLocator, String currentDomSnippet) {
        String prompt = String.format(
                "You are an automated Self-Healing Selector Engine.\n"
                        + "Broken Locator: %s\n\n"
                        + "Current HTML DOM:\n%s\n\n"
                        + "Instructions:\n"
                        + "Find the element in the DOM that corresponds to the intended element of the broken locator.\n"
                        + "CRITICAL REQUIREMENT: Output EXACTLY ONE line containing ONLY the replacement CSS selector or XPath (for example: #btn-login-submit or //button[@id='btn-login-submit']).\n"
                        + "Do NOT include explanations, greetings, quotes, backticks, or any additional text.",
                failedLocator, currentDomSnippet);
        try {
            String raw;
            if (gemini.isConfigured()) {
                try {
                    raw = gemini.generate(prompt, 0.0);
                } catch (Exception geminiEx) {
                    raw = ollama.generate(prompt, 0.0);
                }
            } else {
                raw = ollama.generate(prompt, 0.0);
            }
            return cleanLocatorString(raw);
        } catch (Exception e) {
            throw new RuntimeException("Self-healing service failed: " + e.getMessage(), e);
        }
    }

    private String cleanLocatorString(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String text = raw.trim();
        if (text.contains("```")) {
            text = text.replaceAll("(?s).*?```(?:[a-zA-Z]+)?\\s*", "");
            text = text.replaceAll("```.*", "");
            text = text.trim();
        }
        String[] lines = text.split("\\r?\\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            line = line.replaceAll("`", "");
            line = line.replaceAll("(?i)^(?:new\\s+)?(?:healed\\s+)?locator\\s*:\\s*", "");
            line = line.replaceAll("^[\"']|[\"']$", "").trim();
            if (line.startsWith("//") || line.startsWith("/") || line.startsWith("#") || line.startsWith(".") || line.startsWith("[")
                    || line.matches("^[a-zA-Z0-9_-]+(\\[.*?\\]|#.*|\\..*|:.*)?$")) {
                return line;
            }
        }
        return text.replaceAll("`", "").trim();
    }
}
