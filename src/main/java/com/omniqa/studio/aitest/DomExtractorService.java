package com.omniqa.studio.aitest;

import io.github.bonigarcia.wdm.WebDriverManager;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.openqa.selenium.By;
import org.openqa.selenium.PageLoadStrategy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * DOM extraction (merged from Autonomous/DomExtractorService).
 * Fast JSoup fetch with retry, headless Chrome fallback for JS pages.
 */
@Service
public class DomExtractorService {

    private static final int MAX_DOM_LENGTH = 25000;
    private static final String REAL_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    public String extractCleanDom(String targetUrl) {
        Exception httpFailure = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                Document httpDoc = Jsoup.connect(targetUrl)
                        .userAgent(REAL_USER_AGENT)
                        .timeout(20000)
                        .followRedirects(true)
                        .ignoreHttpErrors(true)
                        .get();
                String html = httpDoc.body() != null ? httpDoc.body().html() : httpDoc.html();
                String cleaned = cleanDomSnippet(html);
                if (cleaned != null && !cleaned.isBlank()) {
                    return cleaned;
                }
            } catch (Exception httpEx) {
                httpFailure = httpEx;
                System.err.println("DOM HTTP fetch attempt " + attempt + "/3 failed for " + targetUrl + ": " + httpEx.getMessage());
                try {
                    Thread.sleep(3000L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        ChromeOptions options = new ChromeOptions();
        options.setPageLoadStrategy(PageLoadStrategy.EAGER);
        options.addArguments(
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--remote-allow-origins=*",
                "--window-size=1920,1080",
                "--disable-blink-features=AutomationControlled",
                "--user-agent=" + REAL_USER_AGENT,
                "--blink-settings=imagesEnabled=false");

        WebDriver driver = null;
        try {
            try {
                WebDriverManager.chromedriver().setup();
            } catch (Exception ignored) {}
            driver = new ChromeDriver(options);
            driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(10));
            driver.manage().timeouts().scriptTimeout(Duration.ofSeconds(10));
            driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(2));
            driver.get(targetUrl);
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(6));
            WebElement body = wait.until(webDriver -> webDriver.findElement(By.tagName("body")));
            String rawDom = body.getAttribute("innerHTML");
            return cleanDomSnippet(rawDom);
        } catch (Exception chromeEx) {
            String detail = "HTTP fetch"
                    + (httpFailure != null ? " failed (" + httpFailure.getMessage() + ")" : " returned empty")
                    + "; headless Chrome failed (" + chromeEx.getMessage() + ")";
            throw new RuntimeException("Failed to extract DOM from " + targetUrl + ": " + detail, chromeEx);
        } finally {
            if (driver != null) {
                try {
                    driver.quit();
                } catch (Exception ignored) {}
            }
        }
    }

    public String cleanDomSnippet(String rawHtml) {
        if (rawHtml == null || rawHtml.isBlank()) {
            return "";
        }
        Document doc = Jsoup.parse(rawHtml);
        doc.select("script, style, svg, noscript, link, iframe, meta, template").remove();
        doc.select("img[src^=data:]").attr("src", "[image-data]");
        String cleanHtml = doc.body() != null ? doc.body().html() : doc.html();
        cleanHtml = cleanHtml.replaceAll("(?m)^\\s+$", "").trim();
        if (cleanHtml.length() > MAX_DOM_LENGTH) {
            cleanHtml = cleanHtml.substring(0, MAX_DOM_LENGTH) + "\n<!-- [DOM Snippet Truncated for AI Context Limit] -->";
        }
        return cleanHtml;
    }
}
