package com.omniqa.studio.controller;

import com.omniqa.studio.entity.ChatRoomEntity;
import com.omniqa.studio.entity.UserEntity;
import com.omniqa.studio.repository.ChatRoomRepository;
import com.omniqa.studio.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * WhatsApp-style rooms: open CHANNELs, member GROUPs, 1-1 DMs.
 * Any member can add/remove members (per workspace choice).
 */
@RestController
@RequestMapping("/api/chat/rooms")
public class ChatRoomController {

    private final ChatRoomRepository rooms;
    private final UserRepository users;

    public ChatRoomController(ChatRoomRepository rooms, UserRepository users) {
        this.rooms = rooms;
        this.users = users;
    }

    public record RoomDto(String slug, String name, String description, String type,
                          List<MemberDto> members, String createdBy) {}
    public record MemberDto(UUID id, String username) {}
    public record CreateGroupRequest(String name, String description, List<UUID> memberIds, String type) {}
    public record DmRequest(UUID userId) {}
    public record MembersRequest(List<UUID> memberIds) {}

    private UUID currentUserId(Principal principal) {
        return users.findByUsername(principal.getName())
                .map(UserEntity::getId)
                .orElseThrow(() -> new IllegalStateException("Current user not found"));
    }

    private boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }

    private RoomDto toDto(ChatRoomEntity room) {
        List<MemberDto> members = new ArrayList<>();
        for (UUID memberId : room.getMemberIds()) {
            users.findById(memberId).ifPresent(u -> members.add(new MemberDto(u.getId(), u.getUsername())));
        }
        members.sort((a, b) -> a.username().compareToIgnoreCase(b.username()));
        return new RoomDto(room.getSlug(), room.getName(), room.getDescription(),
                room.getType().name(), members,
                room.getCreatedBy() != null ? room.getCreatedBy().toString() : null);
    }

    /** Rooms visible to the caller: all CHANNELs + GROUPs/DMs they belong to. */
    @GetMapping
    public ResponseEntity<List<RoomDto>> myRooms(Principal principal) {
        UUID me = currentUserId(principal);
        List<ChatRoomEntity> visible = new ArrayList<>(rooms.findByTypeOrderByCreatedAtAsc(ChatRoomEntity.RoomType.CHANNEL));
        visible.addAll(rooms.findByTypeAndMember(ChatRoomEntity.RoomType.GROUP, me));
        visible.addAll(rooms.findByTypeAndMember(ChatRoomEntity.RoomType.DM, me));
        return ResponseEntity.ok(visible.stream().map(this::toDto).toList());
    }

    /** Create a GROUP (default) or open CHANNEL (type="CHANNEL"). Creator auto-added. */
    @PostMapping
    public ResponseEntity<?> createGroup(@RequestBody CreateGroupRequest req, Principal principal) {
        if (!StringUtils.hasText(req.name())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Name is required"));
        }
        ChatRoomEntity.RoomType type = "CHANNEL".equalsIgnoreCase(req.type())
                ? ChatRoomEntity.RoomType.CHANNEL
                : ChatRoomEntity.RoomType.GROUP;
        UUID me = currentUserId(principal);
        Set<UUID> memberIds = new HashSet<>();
        if (req.memberIds() != null) memberIds.addAll(req.memberIds());
        memberIds.add(me);
        ChatRoomEntity room = ChatRoomEntity.builder()
                .slug(UUID.randomUUID().toString())
                .name(req.name().trim())
                .description(req.description() != null ? req.description().trim() : "")
                .type(type)
                .memberIds(memberIds)
                .createdBy(me)
                .build();
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(rooms.save(room)));
    }

    /** Find-or-create a 1-1 DM with another user. */
    @PostMapping("/dm")
    public ResponseEntity<?> getOrCreateDm(@RequestBody DmRequest req, Principal principal) {
        if (req.userId() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "userId is required"));
        }
        UUID me = currentUserId(principal);
        if (req.userId().equals(me)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Cannot DM yourself"));
        }
        if (users.findById(req.userId()).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "User not found"));
        }
        List<ChatRoomEntity> existing = rooms.findDmBetween(me, req.userId());
        if (!existing.isEmpty()) {
            return ResponseEntity.ok(toDto(existing.get(0)));
        }
        ChatRoomEntity room = ChatRoomEntity.builder()
                .slug(UUID.randomUUID().toString())
                .name("Direct message")
                .description("")
                .type(ChatRoomEntity.RoomType.DM)
                .memberIds(new HashSet<>(Set.of(me, req.userId())))
                .createdBy(me)
                .build();
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(rooms.save(room)));
    }

    /** Add members (any member can add, per workspace choice). */
    @PostMapping("/{slug}/members")
    public ResponseEntity<?> addMembers(@PathVariable String slug,
                                        @RequestBody MembersRequest req,
                                        Principal principal) {
        UUID me = currentUserId(principal);
        ChatRoomEntity room = rooms.findBySlug(slug).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();
        if (room.getType() != ChatRoomEntity.RoomType.CHANNEL && !room.getMemberIds().contains(me)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Not a member"));
        }
        if (req.memberIds() != null) {
            for (UUID id : req.memberIds()) {
                if (users.findById(id).isPresent()) room.getMemberIds().add(id);
            }
        }
        return ResponseEntity.ok(toDto(rooms.save(room)));
    }

    /** Remove a member (self-leave always allowed; any member can remove others). */
    @DeleteMapping("/{slug}/members/{userId}")
    public ResponseEntity<?> removeMember(@PathVariable String slug,
                                          @PathVariable UUID userId,
                                          Principal principal) {
        UUID me = currentUserId(principal);
        ChatRoomEntity room = rooms.findBySlug(slug).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();
        if (!room.getMemberIds().contains(me)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Not a member"));
        }
        room.getMemberIds().remove(userId);
        return ResponseEntity.ok(toDto(rooms.save(room)));
    }

    /** Delete a room (creator or workspace admin — channels included). */
    @DeleteMapping("/{slug}")
    public ResponseEntity<?> deleteRoom(@PathVariable String slug,
                                        Principal principal, Authentication auth) {
        UUID me = currentUserId(principal);
        ChatRoomEntity room = rooms.findBySlug(slug).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();
        if (!me.equals(room.getCreatedBy()) && !isAdmin(auth)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Only the creator or an admin can delete this chat"));
        }
        rooms.delete(room);
        return ResponseEntity.ok(Map.of("message", "Chat deleted"));
    }
}
