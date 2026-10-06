package com.omniqa.studio.service;

import com.omniqa.studio.entity.BugReportEntity;
import com.omniqa.studio.entity.TestRunEntity;
import com.omniqa.studio.repository.BugReportRepository;
import com.omniqa.studio.repository.TestRunRepository;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.Keys;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Zero-knowledge login tester: user gives URL + ID + password + plain-words
 * requirement. No selectors, no code, no AI key needed — the engine finds the
 * username field, password field and submit button itself, logs in, and
 * verifies the outcome.
 */
@Service
public class SmartLoginService {

    private static final Logger logger = LoggerFactory.getLogger(SmartLoginService.class);

    private final TestRunRepository testRuns;
    private final BugReportRepository bugs;
    private final BugTriageService triage;
    private final GoogleCloudStorageService storage;
    private final SimpMessagingTemplate messaging;

    public SmartLoginService(TestRunRepository testRuns, BugReportRepository bugs,
                             BugTriageService triage, GoogleCloudStorageService storage,
                             SimpMessagingTemplate messaging) {
        this.testRuns = testRuns;
        this.bugs = bugs;
        this.triage = triage;
        this.storage = storage;
        this.messaging = messaging;
    }

    public TestRunEntity launch(String testName, String url, String username, String password, String requirements) {
        TestRunEntity run = TestRunEntity.builder()
                .testName(StringUtils.hasText(testName) ? testName : "Smart login: " + url)
                .status("RUNNING").executionTime(0L)
                .logs("Smart login launched for " + url + " (password masked, never logged)").build();
        TestRunEntity saved = testRuns.save(run);
        executeAsync(saved.getId(), url, username, password, requirements);
        return saved;
    }

