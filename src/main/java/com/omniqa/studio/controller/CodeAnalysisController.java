package com.omniqa.studio.controller;

import com.omniqa.studio.dto.CodeAnalysisRequest;
import com.omniqa.studio.dto.CodeAnalysisResponse;
import com.omniqa.studio.service.AiCodeAnalyzerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/code")
@CrossOrigin(origins = "*", maxAge = 3600)
public class CodeAnalysisController {

    private final AiCodeAnalyzerService codeAnalyzerService;

    public CodeAnalysisController(AiCodeAnalyzerService codeAnalyzerService) {
        this.codeAnalyzerService = codeAnalyzerService;
    }

    /**
     * POST /api/code/analyze
     * Analyzes buggy code snippets, refactors them, and generates an explanation
     * to power side-by-side diff editors in OmniQA Studio.
     */
    @PostMapping("/analyze")
    public ResponseEntity<CodeAnalysisResponse> analyzeCode(@RequestBody CodeAnalysisRequest request) {
        CodeAnalysisResponse response = codeAnalyzerService.analyzeCode(request);
        return ResponseEntity.ok(response);
    }
}
