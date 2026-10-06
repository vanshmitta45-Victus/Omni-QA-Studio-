package com.omniqa.automation.base;

import com.omniqa.automation.config.ConfigReader;
import com.omniqa.automation.driver.DriverFactory;
import com.omniqa.automation.driver.DriverManager;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Optional;
import org.testng.annotations.Parameters;

public abstract class BaseTest {

    @BeforeMethod(alwaysRun = true)
    @Parameters({"browser", "headless"})
    public void setUp(@Optional("") String browser, @Optional("") String headless) {
        String browserName = (browser != null && !browser.isBlank()) ?
                browser : ConfigReader.getProperty("browser", "chrome");

        boolean isHeadless = (headless != null && !headless.isBlank()) ?
                Boolean.parseBoolean(headless) : Boolean.parseBoolean(ConfigReader.getProperty("headless", "true"));

        WebDriver driver = DriverFactory.createDriver(browserName, isHeadless);
        DriverManager.setDriver(driver);
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        DriverManager.quitDriver();
    }

    public WebDriver getDriver() {
        return DriverManager.getDriver();
    }
}
