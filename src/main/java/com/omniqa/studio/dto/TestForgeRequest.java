package com.omniqa.studio.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestForgeRequest {
    private String testName;
    private String url;
    private String requirements;
    private String browser; // chrome-headless (default)
    private List<ForgeStep> steps;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ForgeStep {
        /** GOTO, CLICK, TYPE, ASSERT_TITLE_CONTAINS, ASSERT_TEXT_PRESENT, WAIT_SECONDS, SCREENSHOT */
        private String action;
        /** CSS selector (CLICK, TYPE, ASSERT_TEXT_PRESENT) */
        private String selector;
        /** text to type / seconds to wait / expected title or text */
        private String value;
    }
}
