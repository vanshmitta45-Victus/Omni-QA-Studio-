package com.omniqa.studio.controller;

import com.omniqa.studio.entity.BugReportEntity;
import com.omniqa.studio.repository.BugReportRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/bugs")
public class BugReportController {

    private final BugReportRepository bugRepo;
    private final SimpMessagingTemplate messaging;

    public BugReportController(BugReportRepository bugRepo, SimpMessagingTemplate messaging) {
        this.bugRepo = bugRepo;
        this.messaging = messaging;
    }

    @GetMapping
    public ResponseEntity<List<BugReportEntity>> getAll(@RequestParam(required = false) String status,
                                                        @RequestParam(required = false) String severity) {
        if (status != null) return ResponseEntity.ok(bugRepo.findByStatus(status.toUpperCase()));
        if (severity != null) return ResponseEntity.ok(bugRepo.findBySeverity(severity.toUpperCase()));
        return ResponseEntity.ok(bugRepo.findAll());
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable UUID id,
                                                        @RequestBody Map<String, String> body) {
        return bugRepo.findById(id).map(bug -> {
            String next = body.getOrDefault("status", bug.getStatus()).toUpperCase();
            if (!List.of("OPEN", "IN_PROGRESS", "RESOLVED").contains(next)) {
                return ResponseEntity.<BugReportEntity>badRequest().build();
            }
            bug.setStatus(next);
            BugReportEntity saved = bugRepo.save(bug);
            messaging.convertAndSend("/topic/bugs", (Object) saved);
            messaging.convertAndSend("/topic/test-runs", (Object) Map.of("type", "BUG_UPDATED", "bugId", saved.getId().toString()));
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable UUID id, @RequestBody BugReportEntity patch) {
        return bugRepo.findById(id).map(bug -> {
            if (patch.getStatus() != null) bug.setStatus(patch.getStatus().toUpperCase());
            if (patch.getSeverity() != null) bug.setSeverity(patch.getSeverity().toUpperCase());
            if (patch.getRootCauseAnalysis() != null) bug.setRootCauseAnalysis(patch.getRootCauseAnalysis());
            if (patch.getAiExplanation() != null) bug.setAiExplanation(patch.getAiExplanation());
            BugReportEntity saved = bugRepo.save(bug);
            messaging.convertAndSend("/topic/bugs", (Object) saved);
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }
}
