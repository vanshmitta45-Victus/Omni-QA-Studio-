package com.omniqa.automation.datadriven;

import org.testng.annotations.DataProvider;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * CSV data-driven provider. Place files in src/test/resources/datasets/*.csv
 * First row = header, remaining rows = cases. Empty file -> single smoke case.
 */
public final class CsvDataProvider {

    private CsvDataProvider() {}

    @DataProvider(name = "csvCases", parallel = true)
    public static Object[][] csvCases() throws Exception {
        var path = Paths.get("src/test/resources/datasets/smoke.csv");
        if (!Files.exists(path)) return new Object[][]{{"smoke", "http://localhost:3000", "200"}};
        List<String> lines = Files.readAllLines(path);
        List<Object[]> rows = new ArrayList<>();
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) continue;
            rows.add(lines.get(i).split(",", -1));
        }
        return rows.toArray(new Object[0][]);
    }
}
