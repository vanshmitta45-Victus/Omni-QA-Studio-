package com.omniqa.studio.repository;

import com.omniqa.studio.entity.TestRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TestRunRepository extends JpaRepository<TestRunEntity, UUID> {
    List<TestRunEntity> findByStatus(String status);
    List<TestRunEntity> findByTestNameContainingIgnoreCase(String testName);
}
