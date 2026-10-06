package com.omniqa.studio.controller;

import com.omniqa.studio.dto.TestForgeRequest;
import com.omniqa.studio.entity.TestRunEntity;
import com.omniqa.studio.repository.TestRunRepository;
import com.omniqa.studio.service.SmartFlowService;
import com.omniqa.studio.service.SmartLoginService;
import com.omniqa.studio.service.TestForgeService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/automation")
public class AutomationController {

    private final TestForgeService forge;
    private final SmartLoginService smart;
    private final SmartFlowService flow;
    private final TestRunRepository testRuns;

    public AutomationController(TestForgeService forge, SmartLoginService smart, SmartFlowService flow, TestRunRepository testRuns) {
        this.forge = forge;
        this.smart = smart;
        this.flow = flow;
        this.testRuns = testRuns;
    }

    /** POST /api/automation/generate — requirement + URL → Selenium TestNG code (no execution). */
    @PostMapping("/generate")
    public ResponseEntity<?> generate(@RequestBody TestForgeRequest req) {
        if (!StringUtils.hasText(req.getUrl())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Application URL is required"));
        }
        String code = forge.generateCode(req);
        return ResponseEntity.ok(Map.of(
                "testName", StringUtils.hasText(req.getTestName()) ? req.getTestName() : "ForgeTest",
                "language", "java",
                "code", code));
    }

    /** POST /api/automation/run — launches a real headless browser run, returns immediately. */
    @PostMapping("/run")
    public ResponseEntity<?> run(@RequestBody TestForgeRequest req) {
        if (!StringUtils.hasText(req.getUrl())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Application URL is required"));
        }
        if (req.getSteps() == null || req.getSteps().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Add at least one step (e.g. GOTO the URL)"));
        }
        TestRunEntity launched = forge.launchRun(req);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "runId", launched.getId().toString(),
                "status", launched.getStatus(),
                "message", "Forge run started — watch Dashboard or poll status"));
    }

    /** GET /api/automation/runs/{id} — poll run status/result. */
    @GetMapping("/runs/{id}")
    public ResponseEntity<?> status(@PathVariable UUID id) {
        return testRuns.findById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * POST /api/automation/smart-login — zero-knowledge login test.
     * Body: url, username, password, requirements (optional), testName (optional).
     * No selectors, no code, no AI key needed. Password is never logged.
     */
    @PostMapping("/smart-login")
    public ResponseEntity<?> smartLogin(@RequestBody Map<String, String> body) {
        String url = body.getOrDefault("url", "").trim();
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");
        if (!StringUtils.hasText(url)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Application URL is required"));
        }
        if (!StringUtils.hasText(username)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Login ID / username is required"));
        }
        if (!StringUtils.hasText(password)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Password is required"));
        }
        TestRunEntity launched = smart.launch(
                body.getOrDefault("testName", ""), url, username, password, body.getOrDefault("requirements", ""));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "runId", launched.getId().toString(),
                "status", launched.getStatus(),
                "message", "Smart login started — AI khud field dhundh ke login karega"));
    }

    /**
     * POST /api/automation/parse — preview: instructions AI ne kya samjha.
     * Body: { instructions }. No execution, no AI key needed.
     */
    @PostMapping("/parse")
    public ResponseEntity<?> parse(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(Map.of("steps", flow.parse(body.getOrDefault("instructions", ""))));
    }

    /**
     * POST /api/automation/smart-run — ANY testing via plain-words steps.
     * Body: testName (optional), url, instructions (multi-line).
     */
    @PostMapping("/smart-run")
    public ResponseEntity<?> smartRun(@RequestBody Map<String, String> body) {
        String url = body.getOrDefault("url", "").trim();
        String instructions = body.getOrDefault("instructions", "");
        if (!StringUtils.hasText(url)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Application URL is required"));
        }
        if (!StringUtils.hasText(instructions)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Instructions likho — kya karna hai, line by line"));
        }
        TestRunEntity launched = flow.launch(body.getOrDefault("testName", ""), url, instructions);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "runId", launched.getId().toString(),
                "status", launched.getStatus(),
                "message", "Smart flow started — steps execute ho rahe hai"));
    }
}
