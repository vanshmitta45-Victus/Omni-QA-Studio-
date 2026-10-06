package com.omniqa.studio.aitest;

import org.junit.platform.engine.discovery.DiscoverySelectors;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import org.junit.platform.launcher.listeners.TestExecutionSummary;
import org.springframework.stereotype.Service;

import javax.tools.*;
import java.io.*;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Service
public class TestExecutionService {

    public String compileAndRunTest(String javaCodeContent, String className) {
        if (javaCodeContent == null || javaCodeContent.isBlank()) {
            return "Execution Error: No Java code provided.";
        }
        if (className == null || className.isBlank()) {
            className = "DynamicTest";
        }

        // Sanitize and auto-heal known Selenium/JUnit syntax hallucinations
        javaCodeContent = sanitizeAndHealCode(javaCodeContent);

        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("selenium-sandbox-");
            File sourceFile = new File(tempDir.toFile(), className + ".java");

            try (FileWriter writer = new FileWriter(sourceFile, StandardCharsets.UTF_8)) {
                writer.write(javaCodeContent);
            }

            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            if (compiler == null) {
                return "Execution Error: No JavaCompiler available. Ensure the application runs under a JDK.";
            }

            DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
            StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8);

            String classpath = System.getProperty("java.class.path");
            List<String> options = List.of(
                    "-classpath", classpath,
                    "-proc:none",
                    "-d", tempDir.toAbsolutePath().toString()
            );

            Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjects(sourceFile);
            boolean success = compiler.getTask(null, fileManager, diagnostics, options, null, units).call();
            fileManager.close();