    @Async("taskExecutor")
    protected void executeAsync(UUID runId, String url, String username, String password, String requirements) {
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
            driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));

            logs.append("Opening ").append(url).append("\n");
            driver.get(url);
            Thread.sleep(2500); // let SPA / JS forms render

            String title = driver.getTitle();
            logs.append("Page title: ").append(title == null ? "(empty)" : title).append("\n");
            if (!StringUtils.hasText(title)) logs.append("WARN: blank title — page may still be loading\n");

            // 1. Find username field
            WebElement userField = findUsernameField(driver);
            if (userField == null) throw new AssertionError("Username/ID field nahi mila — page pe visible text/email input nahi dikha");
            logs.append("Username field mil gaya: <").append(describe(userField)).append(">\n");
            userField.clear();
            userField.sendKeys(username);
            logs.append("Username entered (value masked)\n");

            // 2. Find password field
            WebElement passField = findPasswordField(driver);
            if (passField == null) throw new AssertionError("Password field nahi mila — input[type=password] nahi dikha");
            logs.append("Password field mil gaya\n");
            passField.clear();
            passField.sendKeys(password);
            logs.append("Password entered (value masked)\n");

            // 3. Submit
            String loginUrl = driver.getCurrentUrl();
            boolean submitted = clickSubmit(driver, passField, logs);
            if (!submitted) throw new AssertionError("Submit button nahi mila aur ENTER se bhi submit nahi hua");

            // 4. Wait for outcome (URL change or login form gone), up to 12s
            boolean moved = false;
            for (int i = 0; i < 24; i++) {
                Thread.sleep(500);
                try {
                    if (!driver.getCurrentUrl().equals(loginUrl)) { moved = true; break; }
                    if (findPasswordField(driver) == null) { moved = true; break; }
                } catch (Exception ignored) { moved = true; break; }
            }
            logs.append(moved ? "Login ke baad page badal gaya: " + driver.getCurrentUrl() + "\n"
                    : "WARN: 12s me page nahi badla, login form abhi bhi dikh raha\n");

            // 5. Requirement checks — "quoted text" must appear on the landing page
            String pageText = bodyText(driver);
            List<String> expected = quotedExpectations(requirements);
            List<String> missing = new ArrayList<>();
            for (String exp : expected) {
                if (pageText.toLowerCase().contains(exp.toLowerCase())) {
                    logs.append("Requirement check OK — '").append(exp).append("' dikha\n");
                } else {
                    missing.add(exp);
                    logs.append("Requirement check FAIL — '").append(exp).append("' nahi dikha\n");
                }
            }

            if (!moved) {
                status = "FAILED";
                logs.append("RESULT: FAILED — login hota nahi dikha (galat ID/password ya alag flow ho sakta hai)\n");
                String err = errorHint(driver);
                if (StringUtils.hasText(err)) logs.append("Page pe error message: ").append(err).append("\n");
            } else if (!missing.isEmpty()) {
                status = "FAILED";
                logs.append("RESULT: FAILED — login to hua, par requirement text missing: ").append(missing).append("\n");
            } else {
                logs.append("RESULT: PASSED — login successful, requirements satisfied\n");
            }

            try {
                byte[] shot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                screenshotUrl = storage.uploadBytes(shot, "smart_" + runId + ".png", "image/png", "forge-runs");
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
                    .rootCauseAnalysis("Smart login failed for " + url + "\n" + run.getLogs())
                    .aiExplanation(triage.triageExplanation(run.getTestName(), severity, run.getLogs()))
                    .build());
        }
        try {
            messaging.convertAndSend("/topic/test-runs", (Object) run);
            messaging.convertAndSend("/topic/forge/" + runId, (Object) Map.of("runId", runId.toString(), "status", status));
        } catch (Exception ignored) {}
    }

    // ---------- field detection (no selectors from user) ----------

    private WebElement findUsernameField(WebDriver driver) {
        List<WebElement> inputs = visibleTextInputs(driver);
        WebElement fallback = null;
        int best = -1;
        for (WebElement el : inputs) {
            String type = attr(el, "type");
            if ("password".equalsIgnoreCase(type)) continue;
            int score = 0;
            String hay = (attr(el, "name") + " " + attr(el, "id") + " " + attr(el, "placeholder") + " " + attr(el, "aria-label")).toLowerCase();
            if ("email".equalsIgnoreCase(type)) score += 3;
            if (hay.matches(".*(user|email|login|e-mail|mobile|phone|account|uname).*")) score += 3;
            if ("text".equalsIgnoreCase(type) || "tel".equalsIgnoreCase(type)) score += 1;
            if (fallback == null) fallback = el;
            if (score > best) { best = score; }
        }
        // re-scan to return the best element deterministically
        WebElement chosen = fallback;
        for (WebElement el : inputs) {
            String type = attr(el, "type");
            if ("password".equalsIgnoreCase(type)) continue;
            int score = 0;
            String hay = (attr(el, "name") + " " + attr(el, "id") + " " + attr(el, "placeholder") + " " + attr(el, "aria-label")).toLowerCase();
            if ("email".equalsIgnoreCase(type)) score += 3;
            if (hay.matches(".*(user|email|login|e-mail|mobile|phone|account|uname).*")) score += 3;
            if ("text".equalsIgnoreCase(type) || "tel".equalsIgnoreCase(type)) score += 1;
            if (score >= best && score > 0) { chosen = el; break; }
        }
        return best > 0 ? chosen : fallback;
    }

    private WebElement findPasswordField(WebDriver driver) {
        for (WebElement el : driver.findElements(By.cssSelector("input[type='password']"))) {
            try { if (el.isDisplayed() && el.isEnabled()) return el; } catch (Exception ignored) {}
        }
        return null;
    }

    private List<WebElement> visibleTextInputs(WebDriver driver) {
        List<WebElement> out = new ArrayList<>();
        for (WebElement el : driver.findElements(By.cssSelector("input"))) {
            try {
                String type = attr(el, "type").toLowerCase();
                if (List.of("hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset").contains(type)) continue;
                if (el.isDisplayed() && el.isEnabled()) out.add(el);
            } catch (Exception ignored) {}
        }
        return out;
    }

    private boolean clickSubmit(WebDriver driver, WebElement passField, StringBuilder logs) {
        // 1. submit buttons
        for (WebElement el : driver.findElements(By.cssSelector("button[type='submit'], input[type='submit']"))) {
            try {
                if (el.isDisplayed() && el.isEnabled()) {
                    el.click();
                    logs.append("Submit button click kiya\n");
                    return true;
                }
            } catch (Exception ignored) {}
        }
        // 2. buttons whose text says login / sign in / submit / continue
        Pattern p = Pattern.compile("(?i)\\b(log\\s?in|sign\\s?in|submit|continue|login|entrar|anmelden)\\b");
        for (WebElement el : driver.findElements(By.cssSelector("button"))) {
            try {
                String txt = el.getText();
                if (el.isDisplayed() && el.isEnabled() && txt != null && p.matcher(txt).find()) {
                    el.click();
                    logs.append("'" + txt.trim() + "' button click kiya\n");
                    return true;
                }
            } catch (Exception ignored) {}
        }
        // 3. ENTER in password field
        try {
            passField.sendKeys(Keys.ENTER);
            logs.append("ENTER press karke submit kiya\n");
            return true;
        } catch (Exception ex) {
            logs.append("ENTER submit fail: ").append(ex.getMessage()).append("\n");
            return false;
        }
    }

    private String bodyText(WebDriver driver) {
        try {
            WebElement body = driver.findElement(By.cssSelector("body"));
            String t = body.getText();
            return t == null ? "" : (t.length() > 4000 ? t.substring(0, 4000) : t);
        } catch (Exception e) {
            return "";
        }
    }

    private String errorHint(WebDriver driver) {
        try {
            Object o = ((JavascriptExecutor) driver).executeScript(
                    "var els=[...document.querySelectorAll('[class*=error],[class*=alert],[class*=invalid],[role=alert]')];" +
                    "return els.map(e=>e.innerText).filter(t=>t&&t.trim()).slice(0,3).join(' | ')");
            return o == null ? "" : o.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private List<String> quotedExpectations(String requirements) {
        List<String> out = new ArrayList<>();
        if (!StringUtils.hasText(requirements)) return out;
        Matcher m = Pattern.compile("\"([^\"]{2,60})\"").matcher(requirements);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    private String attr(WebElement el, String name) {
        try {
            String v = el.getAttribute(name);
            return v == null ? "" : v;
        } catch (Exception e) {
            return "";
        }
    }

    private String describe(WebElement el) {
        try {
            String tag = el.getTagName();
            String id = attr(el, "id");
            String name = attr(el, "name");
            String type = attr(el, "type");
            return tag + (StringUtils.hasText(id) ? "#" + id : "") + (StringUtils.hasText(name) ? "[name=" + name + "]" : "") + " type=" + type;
        } catch (Exception e) {
            return "input";
        }
    }
}
