package com.omniqa.automation.reporter;

import com.omniqa.automation.api.OmniQaApiClient;
import com.omniqa.automation.driver.DriverManager;
import org.apache.commons.io.FileUtils;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.testng.ITestContext;
import org.testng.ITestListener;
import org.testng.ITestResult;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;

public class OmniQaTestReporter implements ITestListener {

    private final OmniQaApiClient apiClient = new OmniQaApiClient();
    private final ThreadLocal<Long> startTime = new ThreadLocal<>();

    @Override
    public void onTestStart(ITestResult result) {
        startTime.set(System.currentTimeMillis());
        System.out.println(">>> [OmniQA Engine] Starting Test: " + result.getMethod().getMethodName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        long duration = calculateDuration();
        String testName = getTestIdentifier(result);
        String logs = "Test executed successfully in " + duration + " ms.";

        System.out.println(">>> [OmniQA Engine] Test PASSED: " + testName + " (" + duration + " ms)");

        try {
            apiClient.recordTestRun(testName, "PASSED", duration, logs, null);
        } catch (Exception ex) {
            System.err.println("Warning: Could not post test results to backend: " + ex.getMessage());
        }
    }

    @Override
    public void onTestFailure(ITestResult result) {
        long duration = calculateDuration();
        String testName = getTestIdentifier(result);

        StringWriter sw = new StringWriter();
        if (result.getThrowable() != null) {
            result.getThrowable().printStackTrace(new PrintWriter(sw));
        }
        String logs = sw.toString();

        // Capture screenshot from active WebDriver instance
        String screenshotPath = null;
        WebDriver driver = DriverManager.getDriver();
        if (driver != null) {
            screenshotPath = captureScreenshot(driver, result.getMethod().getMethodName());
        }

        System.err.println(">>> [OmniQA Engine] Test FAILED: " + testName + " (" + duration + " ms)");
        if (screenshotPath != null) {
            System.out.println(">>> Failure screenshot captured: " + screenshotPath);
        }

        try {
            apiClient.recordTestRun(testName, "FAILED", duration, logs, screenshotPath);
        } catch (Exception ex) {
            System.err.println("Warning: Could not post failed test results to backend: " + ex.getMessage());
        }
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        long duration = calculateDuration();
        String testName = getTestIdentifier(result);
        String reason = (result.getThrowable() != null) ? result.getThrowable().getMessage() : "Pre-condition failed or ignored";

        System.out.println(">>> [OmniQA Engine] Test SKIPPED: " + testName + " Reason: " + reason);

        try {
            apiClient.recordTestRun(testName, "SKIPPED", duration, "Skipped: " + reason, null);
        } catch (Exception ex) {
            System.err.println("Warning: Could not post skipped test results to backend: " + ex.getMessage());
        }
    }

    @Override
    public void onStart(ITestContext context) {
        System.out.println("==================================================");
        System.out.println("  OMNIQA AUTOMATION TEST EXECUTION STARTED        ");
        System.out.println("  Suite: " + context.getName());
        System.out.println("==================================================");
    }

    @Override
    public void onFinish(ITestContext context) {
        System.out.println("==================================================");
        System.out.println("  OMNIQA AUTOMATION TEST EXECUTION FINISHED       ");
        System.out.println("  Passed: " + context.getPassedTests().size() +
                           " | Failed: " + context.getFailedTests().size() +
                           " | Skipped: " + context.getSkippedTests().size());
        System.out.println("==================================================");
    }

    private long calculateDuration() {
        Long start = startTime.get();
        return (start != null) ? (System.currentTimeMillis() - start) : 0L;
    }

    private String getTestIdentifier(ITestResult result) {
        return result.getTestClass().getRealClass().getSimpleName() + "." + result.getMethod().getMethodName();
    }

    private String captureScreenshot(WebDriver driver, String methodName) {
        try {
            File srcFile = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            String destPath = "target/screenshots/" + methodName + "_" + timestamp + ".png";
            File destFile = new File(destPath);
            FileUtils.copyFile(srcFile, destFile);
            return destFile.getAbsolutePath();
        } catch (Exception e) {
            System.err.println("Failed to capture screenshot: " + e.getMessage());
            return null;
        }
    }
}
