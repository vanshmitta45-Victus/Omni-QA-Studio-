package com.omniqa.studio.repository;

import com.omniqa.studio.entity.BugReportEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BugReportRepository extends JpaRepository<BugReportEntity, UUID> {
    List<BugReportEntity> findByTestRunId(UUID testRunId);
    List<BugReportEntity> findBySeverity(String severity);
    List<BugReportEntity> findByStatus(String status);
}
