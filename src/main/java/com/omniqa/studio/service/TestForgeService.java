package com.omniqa.studio.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.omniqa.studio.dto.TestForgeRequest;
import com.omniqa.studio.dto.TestForgeRequest.ForgeStep;
import com.omniqa.studio.entity.BugReportEntity;
import com.omniqa.studio.entity.TestRunEntity;
import com.omniqa.studio.repository.BugReportRepository;
import com.omniqa.studio.repository.TestRunRepository;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.By;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI Test Forge: turns "URL + plain-words requirement" into
 * (a) ready Selenium TestNG code, and (b) a real headless browser run.
 */
@Service
public class TestForgeService {

    private static final Logger logger = LoggerFactory.getLogger(TestForgeService.class);

    @Value("${ai.llm.api-key:}")
    private String apiKey;
    @Value("${ai.llm.api-url:https://api.openai.com/v1/chat/completions}")
    private String apiUrl;
    @Value("${ai.llm.model:gpt-4o-mini}")
    private String model;

    private final TestRunRepository testRuns;
    private final BugReportRepository bugs;
    private final BugTriageService triage;
    private final GoogleCloudStorageService storage;
    private final SimpMessagingTemplate messaging;
    private final com.omniqa.studio.aitest.GeminiClient gemini;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    public TestForgeService(TestRunRepository testRuns, BugReportRepository bugs,
                            BugTriageService triage, GoogleCloudStorageService storage,
                            SimpMessagingTemplate messaging,
                            com.omniqa.studio.aitest.GeminiClient gemini) {
        this.testRuns = testRuns;
        this.bugs = bugs;
        this.triage = triage;
        this.storage = storage;
        this.messaging = messaging;
        this.gemini = gemini;
    }

    // ---------------- Code generation ----------------

    public String generateCode(TestForgeRequest req) {
        String testName = safe(req.getTestName(), "ForgeTest");
        String url = safe(req.getUrl(), "https://example.com");
        String requirements = safe(req.getRequirements(), "smoke test the page");
        if (gemini.isConfigured()) {
            try {
                return callGemini(testName, url, requirements, req.getSteps());
            } catch (Exception ex) {
                logger.warn("Forge Gemini failed, trying OpenAI: {}", ex.getMessage());
            }
        }
        if (StringUtils.hasText(apiKey)) {
            try {
                return callLlm(testName, url, requirements, req.getSteps());
            } catch (Exception ex) {
                logger.warn("Forge LLM failed, using template generator: {}", ex.getMessage());
            }
        }
        return templateCode(testName, url, requirements, req.getSteps());
    }

