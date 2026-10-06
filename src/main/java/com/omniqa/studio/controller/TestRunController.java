package com.omniqa.studio.controller;

import com.omniqa.studio.dto.TestRunRequest;
import com.omniqa.studio.entity.BugReportEntity;
import com.omniqa.studio.entity.TestRunEntity;
import com.omniqa.studio.repository.BugReportRepository;
import com.omniqa.studio.repository.TestRunRepository;
import com.omniqa.studio.service.BugTriageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/test-runs")
@CrossOrigin(origins = "${app.cors.allowed-origins:http://localhost:5173}", maxAge = 3600)
public class TestRunController {

    private final TestRunRepository testRunRepository;
    private final BugReportRepository bugReportRepository;
    private final BugTriageService triageService;
    private final SimpMessagingTemplate messaging;

    @Value("${service.api-key:}")
    private String serviceApiKey;

    public TestRunController(TestRunRepository testRunRepository, BugReportRepository bugReportRepository,
                             BugTriageService triageService, SimpMessagingTemplate messaging) {
        this.testRunRepository = testRunRepository;
        this.bugReportRepository = bugReportRepository;
        this.triageService = triageService;
        this.messaging = messaging;
    }

    /**
     * POST /api/test-runs
     * Receives automated test run results from the automation engine.
     * Auto-creates a bug report if status is FAILED.
     * Prod: send X-SERVICE-KEY header matching SERVICE_API_KEY env.
     */
    @PostMapping
    public ResponseEntity<?> recordTestRun(@RequestBody TestRunRequest request,
                                           @RequestHeader(value = "X-SERVICE-KEY", required = false) String serviceKey) {
        if (StringUtils.hasText(serviceApiKey) && !serviceApiKey.equals(serviceKey)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("error", "Invalid service key"));
        }
        TestRunEntity testRun = TestRunEntity.builder()
                .testName(request.getTestName() != null ? request.getTestName() : "Unnamed Test")
                .status(request.getStatus() != null ? request.getStatus().toUpperCase() : "UNKNOWN")
                .executionTime(request.getExecutionTime() != null ? request.getExecutionTime() : 0L)
                .logs(request.getLogs())
                .screenshotUrl(request.getScreenshotUrl())
                .build();

        TestRunEntity savedRun = testRunRepository.save(testRun);

        // Auto-generate triaged bug report if test failed (async broadcast, non-blocking)
        if ("FAILED".equalsIgnoreCase(savedRun.getStatus())) {
            String severity = triageService.triageSeverity(savedRun.getTestName(), savedRun.getLogs());
            BugReportEntity bugReport = BugReportEntity.builder()
                    .testRunId(savedRun.getId())
                    .severity(severity)
                    .status("OPEN")
                    .rootCauseAnalysis("Automated test failure recorded by OmniQA Automation Engine.\nLogs:\n" + savedRun.getLogs())
                    .aiExplanation(triageService.triageExplanation(savedRun.getTestName(), severity, savedRun.getLogs()))
                    .build();
            bugReportRepository.save(bugReport);
            broadcastRun(savedRun);
        } else {
            broadcastRun(savedRun);
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(savedRun);
    }

    @Async("taskExecutor")
    protected void broadcastRun(TestRunEntity run) {
        try {
            messaging.convertAndSend("/topic/test-runs", run);
        } catch (Exception ignored) {}
    }

    /**
     * GET /api/test-runs
     * Lists all test runs.
     */
    @GetMapping
    public ResponseEntity<List<TestRunEntity>> getAllTestRuns() {
        return ResponseEntity.ok(testRunRepository.findAll());
    }

    /**
     * GET /api/test-runs/{id}
     * Retrieves a single test run by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<TestRunEntity> getTestRunById(@PathVariable UUID id) {
        return testRunRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/test-runs/{id}/bugs
     * Retrieves bug reports associated with a test run.
     */
    @GetMapping("/{id}/bugs")
    public ResponseEntity<List<BugReportEntity>> getBugsForTestRun(@PathVariable UUID id) {
        return ResponseEntity.ok(bugReportRepository.findByTestRunId(id));
    }
}
