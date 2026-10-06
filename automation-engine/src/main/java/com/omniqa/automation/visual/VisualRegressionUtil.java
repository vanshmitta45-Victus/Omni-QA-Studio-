package com.omniqa.automation.visual;

import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * Pixel-diff visual regression: compares current screenshot vs baseline.
 * Fails build if diff ratio exceeds threshold. Baselines in src/test/resources/baselines/.
 */
public final class VisualRegressionUtil {

    private VisualRegressionUtil() {}

    public static double compareWithBaseline(WebDriver driver, String name, double threshold) throws Exception {
        File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
        BufferedImage current = ImageIO.read(src);
        File baseFile = new File("src/test/resources/baselines/" + name + ".png");

        if (!baseFile.exists()) {
            Files.createDirectories(Paths.get("src/test/resources/baselines"));
            Files.copy(src.toPath(), baseFile.toPath());
            System.out.println(">>> [Visual] Baseline created: " + baseFile.getPath());
            return 0.0;
        }

        BufferedImage baseline = ImageIO.read(baseFile);
        int w = Math.min(baseline.getWidth(), current.getWidth());
        int h = Math.min(baseline.getHeight(), current.getHeight());
        long diff = 0;
        for (int y = 0; y < h; y += 4) {
            for (int x = 0; x < w; x += 4) {
                if (baseline.getRGB(x, y) != current.getRGB(x, y)) diff++;
            }
        }
        double total = (double) (w / 4) * (h / 4);
        double ratio = total == 0 ? 0 : diff / total;

        // Write diff artifact
        Files.createDirectories(Paths.get("target/visual-diffs"));
        Files.copy(src.toPath(), Paths.get("target/visual-diffs/" + name + "_actual.png"),
                java.nio.file.StandardCopyOption.REPLACE_EXISTING);

        System.out.printf(">>> [Visual] %s diff=%.4f threshold=%.4f%n", name, ratio, threshold);
        if (ratio > threshold) {
            throw new AssertionError("Visual regression failed for " + name + ": diff " + ratio + " > " + threshold);
        }
        return ratio;
    }
}