    private String callGemini(String testName, String url, String requirements, List<ForgeStep> steps) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are a senior Selenium automation engineer. Output compilable Java only.\n");
        sb.append("Generate a complete, runnable Java 21 TestNG + Selenium 4 test class named ").append(testName).append(".\n");
        sb.append("Target URL: ").append(url).append("\n");
        sb.append("Requirement (plain words): ").append(requirements).append("\n");
        if (steps != null && !steps.isEmpty()) {
            sb.append("Exact steps to encode:\n");
            for (ForgeStep s : steps) sb.append("- ").append(s.getAction()).append(" | selector=").append(s.getSelector()).append(" | value=").append(s.getValue()).append("\n");
        }
        sb.append("Rules: headless Chrome via WebDriverManager, explicit WebDriverWait, TestNG asserts, screenshot on failure to target/screenshots, quit driver in @AfterClass. Return ONLY raw Java code, no markdown.");
        String code = gemini.generate(sb.toString(), 0.2);
        return code.replaceAll("(?s)```java|```", "").trim();
    }

    private String callLlm(String testName, String url, String requirements, List<ForgeStep> steps) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("Generate a complete, runnable Java 21 TestNG + Selenium 4 test class named ").append(testName).append(".\n");
        sb.append("Target URL: ").append(url).append("\n");
        sb.append("Requirement (plain words): ").append(requirements).append("\n");
        if (steps != null && !steps.isEmpty()) {
            sb.append("Exact steps to encode:\n");
            for (ForgeStep s : steps) sb.append("- ").append(s.getAction()).append(" | selector=").append(s.getSelector()).append(" | value=").append(s.getValue()).append("\n");
        }
        sb.append("Rules: headless Chrome via WebDriverManager, explicit WebDriverWait, TestNG asserts, screenshot on failure to target/screenshots, quit driver in @AfterClass. Return ONLY raw Java code, no markdown.");

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", "You are a senior Selenium automation engineer. Output compilable Java only."),
                        Map.of("role", "user", "content", sb.toString())),
                "temperature", 0.2);

        String json = restClient.post().uri(apiUrl)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(String.class);
        String code = mapper.readTree(json).path("choices").path(0).path("message").path("content").asText();
        return code.replaceAll("(?s)```java|```", "").trim();
    }

    /** Offline template generator: converts step rows into a real TestNG class. */
    public String templateCode(String testName, String url, String requirements, List<ForgeStep> steps) {
        String cls = testName.replaceAll("[^A-Za-z0-9_]", "");
        if (cls.isEmpty()) cls = "ForgeTest";
        StringBuilder b = new StringBuilder();
        b.append("import io.github.bonigarcia.wdm.WebDriverManager;\n")
         .append("import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.*;\n")
         .append("import org.openqa.selenium.support.ui.*;\nimport org.testng.Assert;\n")
         .append("import org.testng.annotations.*;\nimport java.time.Duration;\n\n")
         .append("// Requirement: ").append(requirements.replace("\n", " ")).append("\n")
         .append("public class ").append(cls).append(" {\n")
         .append("    WebDriver driver; WebDriverWait wait;\n\n")
         .append("    @BeforeClass public void setup() {\n")
         .append("        WebDriverManager.chromedriver().setup();\n")
         .append("        ChromeOptions o = new ChromeOptions();\n")
         .append("        o.addArguments(\"--headless=new\", \"--no-sandbox\", \"--window-size=1366,768\");\n")
         .append("        driver = new ChromeDriver(o);\n")
         .append("        wait = new WebDriverWait(driver, Duration.ofSeconds(15));\n    }\n\n")
         .append("    @Test public void forgeScenario() {\n")
         .append("        driver.get(\"").append(url.replace("\"", "")).append("\");\n");
        if (steps != null) {
            for (ForgeStep s : steps) {
                String a = s.getAction() == null ? "" : s.getAction().toUpperCase();
                String sel = s.getSelector() == null ? "" : s.getSelector().replace("\"", "'");
                String val = s.getValue() == null ? "" : s.getValue().replace("\"", "'");
                switch (a) {
                    case "CLICK" -> b.append("        wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector(\"").append(sel).append("\"))).click();\n");
                    case "TYPE" -> b.append("        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(\"").append(sel).append("\")));\n        el.clear(); el.sendKeys(\"").append(val).append("\");\n");
                    case "ASSERT_TITLE_CONTAINS" -> b.append("        Assert.assertTrue(driver.getTitle().contains(\"").append(val).append("\"), \"title check\");\n");
                    case "ASSERT_TEXT_PRESENT" -> b.append("        Assert.assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(\"").append(sel).append("\")).getText().contains(\"").append(val).append("\"), \"text check\");\n");
                    case "WAIT_SECONDS" -> { try { b.append("        Thread.sleep(").append(Long.parseLong(val.trim()) * 1000).append(");\n"); } catch (Exception ignored) {} }
                    case "SCREENSHOT" -> b.append("        ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);\n");
                    default -> b.append("        // step: ").append(a).append("\n");
                }
            }
        }
        b.append("    }\n\n    @AfterClass public void teardown() { if (driver != null) driver.quit(); }\n}\n");
        return b.toString();
    }

    // ---------------- One-click run ----------------

    public TestRunEntity launchRun(TestForgeRequest req) {
        TestRunEntity run = TestRunEntity.builder()
                .testName(StringUtils.hasText(req.getTestName()) ? req.getTestName() : "Forge run: " + req.getUrl())
                .status("RUNNING").executionTime(0L)
                .logs("Forge run launched for " + req.getUrl()).build();
        TestRunEntity saved = testRuns.save(run);
        executeAsync(saved.getId(), req);
        return saved;
    }

    @Async("taskExecutor")
    protected void executeAsync(UUID runId, TestForgeRequest req) {
        long start = System.currentTimeMillis();
        StringBuilder logs = new StringBuilder();
        String status = "PASSED";
        String screenshotUrl = null;
        WebDriver driver = null;
        try {
            WebDriverManager.chromedriver().setup();
            ChromeOptions options = new ChromeOptions();
            options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1366,768");
            driver = new ChromeDriver(options);
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));

            List<ForgeStep> steps = req.getSteps() == null ? List.of() : req.getSteps();
            boolean visited = false;
            for (ForgeStep s : steps) {
                String a = s.getAction() == null ? "" : s.getAction().toUpperCase();
                switch (a) {
                    case "GOTO" -> { driver.get(s.getValue()); visited = true; logs.append("GOTO ").append(s.getValue()).append("\n"); }
                    case "CLICK" -> {
                        WebElement el = wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector(s.getSelector())));
                        el.click(); logs.append("CLICK ").append(s.getSelector()).append(" OK\n");
                    }
                    case "TYPE" -> {
                        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(s.getSelector())));
                        el.clear(); el.sendKeys(s.getValue() == null ? "" : s.getValue());
                        logs.append("TYPE into ").append(s.getSelector()).append(" OK\n");
                    }
                    case "ASSERT_TITLE_CONTAINS" -> {
                        String t = driver.getTitle();
                        if (t != null && t.contains(s.getValue())) logs.append("TITLE contains '").append(s.getValue()).append("' OK\n");
                        else throw new AssertionError("Title [" + t + "] does not contain [" + s.getValue() + "]");
                    }
                    case "ASSERT_TEXT_PRESENT" -> {
                        String txt = wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(s.getSelector()))).getText();
                        if (txt != null && txt.contains(s.getValue())) logs.append("TEXT present OK\n");
                        else throw new AssertionError("Text [" + s.getValue() + "] not found in [" + s.getSelector() + "]");
                    }
                    case "WAIT_SECONDS" -> Thread.sleep(Long.parseLong(s.getValue().trim()) * 1000);
                    case "SCREENSHOT" -> logs.append("screenshot checkpoint\n");
                    default -> logs.append("skip unknown step ").append(a).append("\n");
                }
            }
            if (!visited && StringUtils.hasText(req.getUrl())) {
                driver.get(req.getUrl());
                logs.append("GOTO ").append(req.getUrl()).append("\n");
            }
            try {
                byte[] shot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                screenshotUrl = storage.uploadBytes(shot, "forge_" + runId + ".png", "image/png", "forge-runs");
                logs.append("screenshot saved\n");
            } catch (Exception ex) {
                logs.append("screenshot skipped: ").append(ex.getMessage()).append("\n");
            }
        } catch (Exception ex) {
            status = "FAILED";
            logs.append("FAILED: ").append(ex.toString()).append("\n");
        } finally {
            try { if (driver != null) driver.quit(); } catch (Exception ignored) {}
        }

        long duration = System.currentTimeMillis() - start;
        TestRunEntity run = testRuns.findById(runId).orElse(null);
        if (run == null) return;
        run.setStatus(status);
        run.setExecutionTime(duration);
        run.setLogs(logs.toString());
        run.setScreenshotUrl(screenshotUrl);
        testRuns.save(run);

        if ("FAILED".equals(status)) {
            String severity = triage.triageSeverity(run.getTestName(), run.getLogs());
            bugs.save(BugReportEntity.builder().testRunId(run.getId()).status("OPEN")
                    .severity(severity)
                    .rootCauseAnalysis("Forge run failed for " + req.getUrl() + "\n" + run.getLogs())
                    .aiExplanation(triage.triageExplanation(run.getTestName(), severity, run.getLogs()))
                    .build());
        }
        try {
            messaging.convertAndSend("/topic/test-runs", (Object) run);
            messaging.convertAndSend("/topic/forge/" + runId, (Object) Map.of("runId", runId.toString(), "status", status));
        } catch (Exception ignored) {}
    }

    private String safe(String v, String fallback) {
        return StringUtils.hasText(v) ? v : fallback;
    }
}
