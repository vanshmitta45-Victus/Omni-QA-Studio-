package com.omniqa.studio.aitest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Shared Google Gemini client (free tier). First choice when configured,
 * ahead of OpenAI-compatible and local Ollama.
 *
 * Key resolution: {@code GEMINI_API_KEY} wins; otherwise {@code AI_PROVIDER}
 * is accepted when it looks like a key (some consoles paste the key there).
 */
@Component
public class GeminiClient {

    private static final Logger logger = LoggerFactory.getLogger(GeminiClient.class);

    private final String apiKey;
    private final String model;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    public GeminiClient(
            @Value("${gemini.api-key:}") String geminiKey,
            @Value("${gemini.model:gemini-3.8-flash}") String model,
            @Value("${ai.provider:}") String provider) {
        String resolved = StringUtils.hasText(geminiKey) ? geminiKey.trim() : "";
        if (!StringUtils.hasText(resolved) && looksLikeKey(provider)) {
            resolved = provider.trim();
        }
        this.apiKey = resolved;
        this.model = StringUtils.hasText(model) ? model.trim() : "gemini-3.8-flash";
    }

    static boolean looksLikeKey(String v) {
        if (!StringUtils.hasText(v)) return false;
        String t = v.trim();
        if (t.equalsIgnoreCase("gemini") || t.equalsIgnoreCase("openai")
                || t.equalsIgnoreCase("ollama") || t.equalsIgnoreCase("auto")) return false;
        return t.length() > 20 && (t.startsWith("AIza") || t.startsWith("AQ."));
    }

    public boolean isConfigured() {
        return StringUtils.hasText(apiKey);
    }

    public String getModel() {
        return model;
    }

    public String generate(String prompt, double temperature) {
        if (!isConfigured()) {
            throw new IllegalStateException("Gemini API key is not configured");
        }
        try {
            Map<String, Object> body = Map.of(
                    "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                    "generationConfig", Map.of("temperature", temperature));
            String json = restClient.post()
                    .uri("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode root = mapper.readTree(json);
            JsonNode parts = root.path("candidates").path(0).path("content").path("parts");
            StringBuilder sb = new StringBuilder();
            if (parts.isArray()) {
                for (JsonNode part : parts) {
                    String text = part.path("text").asText("");
                    if (StringUtils.hasText(text)) sb.append(text);
                }
            }
            String out = sb.toString().trim();
            if (!StringUtils.hasText(out)) {
                throw new RuntimeException("Gemini returned no text: " + preview(json));
            }
            return out;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Gemini request failed: " + e.getMessage(), e);
        }
    }

    private static String preview(String s) {
        if (s == null) return "<null>";
        return s.length() > 300 ? s.substring(0, 300) + "..." : s;
    }
}
