package com.omniqa.studio.repository;

import com.omniqa.studio.entity.ChatRoomEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatRoomRepository extends JpaRepository<ChatRoomEntity, UUID> {

    Optional<ChatRoomEntity> findBySlug(String slug);

    List<ChatRoomEntity> findByTypeOrderByCreatedAtAsc(ChatRoomEntity.RoomType type);

    @Query("SELECT r FROM ChatRoomEntity r WHERE r.type = 'DM' AND :a MEMBER OF r.memberIds AND :b MEMBER OF r.memberIds")
    List<ChatRoomEntity> findDmBetween(@Param("a") UUID a, @Param("b") UUID b);

    @Query("SELECT r FROM ChatRoomEntity r WHERE r.type = :type AND :member MEMBER OF r.memberIds ORDER BY r.createdAt ASC")
    List<ChatRoomEntity> findByTypeAndMember(@Param("type") ChatRoomEntity.RoomType type,
                                             @Param("member") UUID member);
}
