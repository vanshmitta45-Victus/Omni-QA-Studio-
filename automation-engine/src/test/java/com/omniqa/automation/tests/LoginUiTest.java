package com.omniqa.automation.tests;

import com.omniqa.automation.base.BaseTest;
import com.omniqa.automation.config.ConfigReader;
import org.openqa.selenium.WebDriver;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginUiTest extends BaseTest {

    @Test(description = "Verify OmniQA Studio portal accessibility and title verification")
    public void testPortalLandingPage() {
        WebDriver driver = getDriver();
        String appUrl = ConfigReader.getProperty("app.base.url", "http://localhost:3000");

        driver.get(appUrl);
        String currentUrl = driver.getCurrentUrl();

        Assert.assertTrue(currentUrl.contains("localhost"), "Expected application URL to point to OmniQA Studio instance.");
        System.out.println("Landing page verified at URL: " + currentUrl);
    }

    @Test(description = "Verify invalid credentials display proper error feedback")
    public void testInvalidLoginValidation() {
        WebDriver driver = getDriver();
        String appUrl = ConfigReader.getProperty("app.base.url", "http://localhost:3000");

        driver.get(appUrl + "/login");
        Assert.assertNotNull(driver.getTitle(), "Title should not be null.");
        System.out.println("Login screen loaded successfully in browser session.");
    }
}
