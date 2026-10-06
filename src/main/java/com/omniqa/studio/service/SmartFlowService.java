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
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;
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
 * Zero-knowledge flow tester: ANY web testing via plain-words instructions.
 * No selectors, no code, no AI key needed. Elements are found by visible
 * text / labels / placeholders — the way a human describes them.
 *
 * Supported lines (case-insensitive):
 *   open https://site.com/page
 *   click "Sign in"  |  click the Login button
 *   type "alex" in Username field  |  fill "Pass@123" in password
 *   select "India" from Country
 *   check "Remember me"  |  uncheck Offers
 *   verify "Dashboard"  |  verify "Welcome" is visible
 *   verify title contains "My App"  |  verify url contains "dashboard"
 *   wait 3 seconds  |  screenshot  |  scroll down
 */
@Service
public class SmartFlowService {

    private final TestRunRepository testRuns;
    private final BugReportRepository bugs;
    private final BugTriageService triage;
    private final GoogleCloudStorageService storage;
    private final SimpMessagingTemplate messaging;

    public SmartFlowService(TestRunRepository testRuns, BugReportRepository bugs,
                            BugTriageService triage, GoogleCloudStorageService storage,
                            SimpMessagingTemplate messaging) {
        this.testRuns = testRuns;
        this.bugs = bugs;
        this.triage = triage;
        this.storage = storage;
        this.messaging = messaging;
    }

    public record ParsedStep(String action, String target, String value, String raw, boolean understood) {}

    // ---------------- parsing (no AI needed) ----------------

    public List<ParsedStep> parse(String instructions) {
        List<ParsedStep> out = new ArrayList<>();
        if (!StringUtils.hasText(instructions)) return out;
        for (String line : instructions.split("\\r?\\n")) {
            String raw = line.trim();
            if (raw.isEmpty() || raw.startsWith("#")) continue;
            ParsedStep s = parseLine(raw);
            out.add(s == null ? new ParsedStep("UNKNOWN", "", "", raw, false) : s);
        }
        return out;
    }

