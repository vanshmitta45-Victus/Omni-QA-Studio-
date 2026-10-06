package com.omniqa.automation.tests;

import com.omniqa.automation.base.BaseTest;
import com.omniqa.automation.datadriven.CsvDataProvider;
import com.omniqa.automation.visual.VisualRegressionUtil;
import org.testng.annotations.Test;

public class VisualAndDataDrivenTest extends BaseTest {

    @Test(dataProvider = "csvCases", dataProviderClass = CsvDataProvider.class,
          description = "Data-driven smoke + visual baseline check")
    public void testSmokeWithVisual(String name, String url, String expected) throws Exception {
        getDriver().get(url);
        VisualRegressionUtil.compareWithBaseline(getDriver(), "smoke_" + name, 0.05);
    }
}