            if (!success) {
                StringBuilder errorReport = new StringBuilder("Compilation Failed:\n");
                for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                    if (d.getKind() == Diagnostic.Kind.ERROR) {
                        errorReport.append(String.format("• Line %d: %s\n",
                                d.getLineNumber(), d.getMessage(Locale.ENGLISH)));
                    }
                }
                return errorReport.toString().trim();
            }

            // Load compiled class with current thread's context classloader as parent
            ClassLoader parentClassLoader = Thread.currentThread().getContextClassLoader();
            try (URLClassLoader classLoader = URLClassLoader.newInstance(new URL[]{tempDir.toUri().toURL()}, parentClassLoader)) {
                Class<?> cls = Class.forName(className, true, classLoader);

                // 1. Check for standard main(String[]) method
                Method mainMethod = null;
                try {
                    mainMethod = cls.getMethod("main", String[].class);
                } catch (NoSuchMethodException ignored) {}

                if (mainMethod != null) {
                    ByteArrayOutputStream captureOut = new ByteArrayOutputStream();
                    PrintStream origOut = System.out;
                    PrintStream origErr = System.err;
                    try (PrintStream customPs = new PrintStream(captureOut, true, StandardCharsets.UTF_8)) {
                        System.setOut(customPs);
                        System.setErr(customPs);
                        mainMethod.invoke(null, (Object) new String[0]);
                    } finally {
                        System.setOut(origOut);
                        System.setErr(origErr);
                    }
                    String console = captureOut.toString(StandardCharsets.UTF_8).trim();
                    return "[MAIN EXECUTION COMPLETED]\n" + (console.isEmpty() ? "Class executed with no output." : console);
                }

                // 2. Otherwise execute as JUnit 5 suite
                LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request()
                        .selectors(DiscoverySelectors.selectClass(cls))
                        .build();

                Launcher launcher = LauncherFactory.create();
                SummaryGeneratingListener listener = new SummaryGeneratingListener();
                launcher.registerTestExecutionListeners(listener);

                ByteArrayOutputStream junitOut = new ByteArrayOutputStream();
                PrintStream origOut = System.out;
                PrintStream origErr = System.err;
                try (PrintStream customPs = new PrintStream(junitOut, true, StandardCharsets.UTF_8)) {
                    System.setOut(customPs);
                    System.setErr(customPs);
                    launcher.execute(request);
                } finally {
                    System.setOut(origOut);
                    System.setErr(origErr);
                }

                TestExecutionSummary summary = listener.getSummary();
                if (summary.getTestsFoundCount() > 0) {
                    StringBuilder summaryStr = new StringBuilder();
                    summaryStr.append(String.format(
                            "[JUNIT 5 SUITE RESULT]\nFound: %d | Succeeded: %d | Failed: %d | Skipped: %d | Duration: %d ms",
                            summary.getTestsFoundCount(),
                            summary.getTestsSucceededCount(),
                            summary.getTestsFailedCount(),
                            summary.getTestsSkippedCount(),
                            summary.getTimeFinished() - summary.getTimeStarted()
                    ));

                    if (!summary.getFailures().isEmpty()) {
                        summaryStr.append("\n\nFailures:");
                        for (TestExecutionSummary.Failure failure : summary.getFailures()) {
                            summaryStr.append("\n❌ ")
                                    .append(failure.getTestIdentifier().getDisplayName())
                                    .append(": ")
                                    .append(failure.getException().getMessage());
                        }
                    }

                    String stdout = junitOut.toString(StandardCharsets.UTF_8).trim();
                    if (!stdout.isEmpty()) {
                        summaryStr.append("\n\nConsole Output:\n").append(stdout);
                    }

                    return summaryStr.toString();
                }

                return "[SANDBOX] Class " + className + " compiled and verified successfully (no main() or JUnit @Test methods found).";
            }

        } catch (Exception e) {
            return "Execution Error: " + (e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
        } finally {
            if (tempDir != null) {
                deleteDirectoryRecursively(tempDir.toFile());
            }
        }
    }

    private void deleteDirectoryRecursively(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectoryRecursively(file);
                } else {
                    file.delete();
                }
            }
        }
        dir.delete();
    }

    public static String sanitizeAndHealCode(String code) {
        if (code == null || code.isBlank()) return "";
        String healed = code;

        // 1. Strip markdown code fence wrapper
        if (healed.contains("```")) {
            healed = healed.replaceAll("(?s)^.*?```(?:java)?\\s*", "");
            healed = healed.replaceAll("(?s)```.*$", "");
            healed = healed.trim();
        }

        // Collect variables already declared as Select (e.g. "Select select = ...").
        // These must NEVER be wrapped in another "new Select(...)" — that produces
        // "incompatible types: Select cannot be converted to WebElement".
        java.util.Set<String> selectVars = new java.util.HashSet<>();
        java.util.regex.Matcher selectDeclMatcher = java.util.regex.Pattern.compile("\\bSelect\\s+([A-Za-z0-9_]+)\\s*=").matcher(healed);
        while (selectDeclMatcher.find()) {
            selectVars.add(selectDeclMatcher.group(1));
        }

        // 2. Fix dropdown.selectOption(...) on WebElement with By.value or literal
        java.util.regex.Pattern selectOptionPattern = java.util.regex.Pattern.compile("([a-zA-Z0-9_]+)\\.selectOption\\s*\\((.*?)\\);");
        java.util.regex.Matcher soMatcher = selectOptionPattern.matcher(healed);
        if (soMatcher.find()) {
            StringBuffer sb = new StringBuffer();
            do {
                String varName = soMatcher.group(1);
                String arg = soMatcher.group(2).trim();
                java.util.regex.Matcher strMatcher = java.util.regex.Pattern.compile("([\"'][^\"']*?[\"'])").matcher(arg);
                String literal = strMatcher.find() ? strMatcher.group(1) : "\"Option 2\"";
                String replacement;
                if (selectVars.contains(varName)) {
                    // Already a Select: call directly instead of wrapping
                    replacement = literal.matches("[\"'][0-9]+[\"']")
                            ? varName + ".selectByValue(" + literal + ");"
                            : varName + ".selectByVisibleText(" + literal + ");";
                } else if (literal.matches("[\"'][0-9]+[\"']")) {
                    replacement = "new org.openqa.selenium.support.ui.Select(" + varName + ").selectByValue(" + literal + ");";
                } else {
                    replacement = "new org.openqa.selenium.support.ui.Select(" + varName + ").selectByVisibleText(" + literal + ");";
                }
                soMatcher.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(replacement));
            } while (soMatcher.find());
            soMatcher.appendTail(sb);
            healed = sb.toString();
        }

        // 3. Fix standalone By.value(...) hallucination -> By.cssSelector("option[value=...]")
        healed = healed.replaceAll("By\\.value\\(([\"'][^\"']*?[\"'])\\)", "By.cssSelector(\"option[value=\" + $1 + \"]\")");

        // 4. Fix x.selectByValue(...) / x.selectByVisibleText(...) on WebElement without Select instance
        //    (skip variables already declared as Select — wrapping them breaks compilation)
        healed = wrapSelectCall(healed, selectVars, "selectByValue");
        healed = wrapSelectCall(healed, selectVars, "selectByVisibleText");

        // 4b. Repair previously corrupted code: new Select(selectVar).method(...) -> selectVar.method(...)
        healed = unwrapNestedSelect(healed, selectVars);

        // 5. Fix driver.manage().implicitlyWait(...) missing .timeouts()
        if (healed.contains(".manage().implicitlyWait(")) {
            healed = healed.replace(".manage().implicitlyWait(", ".manage().timeouts().implicitlyWait(");
        }

        // 6. Auto-heal missing imports
        if (healed.contains("Select") && !healed.contains("import org.openqa.selenium.support.ui.Select;")) {
            healed = "import org.openqa.selenium.support.ui.Select;\n" + healed;
        }
        if ((healed.contains("assertEquals(") || healed.contains("assertTrue(") || healed.contains("assertFalse(") || healed.contains("assertNotNull("))
                && !healed.contains("org.junit.jupiter.api.Assertions")) {
            healed = "import static org.junit.jupiter.api.Assertions.*;\n" + healed;
        }
        if (healed.contains("Duration.of") && !healed.contains("import java.time.Duration;")) {
            healed = "import java.time.Duration;\n" + healed;
        }
        if (healed.contains("WebElement") && !healed.contains("import org.openqa.selenium.WebElement;")) {
            healed = "import org.openqa.selenium.WebElement;\n" + healed;
        }
        if (healed.contains("WebDriverWait") && !healed.contains("import org.openqa.selenium.support.ui.WebDriverWait;")) {
            healed = "import org.openqa.selenium.support.ui.WebDriverWait;\n" + healed;
        }
        if (healed.contains("ExpectedConditions") && !healed.contains("import org.openqa.selenium.support.ui.ExpectedConditions;")) {
            healed = "import org.openqa.selenium.support.ui.ExpectedConditions;\n" + healed;
        }
        if (healed.contains("WebDriver") && !healed.contains("import org.openqa.selenium.WebDriver;")) {
            healed = "import org.openqa.selenium.WebDriver;\n" + healed;
        }
        if (healed.contains("By.") && !healed.contains("import org.openqa.selenium.By;")) {
            healed = "import org.openqa.selenium.By;\n" + healed;
        }
        if (healed.contains("ChromeDriver") && !healed.contains("import org.openqa.selenium.chrome.ChromeDriver;")) {
            healed = "import org.openqa.selenium.chrome.ChromeDriver;\n" + healed;
        }
        if (healed.contains("ChromeOptions") && !healed.contains("import org.openqa.selenium.chrome.ChromeOptions;")) {
            healed = "import org.openqa.selenium.chrome.ChromeOptions;\n" + healed;
        }
        if (healed.contains("@BeforeEach") && !healed.contains("import org.junit.jupiter.api.BeforeEach;")) {
            healed = "import org.junit.jupiter.api.BeforeEach;\n" + healed;
        }
        if (healed.contains("@AfterEach") && !healed.contains("import org.junit.jupiter.api.AfterEach;")) {
            healed = "import org.junit.jupiter.api.AfterEach;\n" + healed;
        }
        if (healed.contains("@Test") && !healed.contains("import org.junit.jupiter.api.Test;")) {
            healed = "import org.junit.jupiter.api.Test;\n" + healed;
        }

        // Auto-heal missing @Test annotation if test method is present
        if (!healed.contains("@Test") && healed.matches("(?s).*public\\s+void\\s+test[A-Za-z0-9_]*\\s*\\(.*")) {
            healed = healed.replaceAll("(public\\s+void\\s+test[A-Za-z0-9_]*\\s*\\()", "@Test\n    $1");
            if (!healed.contains("import org.junit.jupiter.api.Test;")) {
                healed = "import org.junit.jupiter.api.Test;\n" + healed;
            }
        }

        return healed;
    }

    /**
     * Wraps {@code varName.method(...)} in a {@code new Select(varName)} instance,
     * except when {@code varName} is already declared as a {@code Select} — wrapping
     * those again produces "incompatible types: Select cannot be converted to WebElement".
     */
    static String wrapSelectCall(String code, java.util.Set<String> selectVars, String method) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "(?<!new\\s+Select\\()([a-zA-Z0-9_]+)\\." + method + "\\s*\\((.*?)\\);").matcher(code);
        StringBuffer sb = new StringBuffer();
        boolean found = false;
        while (m.find()) {
            found = true;
            String varName = m.group(1);
            if (selectVars.contains(varName)) {
                m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(m.group(0)));
            } else {
                m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(
                        "new org.openqa.selenium.support.ui.Select(" + varName + ")." + method + "(" + m.group(2) + ");"));
            }
        }
        if (!found) return code;
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Repairs previously corrupted code such as
     * {@code new Select(select).selectByVisibleText(...)} (or the fully-qualified
     * form) where {@code select} is already a {@code Select} variable.
     */
    static String unwrapNestedSelect(String code, java.util.Set<String> selectVars) {
        if (selectVars == null || selectVars.isEmpty()) return code;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "new\\s+(?:org\\.openqa\\.selenium\\.support\\.ui\\.)?Select\\s*\\(\\s*([A-Za-z0-9_]+)\\s*\\)\\s*\\.").matcher(code);
        StringBuffer sb = new StringBuffer();
        boolean found = false;
        while (m.find()) {
            found = true;
            if (selectVars.contains(m.group(1))) {
                m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(m.group(1) + "."));
            } else {
                m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(m.group(0)));
            }
        }
        if (!found) return code;
        m.appendTail(sb);
        return sb.toString();
    }
}