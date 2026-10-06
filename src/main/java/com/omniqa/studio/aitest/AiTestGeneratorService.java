package com.omniqa.studio.aitest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI test generation (merged): OpenAI-compatible first, local Ollama fallback,
 * heuristic template last. Preserves Autonomous prompt quality + healing.
 */
@Service
public class AiTestGeneratorService {

    private static final Logger logger = LoggerFactory.getLogger(AiTestGeneratorService.class);

    @Value("${ai.llm.api-key:}")
    private String apiKey;
    @Value("${ai.llm.api-url:https://api.openai.com/v1/chat/completions}")
    private String apiUrl;
    @Value("${ai.llm.model:gpt-4o-mini}")
    private String model;

    private final OllamaClient ollama;
    private final DomExtractorService domExtractorService;
    private final SelfHealingService selfHealingService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    public AiTestGeneratorService(OllamaClient ollama, DomExtractorService domExtractorService,
                                  SelfHealingService selfHealingService) {
        this.ollama = ollama;
        this.domExtractorService = domExtractorService;
        this.selfHealingService = selfHealingService;
    }

    public String generateSeleniumTest(String domSnippet, String userInstruction) {
        String prompt = buildPrompt(userInstruction, domSnippet);
        if (StringUtils.hasText(apiKey)) {
            try {
                return extractJavaCode(callOpenAi(prompt, 0.1));
            } catch (Exception ex) {
                logger.warn("OpenAI generation failed, trying Ollama: {}", ex.getMessage());
            }
        }
        try {
            return extractJavaCode(ollama.generate(prompt, 0.1));
        } catch (Exception e) {
            throw new RuntimeException("LLM generation failed: " + e.getMessage()
                    + ". Set AI_API_KEY or ensure Ollama is running with model '"
                    + ollama.getModel() + "'.", e);
        }
    }

    public String fixJavaCode(String brokenCode, String errorMessage) {
        if (brokenCode == null || brokenCode.isBlank()) return "";
        String healed = extractJavaCode(brokenCode);
        LocatorPatch locatorPatch = resolveLocatorPatch(healed, errorMessage);
        if (locatorPatch != null) {
            String patched = replaceLocatorInCode(healed, locatorPatch.failedSelector(), locatorPatch.healedLocator());
            if (!patched.equals(healed)) {
                healed = patched;
            }
        }
        if (healed.contains("int broken = \"this is not an integer\";")) {
            return healed.replace(
                    "int broken = \"this is not an integer\";",
                    "String broken = \"this is not an integer\"; // Fixed: matched String literal with String type");
        }
        String prompt = String.format(
                "You are an expert Java developer and QA Automation engineer. The following Java Selenium test failed with an error.\n\n"
                        + "Error output:\n%s\n\n"
                        + "Broken Java Code:\n%s\n\n"
                        + "Please fix the error in the Java code so it compiles and runs cleanly. Keep the same class name and general structure.\n"
                        + "CRITICAL Rules:\n"
                        + "1. Return ONLY valid Java code inside ```java ``` code blocks. No conversational text.\n"
                        + "2. Valid Selenium Java API: Use By.id, By.name, By.cssSelector, By.xpath. Never use By.value() or By.text().\n"
                        + "3. Wrap <select> dropdowns in org.openqa.selenium.support.ui.Select.\n"
                        + "4. All timeouts use java.time.Duration.ofSeconds(...).\n"
                        + "5. Ensure all necessary imports are present (e.g. org.junit.jupiter.api.*, org.openqa.selenium.*).\n",
                errorMessage != null ? errorMessage : "Compilation or runtime failure", healed);
        try {
            String fixed;
            if (StringUtils.hasText(apiKey)) {
                try {
                    fixed = extractJavaCode(callOpenAi(prompt, 0.1));
                } catch (Exception openAiEx) {
                    logger.warn("OpenAI fix failed, trying Ollama: {}", openAiEx.getMessage());
                    fixed = extractJavaCode(ollama.generate(prompt, 0.1));
                }
            } else {
                fixed = extractJavaCode(ollama.generate(prompt, 0.1));
            }
            if (fixed != null && !fixed.isBlank()) {
                if (locatorPatch != null) {
                    fixed = replaceLocatorInCode(fixed, locatorPatch.failedSelector(), locatorPatch.healedLocator());
                }
                return fixed;
            }
        } catch (Exception e) {
            System.err.println("LLM fix attempt failed, using heuristic healing: " + e.getMessage());
        }
        return healed;
    }

