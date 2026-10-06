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
                try {
                    raw = ollama.generate(prompt, 0.0);
                } catch (Exception ollamaEx) {
                    // Keyless offline path: fuzzy-match attributes in the live DOM.
                    String healed = healHeuristically(failedLocator, currentDomSnippet);
                    if (healed != null) return healed;
                    throw ollamaEx;
                }
            }
            return cleanLocatorString(raw);
        } catch (Exception e) {
            String healed = healHeuristically(failedLocator, currentDomSnippet);
            if (healed != null) return healed;
            throw new RuntimeException("Self-healing service failed: " + e.getMessage(), e);
        }
    }

    /**
     * Offline fallback: finds a live element resembling the broken locator —
     * same id fragment, name, or visible text — and returns a fresh selector.
     */
    static String healHeuristically(String failedLocator, String currentDomSnippet) {
        if (failedLocator == null || failedLocator.isBlank()
                || currentDomSnippet == null || currentDomSnippet.isBlank()) return null;
        try {
            org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(currentDomSnippet);
            String hint = failedLocator.replaceAll("^(//|#|\\.|css=|xpath=)", "").trim();
            String token = hint.replaceAll("[^A-Za-z0-9_\\- ]", " ").trim().split("\\s+")[0];
            if (!token.isEmpty()) {
                for (org.jsoup.nodes.Element el : doc.getAllElements()) {
                    for (String attr : new String[]{"id", "name", "aria-label", "placeholder", "class"}) {
                        String val = el.attr(attr);
                        if (val != null && !val.isBlank()
                                && val.toLowerCase().contains(token.toLowerCase())) {
                            if ("id".equals(attr)) return "#" + val.trim().split("\\s+")[0];
                            if ("name".equals(attr)) return "[name='" + val.trim() + "']";
                            return el.tagName() + "." + val.trim().split("\\s+")[0];
                        }
                    }
                    if (el.ownText() != null && el.ownText().toLowerCase().contains(token.toLowerCase())
                            && ("button".equals(el.tagName()) || "a".equals(el.tagName()))) {
                        return "//" + el.tagName() + "[contains(text(),'" + el.ownText().trim().replace("'", "") + "')]";
                    }
                }
            }
            org.jsoup.nodes.Element submit = doc.selectFirst("button[type=submit], input[type=submit]");
            if (submit != null && submit.hasAttr("id")) return "#" + submit.attr("id");
        } catch (Exception ignored) {}
        return null;
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
