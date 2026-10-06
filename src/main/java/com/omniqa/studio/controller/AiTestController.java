package com.omniqa.studio.controller;

import com.omniqa.studio.aitest.AiTestGeneratorService;
import com.omniqa.studio.aitest.DomExtractorService;
import com.omniqa.studio.aitest.OllamaClient;
import com.omniqa.studio.aitest.SelfHealingService;
import com.omniqa.studio.aitest.TestExecutionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Preserved Autonomous API (merged): {@code /api/ai-test/*}.
 * Health is open; all other endpoints require JWT via SecurityConfig.
 */
@RestController
@RequestMapping("/api/ai-test")
public class AiTestController {

    private final DomExtractorService domExtractorService;
    private final AiTestGeneratorService aiTestGeneratorService;
    private final SelfHealingService selfHealingService;
    private final TestExecutionService testExecutionService;
    private final OllamaClient ollamaClient;

    public AiTestController(DomExtractorService domExtractorService,
                            AiTestGeneratorService aiTestGeneratorService,
                            SelfHealingService selfHealingService,
                            TestExecutionService testExecutionService,
                            OllamaClient ollamaClient) {
        this.domExtractorService = domExtractorService;
        this.aiTestGeneratorService = aiTestGeneratorService;
        this.selfHealingService = selfHealingService;
        this.testExecutionService = testExecutionService;
        this.ollamaClient = ollamaClient;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "OmniQA Studio ai-test (merged)",
                "model", ollamaClient.getModel(),
                "timestamp", System.currentTimeMillis()));
    }

    @PostMapping("/generate")
    public ResponseEntity<String> generateTest(@RequestBody TestRequest request) {
        try {
            if (request.url() == null || request.url().isBlank()) {
                return ResponseEntity.badRequest().body("Error: Target URL must not be blank.");
            }
            if (request.instruction() == null || request.instruction().isBlank()) {
                return ResponseEntity.badRequest().body("Error: Test instructions must not be blank.");
            }
            String dom = domExtractorService.extractCleanDom(request.url().trim());
            String generatedCode = aiTestGeneratorService.generateSeleniumTest(
                    dom, request.instruction().trim(), request.url().trim());
            return ResponseEntity.ok(generatedCode);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Generation Error: " + e.getMessage());
        }
    }

    public record TestRequest(String url, String instruction) {}

    @PostMapping("/heal")
    public ResponseEntity<String> healTest(@RequestBody HealRequest request) {
        try {
            if (request.failedLocator() == null || request.failedLocator().isBlank()) {
                return ResponseEntity.badRequest().body("Error: Failed locator must not be blank.");
            }
            String healedLocator = selfHealingService.healBrokenLocator(
                    request.failedLocator().trim(), request.currentDom());
            return ResponseEntity.ok(healedLocator);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Healing Error: " + e.getMessage());
        }
    }

    public record HealRequest(String failedLocator, String currentDom) {}

    @PostMapping("/execute")
    public ResponseEntity<String> executeTest(@RequestBody ExecutionRequest request) {
        try {
            String result = testExecutionService.compileAndRunTest(request.javaCode(), request.className());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Execution Error: " + e.getMessage());
        }
    }

    public record ExecutionRequest(String javaCode, String className) {}

    @PostMapping("/fix")
    public ResponseEntity<String> fixTest(@RequestBody FixRequest request) {
        try {
            if (request.javaCode() == null || request.javaCode().isBlank()) {
                return ResponseEntity.badRequest().body("Error: Java code must not be blank.");
            }
            String fixedCode = aiTestGeneratorService.fixJavaCode(request.javaCode(), request.errorMessage());
            return ResponseEntity.ok(fixedCode);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Fix Error: " + e.getMessage());
        }
    }

    public record FixRequest(String javaCode, String errorMessage) {}
}