    private String q(String v) {
        if (v == null) return "";
        v = v.trim();
        if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
            return v.substring(1, v.length() - 1);
        }
        return v;
    }

    private String stripTail(String v) {
        return v.replaceFirst("(?i)\\s+(button|link|field|box|input|dropdown|checkbox)$", "").trim();
    }

    private ParsedStep parseLine(String raw) {
        String line = raw.trim();
        Matcher m;
        if ((m = Pattern.compile("(?i)^(open|go to|visit|navigate to)\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("GOTO", "", q(m.group(2)), raw, true);
        if ((m = Pattern.compile("(?i)^click\\s+(?:on\\s+)?(?:the\\s+)?(.+)$").matcher(line)).matches())
            return new ParsedStep("CLICK_TEXT", stripTail(q(m.group(1))), "", raw, true);
        if ((m = Pattern.compile("(?i)^(type|enter|fill|write)\\s+[\"'](.+?)[\"']\\s+(?:in|into|inside)\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("TYPE_IN", stripTail(m.group(3)), m.group(2), raw, true);
        if ((m = Pattern.compile("(?i)^(type|enter)\\s+(.+?)\\s+(?:in|into)\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("TYPE_IN", stripTail(q(m.group(3))), q(m.group(2)), raw, true);
        if ((m = Pattern.compile("(?i)^select\\s+[\"']?(.+?)[\"']?\\s+from\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("SELECT", stripTail(q(m.group(2))), q(m.group(1)), raw, true);
        if ((m = Pattern.compile("(?i)^uncheck\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("UNCHECK", stripTail(q(m.group(1))), "", raw, true);
        if ((m = Pattern.compile("(?i)^check\\s+(.+)$").matcher(line)).matches())
            return new ParsedStep("CHECK", stripTail(q(m.group(1))), "", raw, true);
        if ((m = Pattern.compile("(?i)^verify title contains\\s+[\"']?(.+?)[\"']?$").matcher(line)).matches())
            return new ParsedStep("ASSERT_TITLE", "", q(m.group(1)), raw, true);
        if ((m = Pattern.compile("(?i)^verify url contains\\s+[\"']?(.+?)[\"']?$").matcher(line)).matches())
            return new ParsedStep("ASSERT_URL", "", q(m.group(1)), raw, true);
        if ((m = Pattern.compile("(?i)^(verify|check|see|assert|ensure)(?:\\s+that)?\\s+[\"'](.+?)[\"'](?:\\s+(is\\s+)?(visible|present|shown|displayed))?$").matcher(line)).matches())
            return new ParsedStep("ASSERT_TEXT", "", m.group(2), raw, true);
        if ((m = Pattern.compile("(?i)^wait\\s+(\\d+)\\s*(?:seconds?|secs?|s)?$").matcher(line)).matches())
            return new ParsedStep("WAIT", "", m.group(1), raw, true);
        if (Pattern.compile("(?i)^(screenshot|take screenshot|capture)(\\s+.*)?$").matcher(line).matches())
            return new ParsedStep("SCREENSHOT", "", "", raw, true);
        if (Pattern.compile("(?i)^scroll(\\s+down)?$").matcher(line).matches())
            return new ParsedStep("SCROLL", "", "", raw, true);
        return null;
    }

    // ---------------- execution ----------------

    public TestRunEntity launch(String testName, String url, String instructions) {
        TestRunEntity run = TestRunEntity.builder()
                .testName(StringUtils.hasText(testName) ? testName : "Smart flow: " + url)
                .status("RUNNING").executionTime(0L)
                .logs("Smart flow launched for " + url).build();
        TestRunEntity saved = testRuns.save(run);
        executeAsync(saved.getId(), url, instructions);
        return saved;
    }

    @Async("taskExecutor")
    protected void executeAsync(UUID runId, String url, String instructions) {
        long start = System.currentTimeMillis();
        StringBuilder logs = new StringBuilder();
        String status = "PASSED";
        String screenshotUrl = null;
        WebDriver driver = null;
        try {
            List<ParsedStep> steps = parse(instructions);
            if (steps.isEmpty()) throw new AssertionError("Koi step samajh nahi aaya — instructions khaali hai ya format galat");
            List<String> unknown = steps.stream().filter(s -> !s.understood()).map(ParsedStep::raw).toList();
            if (!unknown.isEmpty()) throw new AssertionError("Ye lines samajh nahi aayi, dobara simple words me likho: " + unknown);

            WebDriverManager.chromedriver().setup();
            ChromeOptions options = new ChromeOptions();
            options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1366,768");
            driver = new ChromeDriver(options);
            driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));

            boolean visited = false;
            if (StringUtils.hasText(url)) {
                driver.get(url);
                visited = true;
                logs.append("Opened ").append(url).append(" | title: ").append(driver.getTitle()).append("\n");
                Thread.sleep(2000);
            }

            int n = 0;
            for (ParsedStep s : steps) {
                n++;
                switch (s.action()) {
                    case "GOTO" -> {
                        driver.get(s.value());
                        visited = true;
                        Thread.sleep(2000);
                        logs.append("Step ").append(n).append(": opened ").append(s.value()).append("\n");
                    }
                    case "CLICK_TEXT" -> {
                        WebElement el = findClickableByText(driver, wait, s.target());
                        if (el == null) throw new AssertionError("Step " + n + ": '" + s.target() + "' naam ka button/link nahi mila");
                        el.click();
                        logs.append("Step ").append(n).append(": clicked '").append(s.target()).append("'\n");
                        Thread.sleep(1200);
                    }
                    case "TYPE_IN" -> {
                        WebElement field = findField(driver, s.target());
                        if (field == null) throw new AssertionError("Step " + n + ": '" + s.target() + "' naam ka field nahi mila");
                        field.clear();
                        field.sendKeys(s.value());
                        boolean secret = "password".equalsIgnoreCase(field.getAttribute("type"));
                        logs.append("Step ").append(n).append(": typed into '").append(s.target()).append("'")
                                .append(secret ? " (masked)" : "").append("\n");
                        Thread.sleep(400);
                    }
                    case "SELECT" -> {
                        WebElement dd = findField(driver, s.target());
                        if (dd == null || !"select".equalsIgnoreCase(dd.getTagName()))
                            throw new AssertionError("Step " + n + ": '" + s.target() + "' dropdown nahi mila");
                        new Select(dd).selectByVisibleText(s.value());
                        logs.append("Step ").append(n).append(": selected '").append(s.value()).append("' in '").append(s.target()).append("'\n");
                    }
                    case "CHECK", "UNCHECK" -> {
                        WebElement box = findCheckbox(driver, s.target());
                        if (box == null) throw new AssertionError("Step " + n + ": '" + s.target() + "' checkbox nahi mila");
                        boolean want = "CHECK".equals(s.action());
                        if (box.isSelected() != want) box.click();
                        logs.append("Step ").append(n).append(": ").append(want ? "checked" : "unchecked").append(" '").append(s.target()).append("'\n");
                    }
                    case "ASSERT_TEXT" -> {
                        String body = bodyText(driver);
                        if (body.toLowerCase().contains(s.value().toLowerCase())) {
                            logs.append("Step ").append(n).append(": verified '").append(s.value()).append("' dikha\n");
                        } else throw new AssertionError("Step " + n + ": '" + s.value() + "' page pe nahi dikha");
                    }
                    case "ASSERT_TITLE" -> {
                        String t = driver.getTitle();
                        if (t != null && t.toLowerCase().contains(s.value().toLowerCase())) {
                            logs.append("Step ").append(n).append(": title verified\n");
                        } else throw new AssertionError("Step " + n + ": title me '" + s.value() + "' nahi hai (title: " + t + ")");
                    }
                    case "ASSERT_URL" -> {
                        String u = driver.getCurrentUrl();
                        if (u != null && u.toLowerCase().contains(s.value().toLowerCase())) {
                            logs.append("Step ").append(n).append(": url verified: ").append(u).append("\n");
                        } else throw new AssertionError("Step " + n + ": url me '" + s.value() + "' nahi hai (url: " + u + ")");
                    }
                    case "WAIT" -> { Thread.sleep(Long.parseLong(s.value()) * 1000); logs.append("Step ").append(n).append(": waited ").append(s.value()).append("s\n"); }
                    case "SCREENSHOT" -> logs.append("Step ").append(n).append(": checkpoint\n");
                    case "SCROLL" -> {
                        ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, document.body.scrollHeight)");
                        Thread.sleep(800);
                        logs.append("Step ").append(n).append(": scrolled down\n");
                    }
                    default -> logs.append("Step ").append(n).append(": skipped\n");
                }
            }
            if (!visited) throw new AssertionError("Koi page open nahi hua — pehli line me 'open <url>' likho ya URL box bharo");
            logs.append("RESULT: PASSED — saare ").append(n).append(" steps ho gaye\n");

            try {
                byte[] shot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                screenshotUrl = storage.uploadBytes(shot, "flow_" + runId + ".png", "image/png", "forge-runs");
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
                    .rootCauseAnalysis("Smart flow failed\n" + run.getLogs())
                    .aiExplanation(triage.triageExplanation(run.getTestName(), severity, run.getLogs()))
                    .build());
        }
        try {
            messaging.convertAndSend("/topic/test-runs", (Object) run);
            messaging.convertAndSend("/topic/forge/" + runId, (Object) Map.of("runId", runId.toString(), "status", status));
        } catch (Exception ignored) {}
    }

    // ---------- text-based finders (no selectors needed) ----------

    private static final String LO = "abcdefghijklmnopqrstuvwxyz";
    private static final String UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private String ciContains(String field, String text) {
        String t = text.replace("'", "");
        return "contains(translate(normalize-space(" + field + "), '" + UP + "', '" + LO + "'), '" + t.toLowerCase() + "')";
    }

    private WebElement firstVisible(WebDriver driver, By by) {
        for (WebElement el : driver.findElements(by)) {
            try { if (el.isDisplayed() && el.isEnabled()) return el; } catch (Exception ignored) {}
        }
        return null;
    }

    /** Button/link jiska text user ne bola. */
    private WebElement findClickableByText(WebDriver driver, WebDriverWait wait, String text) {
        String xp = "//*[self::button or self::a or self::input[@type='submit' or @type='button']]";
        WebElement el = firstVisible(driver, By.xpath(xp + "[" + ciContains(".", text) + " or " + ciContains("@value", text) + " or " + ciContains("@aria-label", text) + "]"));
        if (el != null) return el;
        // fallback: koi bhi clickable jisme text ho (div styled as button)
        try {
            return wait.until(d -> {
                for (WebElement e : d.findElements(By.xpath("//*[self::div or self::span][" + ciContains(".", text) + "]"))) {
                    try {
                        if (e.isDisplayed() && e.isEnabled() && e.getText() != null && e.getText().trim().length() < 80) return e;
                    } catch (Exception ignored) {}
                }
                return null;
            });
        } catch (Exception e) {
            return null;
        }
    }

    /** Field jiska label / placeholder / naam user ne bola. */
    private WebElement findField(WebDriver driver, String label) {
        // 1. <label>text <input> ya <label for=id>
        for (WebElement lab : driver.findElements(By.xpath("//label[" + ciContains(".", label) + "]"))) {
            try {
                if (!lab.isDisplayed()) continue;
                String forId = lab.getAttribute("for");
                if (StringUtils.hasText(forId)) {
                    WebElement f = firstVisible(driver, By.id(forId));
                    if (f != null) return f;
                }
                WebElement inner = firstVisible(lab, By.xpath(".//input | .//select | .//textarea"));
                if (inner != null) return inner;
            } catch (Exception ignored) {}
        }
        // 2. placeholder / name / id / aria-label match
        String xp = "//*[self::input or self::select or self::textarea]";
        WebElement el = firstVisible(driver, By.xpath(xp + "[" + ciContains("@placeholder", label)
                + " or " + ciContains("@name", label) + " or " + ciContains("@id", label)
                + " or " + ciContains("@aria-label", label) + "]"));
        if (el != null) {
            try {
                String type = el.getAttribute("type");
                if ("hidden".equalsIgnoreCase(type) || "submit".equalsIgnoreCase(type)) return null;
            } catch (Exception ignored) {}
            return el;
        }
        // 3. fallback: pehla visible text jaisa input
        for (WebElement in : driver.findElements(By.cssSelector("input"))) {
            try {
                String type = String.valueOf(in.getAttribute("type")).toLowerCase();
                if (List.of("hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset").contains(type)) continue;
                if (in.isDisplayed() && in.isEnabled()) return in;
            } catch (Exception ignored) {}
        }
        return null;
    }

    private WebElement findCheckbox(WebDriver driver, String label) {
        for (WebElement lab : driver.findElements(By.xpath("//label[" + ciContains(".", label) + "]"))) {
            try {
                if (!lab.isDisplayed()) continue;
                String forId = lab.getAttribute("for");
                if (StringUtils.hasText(forId)) {
                    WebElement f = firstVisible(driver, By.id(forId));
                    if (f != null && "checkbox".equalsIgnoreCase(f.getAttribute("type"))) return f;
                }
                WebElement inner = firstVisible(lab, By.xpath(".//input[@type='checkbox']"));
                if (inner != null) return inner;
            } catch (Exception ignored) {}
        }
        return firstVisible(driver, By.xpath("//input[@type='checkbox'][" + ciContains("@name", label) + " or " + ciContains("@id", label) + "]"));
    }

    private WebElement firstVisible(WebElement ctx, By by) {
        for (WebElement el : ctx.findElements(by)) {
            try { if (el.isDisplayed() && el.isEnabled()) return el; } catch (Exception ignored) {}
        }
        return null;
    }

    private String bodyText(WebDriver driver) {
        try {
            String t = driver.findElement(By.cssSelector("body")).getText();
            if (t == null) return "";
            return t.length() > 4000 ? t.substring(0, 4000) : t;
        } catch (Exception e) {
            return "";
        }
    }
}
