package com.omniqa.studio.aitest;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Shared local-LLM client (merged from Autonomous).
 * Talks to Ollama {@code /api/generate} with raw bytes handling.
 */
@Component
public class OllamaClient {

    private final String baseUrl;
    private final String model;

    private final ObjectMapper mapper = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public OllamaClient(
            @Value("${ollama.base-url:http://localhost:11434}") String baseUrl,
            @Value("${ollama.model:llama3.2}") String model) {
        this.baseUrl = baseUrl;
        this.model = model;
    }

    public String getModel() {
        return model;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String generate(String prompt, double temperature) {
        Map<String, Object> body = Map.of(
                "model", model,
                "prompt", prompt,
                "stream", false,
                "options", Map.of("temperature", temperature, "num_ctx", 16384));
        String raw;
        try {
            String json = mapper.writeValueAsString(body);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/generate"))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(180))
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() / 100 != 2) {
                throw new RuntimeException("Ollama HTTP " + response.statusCode() + ": " + preview(response.body()));
            }
            byte[] bytes = response.body();
            raw = bytes != null ? new String(bytes, StandardCharsets.UTF_8) : null;
        } catch (RuntimeException httpEx) {
            throw httpEx;
        } catch (Exception httpEx) {
            throw new RuntimeException("Ollama request failed: " + httpEx.getMessage(), httpEx);
        }
        if (raw == null || raw.isBlank()) {
            throw new RuntimeException("Empty response received from Ollama model.");
        }
        try {
            OllamaResponse parsed = mapper.readValue(raw, OllamaResponse.class);
            if (parsed == null || parsed.response() == null || parsed.response().isBlank()) {
                throw new RuntimeException("Ollama response contained no generated text.");
            }
            return parsed.response();
        } catch (com.fasterxml.jackson.core.JacksonException parseEx) {
            throw new RuntimeException("Ollama returned a non-JSON response: " + preview(raw.getBytes(StandardCharsets.UTF_8)), parseEx);
        }
    }

    static String preview(byte[] body) {
        if (body == null || body.length == 0) return "<empty body>";
        String text = new String(body, StandardCharsets.UTF_8);
        return text.length() > 300 ? text.substring(0, 300) + "..." : text;
    }

    public record OllamaResponse(String response) {}
}
