package com.omniqa.automation.api;

import com.omniqa.automation.config.ConfigReader;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;

import java.util.HashMap;
import java.util.Map;

public class OmniQaApiClient {

    private final String apiBaseUrl;

    public OmniQaApiClient() {
        this.apiBaseUrl = ConfigReader.getProperty("api.base.url", "http://localhost:8080/api");
    }

    public OmniQaApiClient(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }

    /**
     * Registers a new user via API before running UI flows.
     */
    public Response registerUser(String username, String email, String password, String role) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("username", username);
        payload.put("email", email);
        payload.put("password", password);
        payload.put("role", role);

        return RestAssured.given()
                .baseUri(apiBaseUrl)
                .contentType(ContentType.JSON)
                .body(payload)
                .when()
                .post("/auth/register");
    }

    /**
     * Authenticates credentials via API and extracts the JWT bearer token.
     */
    public String loginAndGetToken(String username, String password) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("username", username);
        payload.put("password", password);

        Response response = RestAssured.given()
                .baseUri(apiBaseUrl)
                .contentType(ContentType.JSON)
                .body(payload)
                .when()
                .post("/auth/login");

        if (response.getStatusCode() == 200) {
            return response.jsonPath().getString("token");
        }
        return null;
    }

    /**
     * Directly posts an automated test run result to OmniQA Studio backend.
     * Sends X-SERVICE-KEY when SERVICE_API_KEY env is set (prod).
     */
    public Response recordTestRun(String testName, String status, long executionTime, String logs, String screenshotUrl) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("testName", testName);
        payload.put("status", status);
        payload.put("executionTime", executionTime);
        payload.put("logs", logs);
        payload.put("screenshotUrl", screenshotUrl);

        String serviceKey = System.getenv().getOrDefault("SERVICE_API_KEY", "");

        var spec = RestAssured.given()
                .baseUri(apiBaseUrl)
                .contentType(ContentType.JSON);
        if (!serviceKey.isBlank()) {
            spec = spec.header("X-SERVICE-KEY", serviceKey);
        }
        return spec.body(payload).when().post("/test-runs");
    }

    /**
     * Creates a team or personal note via API for test fixture setup.
     */
    public Response createNote(String jwtToken, String title, String content, boolean isShared) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("title", title);
        payload.put("content", content);
        payload.put("isShared", isShared);

        return RestAssured.given()
                .baseUri(apiBaseUrl)
                .header("Authorization", "Bearer " + jwtToken)
                .contentType(ContentType.JSON)
                .body(payload)
                .when()
                .post("/notes");
    }

    /**
     * Hybrid Injection: Injects an authenticated JWT session directly into the browser's
     * localStorage, bypassing UI login screens and accelerating test execution by 10x.
     */
    public void injectAuthSessionToBrowser(WebDriver driver, String appUrl, String jwtToken, String username, String role) {
        driver.get(appUrl);

        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("localStorage.setItem('token', arguments[0]);", jwtToken);
        js.executeScript("localStorage.setItem('user', JSON.stringify({username: arguments[0], role: arguments[1]}));", username, role);

        // Refresh to apply session
        driver.navigate().refresh();
    }
}