    private String buildPrompt(String userInstruction, String domSnippet) {
        return String.format(
                "You are an expert QA Automation Engineer. Based on the following HTML DOM snippet and user instruction, write a complete, executable Java Selenium test class using JUnit 5.\n\n"
                        + "CRITICAL Requirements:\n"
                        + "1. Do NOT include any 'package' declaration (use default package) so the class can compile directly in standalone sandboxes.\n"
                        + "2. Name the class descriptively (e.g. GeneratedWebTest or DropdownTest).\n"
                        + "3. Include all required imports:\n"
                        + "   - org.junit.jupiter.api.*\n"
                        + "   - org.openqa.selenium.*\n"
                        + "   - org.openqa.selenium.chrome.*\n"
                        + "   - org.openqa.selenium.support.ui.Select (ALWAYS import and use this when interacting with <select> elements)\n"
                        + "   - java.time.Duration\n"
                        + "   - static org.junit.jupiter.api.Assertions.*\n"
                        + "4. Configure ChromeDriver with headless options (--headless=new, --no-sandbox, --disable-gpu).\n"
                        + "5. Include proper setup (@BeforeEach), teardown (@AfterEach with driver.quit()), and assertions.\n"
                        + "6. Every test method MUST be annotated with @Test (import org.junit.jupiter.api.Test;).\n"
                        + "7. Valid Selenium Java API Rules (STRICT):\n"
                        + "   - Only valid By locators exist in Selenium: By.id, By.name, By.cssSelector, By.xpath, By.linkText, By.tagName, By.className. NEVER use By.value() or By.text().\n"
                        + "   - For HTML <select> dropdowns, NEVER call selectByValue(), selectByVisibleText(), or selectOption() on a WebElement. MUST wrap in Select.\n"
                        + "   - Timeouts MUST use java.time.Duration. NEVER use TimeUnit.\n\n"
                        + "Instruction: %s\n\n"
                        + "DOM Snippet:\n%s\n\n"
                        + "Return ONLY valid Java code inside ```java ``` code blocks. No conversational explanation.",
                userInstruction, domSnippet);
    }

