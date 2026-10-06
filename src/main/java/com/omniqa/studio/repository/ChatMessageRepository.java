package com.omniqa.studio.repository;

import com.omniqa.studio.entity.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, UUID> {
    List<ChatMessageEntity> findByRoomIdOrderByTimestampAsc(String roomId);
    List<ChatMessageEntity> findBySenderId(UUID senderId);
}
