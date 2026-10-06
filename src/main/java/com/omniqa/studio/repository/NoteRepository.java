package com.omniqa.studio.repository;

import com.omniqa.studio.entity.NoteEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface NoteRepository extends JpaRepository<NoteEntity, UUID> {
    List<NoteEntity> findByUserId(UUID userId);
    List<NoteEntity> findByUserIdOrIsSharedTrue(UUID userId);
}