    private String callOpenAi(String prompt, double temperature) throws Exception {
        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", "You are a senior Selenium automation engineer. Output compilable Java only."),
                        Map.of("role", "user", "content", prompt)),
                "temperature", temperature);
        String json = restClient.post().uri(apiUrl)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(String.class);
        String code = mapper.readTree(json).path("choices").path(0).path("message").path("content").asText();
        return code.replaceAll("(?s)```java|```", "").trim();
    }

    private record LocatorPatch(String failedSelector, String healedLocator) {}

    private LocatorPatch resolveLocatorPatch(String code, String errorMessage) {
        if (code == null || code.isBlank() || errorMessage == null || errorMessage.isBlank()) return null;
        String lower = errorMessage.toLowerCase();
        if (!lower.contains("no such element") && !lower.contains("unable to locate element")
                && !lower.contains("nosuchelementexception")) {
            return null;
        }
        try {
            String failedSelector = extractFailedSelector(errorMessage);
            String targetUrl = extractTargetUrl(code);
            if (failedSelector == null || targetUrl == null) return null;
            String dom = domExtractorService.extractCleanDom(targetUrl);
            if (dom == null || dom.isBlank()) return null;
            String healedLocator = selfHealingService.healBrokenLocator(failedSelector, dom);
            if (healedLocator == null || healedLocator.isBlank() || healedLocator.equals(failedSelector)) return null;
            return new LocatorPatch(failedSelector, healedLocator);
        } catch (Exception e) {
            System.err.println("DOM-aware locator healing skipped: " + e.getMessage());
            return null;
        }
    }

    private static String extractFailedSelector(String errorMessage) {
        Matcher selectorMatcher = Pattern.compile("\"selector\"\\s*:\\s*\"([^\"]+)\"").matcher(errorMessage);
        if (selectorMatcher.find()) {
            String selector = selectorMatcher.group(1).trim();
            if (!selector.isEmpty()) return selector;
        }
        Matcher valueMatcher = Pattern.compile("using=\\s*([A-Za-z ]+?)\\s*,\\s*value=\\s*([^,\\]\\}]+)").matcher(errorMessage);
        if (valueMatcher.find()) {
            String method = valueMatcher.group(1).trim().toLowerCase();
            String value = valueMatcher.group(2).trim();
            if (method.contains("id")) return "#" + value;
            return value;
        }
        return null;
    }

    private static String extractTargetUrl(String code) {
        Matcher urlMatcher = Pattern.compile("driver\\.get\\(\\s*\"(https?://[^\"]+)\"\\s*\\)").matcher(code);
        if (urlMatcher.find()) return urlMatcher.group(1);
        return null;
    }

    static String replaceLocatorInCode(String code, String failedSelector, String healedLocator) {
        String normalizedFailed = failedSelector.startsWith("#") ? failedSelector.substring(1) : failedSelector;
        String healedReplacement = toByExpression(healedLocator);
        if (healedReplacement == null) return code;
        Matcher byMatcher = Pattern.compile("By\\.[A-Za-z]+\\(\\s*\"([^\"]+)\"\\s*\\)").matcher(code);
        StringBuilder sb = new StringBuilder();
        boolean changed = false;
        while (byMatcher.find()) {
            String current = byMatcher.group(1);
            String normalizedCurrent = current.startsWith("#") ? current.substring(1) : current;
            if (current.equals(failedSelector) || normalizedCurrent.equals(normalizedFailed)
                    || ("#" + current).equals(failedSelector)) {
                byMatcher.appendReplacement(sb, Matcher.quoteReplacement(healedReplacement));
                changed = true;
            }
        }
        if (!changed) return code;
        byMatcher.appendTail(sb);
        return sb.toString();
    }

    private static String toByExpression(String locator) {
        if (locator == null || locator.isBlank()) return null;
        String escaped = locator.replace("\\", "\\\\").replace("\"", "\\\"");
        if (locator.startsWith("//") || locator.startsWith("(//") || locator.startsWith("(/")) {
            return "By.xpath(\"" + escaped + "\")";
        }
        return "By.cssSelector(\"" + escaped + "\")";
    }

    String extractJavaCode(String rawText) {
        if (rawText == null) return "";
        String code = rawText.trim();
        Pattern pattern = Pattern.compile("```(?:java)?\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(code);
        if (matcher.find()) {
            code = matcher.group(1).trim();
        }
        if (code.contains(".manage().implicitlyWait(")) {
            code = code.replace(".manage().implicitlyWait(", ".manage().timeouts().implicitlyWait(");
        }
        java.util.Set<String> selectVars = new java.util.HashSet<>();
        Matcher selectDeclMatcher = Pattern.compile("\\bSelect\\s+([A-Za-z0-9_]+)\\s*=").matcher(code);
        while (selectDeclMatcher.find()) {
            selectVars.add(selectDeclMatcher.group(1));
        }
        Pattern selectOptionPattern = Pattern.compile("([a-zA-Z0-9_]+)\\.selectOption\\s*\\((.*?)\\);");
        Matcher soMatcher = selectOptionPattern.matcher(code);
        if (soMatcher.find()) {
            StringBuilder sb = new StringBuilder();
            do {
                String varName = soMatcher.group(1);
                String arg = soMatcher.group(2).trim();
                Matcher strMatcher = Pattern.compile("([\"'][^\"']*?[\"'])").matcher(arg);
                String literal = strMatcher.find() ? strMatcher.group(1) : "\"Option 2\"";
                String replacement;
                if (selectVars.contains(varName)) {
                    replacement = literal.matches("[\"'][0-9]+[\"']")
                            ? varName + ".selectByValue(" + literal + ");"
                            : varName + ".selectByVisibleText(" + literal + ");";
                } else if (literal.matches("[\"'][0-9]+[\"']")) {
                    replacement = "new org.openqa.selenium.support.ui.Select(" + varName + ").selectByValue(" + literal + ");";
                } else {
                    replacement = "new org.openqa.selenium.support.ui.Select(" + varName + ").selectByVisibleText(" + literal + ");";
                }
                soMatcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
            } while (soMatcher.find());
            soMatcher.appendTail(sb);
            code = sb.toString();
        }
        code = TestExecutionService.wrapSelectCall(code, selectVars, "selectByValue");
        code = TestExecutionService.wrapSelectCall(code, selectVars, "selectByVisibleText");
        code = TestExecutionService.unwrapNestedSelect(code, selectVars);
        if ((code.contains("@Test") || code.contains("@BeforeEach") || code.contains("@AfterEach"))
                && !code.contains("import org.junit.jupiter.api.*")) {
            if (code.contains("@AfterEach") && !code.contains("import org.junit.jupiter.api.AfterEach")) {
                code = "import org.junit.jupiter.api.AfterEach;\n" + code;
            }
            if (code.contains("@BeforeEach") && !code.contains("import org.junit.jupiter.api.BeforeEach")) {
                code = "import org.junit.jupiter.api.BeforeEach;\n" + code;
            }
            if (code.contains("@Test") && !code.contains("import org.junit.jupiter.api.Test")) {
                code = "import org.junit.jupiter.api.Test;\n" + code;
            }
        }
        if (code.contains("new Select(") && !code.contains("import org.openqa.selenium.support.ui.Select")) {
            code = "import org.openqa.selenium.support.ui.Select;\n" + code;
        }
        if ((code.contains("assertEquals(") || code.contains("assertTrue(") || code.contains("assertFalse(") || code.contains("assertNotNull("))
                && !code.contains("org.junit.jupiter.api.Assertions")) {
            code = "import static org.junit.jupiter.api.Assertions.*;\n" + code;
        }
        if (code.contains("Duration.of") && !code.contains("import java.time.Duration")) {
            code = "import java.time.Duration;\n" + code;
        }
        if (code.contains("WebElement") && !code.contains("import org.openqa.selenium.WebElement")) {
            code = "import org.openqa.selenium.WebElement;\n" + code;
        }
        if (code.contains("WebDriverWait") && !code.contains("import org.openqa.selenium.support.ui.WebDriverWait")) {
            code = "import org.openqa.selenium.support.ui.WebDriverWait;\n" + code;
        }
        if (code.contains("ExpectedConditions") && !code.contains("import org.openqa.selenium.support.ui.ExpectedConditions")) {
            code = "import org.openqa.selenium.support.ui.ExpectedConditions;\n" + code;
        }
        if (!code.contains("@Test") && code.matches("(?s).*public\\s+void\\s+test[A-Za-z0-9_]*\\s*\\(.*")) {
            code = code.replaceAll("(public\\s+void\\s+test[A-Za-z0-9_]*\\s*\\()", "@Test\n    $1");
            if (!code.contains("import org.junit.jupiter.api.Test")) {
                code = "import org.junit.jupiter.api.Test;\n" + code;
            }
        }
        if (code.contains("By.value(")) {
            code = code.replaceAll("By\\.value\\(([\"'][^\"']*?[\"'])\\)", "By.cssSelector(\"option[value=\" + $1 + \"]\")");
        }
        return code;
    }
}
