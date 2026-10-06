package com.omniqa.studio.controller;

import com.omniqa.studio.dto.ChatMessageDto;
import com.omniqa.studio.entity.ChatMessageEntity;
import com.omniqa.studio.repository.ChatMessageRepository;
import com.omniqa.studio.repository.UserRepository;
import com.omniqa.studio.service.GoogleCloudStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@CrossOrigin(origins = "${app.cors.allowed-origins:http://localhost:5173}", maxAge = 3600)
public class ChatController {

    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);

    private final ChatMessageRepository chatMessageRepository;
    private final GoogleCloudStorageService storageService;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;

    public ChatController(ChatMessageRepository chatMessageRepository,
                          GoogleCloudStorageService storageService,
                          SimpMessagingTemplate messagingTemplate,
                          UserRepository userRepository) {
        this.chatMessageRepository = chatMessageRepository;
        this.storageService = storageService;
        this.messagingTemplate = messagingTemplate;
        this.userRepository = userRepository;
    }

    /**
     * WebSocket Message Handler: /app/chat.sendMessage
     * Broadcasts to /topic/chat and /topic/chat/{roomId}
     */
    @MessageMapping("/chat.sendMessage")
    @SendTo("/topic/chat")
    public ChatMessageDto sendMessage(@Payload ChatMessageDto chatMessage) {
        if (chatMessage.getTimestamp() == null) {
            chatMessage.setTimestamp(LocalDateTime.now());
        }

        // Persist to database if senderId and roomId exist
        if (chatMessage.getSenderId() != null && chatMessage.getRoomId() != null) {
            ChatMessageEntity entity = ChatMessageEntity.builder()
                    .senderId(chatMessage.getSenderId())
                    .senderUsername(chatMessage.getSenderUsername())
                    .roomId(chatMessage.getRoomId())
                    .messageText(chatMessage.getMessageText())
                    .fileUrl(chatMessage.getFileUrl())
                    .fileType(chatMessage.getFileType())
                    .replyToSender(chatMessage.getReplyToSender())
                    .replyToText(chatMessage.getReplyToText())
                    .timestamp(chatMessage.getTimestamp())
                    .build();

            ChatMessageEntity saved = chatMessageRepository.save(entity);
            chatMessage.setId(saved.getId());

            // Also broadcast to room-specific topic
            messagingTemplate.convertAndSend("/topic/chat/" + chatMessage.getRoomId(), chatMessage);
        }

        return chatMessage;
    }

    /**
     * WebSocket Message Handler: /app/chat.addUser
     * Tracks presence and informs room participants
     */
    @MessageMapping("/chat.addUser")
    @SendTo("/topic/chat")
    public ChatMessageDto addUser(@Payload ChatMessageDto chatMessage,
                                  SimpMessageHeaderAccessor headerAccessor) {
        if (headerAccessor.getSessionAttributes() != null) {
            headerAccessor.getSessionAttributes().put("username", chatMessage.getSenderUsername());
            headerAccessor.getSessionAttributes().put("roomId", chatMessage.getRoomId());
        }

        chatMessage.setType(ChatMessageDto.MessageType.JOIN);
        chatMessage.setMessageText(chatMessage.getSenderUsername() + " joined the chat room.");
        chatMessage.setTimestamp(LocalDateTime.now());

        if (chatMessage.getRoomId() != null) {
            messagingTemplate.convertAndSend("/topic/chat/" + chatMessage.getRoomId(), chatMessage);
        }

        return chatMessage;
    }

    /**
     * REST Endpoint: POST /api/chat/upload
     * Uploads media attachments (screenshots, videos, logs) to GCS and broadcasts them to the chat room.
     */
    @PostMapping("/api/chat/upload")
    public ResponseEntity<?> uploadChatMedia(
            @RequestParam("file") MultipartFile file,
            @RequestParam("roomId") String roomId,
            @RequestParam("senderId") UUID senderId,
            @RequestParam(value = "senderUsername", required = false) String senderUsername,
            @RequestParam(value = "caption", required = false, defaultValue = "") String caption) {
        try {
            String fileUrl = storageService.uploadFile(file, "chat-media");
            String fileType = file.getContentType();

            ChatMessageEntity entity = ChatMessageEntity.builder()
                    .senderId(senderId)
                    .senderUsername(senderUsername != null ? senderUsername : "Team Member")
                    .roomId(roomId)
                    .messageText(caption)
                    .fileUrl(fileUrl)
                    .fileType(fileType)
                    .timestamp(LocalDateTime.now())
                    .build();

            ChatMessageEntity saved = chatMessageRepository.save(entity);

            ChatMessageDto broadcastMessage = ChatMessageDto.builder()
                    .id(saved.getId())
                    .senderId(senderId)
                    .senderUsername(senderUsername != null ? senderUsername : "Team Member")
                    .roomId(roomId)
                    .messageText(caption)
                    .fileUrl(fileUrl)
                    .fileType(fileType)
                    .type(ChatMessageDto.MessageType.CHAT)
                    .timestamp(saved.getTimestamp())
                    .build();

            // Broadcast via WebSocket to room subscribers
            messagingTemplate.convertAndSend("/topic/chat/" + roomId, broadcastMessage);
            messagingTemplate.convertAndSend("/topic/chat", broadcastMessage);

            return ResponseEntity.ok(broadcastMessage);
        } catch (IOException ex) {
            logger.error("Failed to upload chat media: {}", ex.getMessage());
            return ResponseEntity.internalServerError().body("Failed to process file upload: " + ex.getMessage());
        }
    }

    /**
     * REST Endpoint: GET /api/chat/history/{roomId}
     * Retrieves chat history for a specific room.
     */
    @GetMapping("/api/chat/history/{roomId}")
    public ResponseEntity<List<ChatMessageEntity>> getChatHistory(@PathVariable String roomId) {
        List<ChatMessageEntity> history = chatMessageRepository.findByRoomIdOrderByTimestampAsc(roomId);
        return ResponseEntity.ok(history);
    }

    /**
     * REST Endpoint: DELETE /api/chat/messages/{id}
     * Owner or workspace admin only. Broadcasts a DELETE tombstone so
     * live subscribers remove it instantly.
     */
    @DeleteMapping("/api/chat/messages/{id}")
    public ResponseEntity<?> deleteMessage(@PathVariable UUID id,
                                           java.security.Principal principal,
                                           org.springframework.security.core.Authentication auth) {
        ChatMessageEntity msg = chatMessageRepository.findById(id).orElse(null);
        if (msg == null) return ResponseEntity.notFound().build();
        boolean admin = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
        boolean owner = principal != null && msg.getSenderId() != null
                && userRepository.findByUsername(principal.getName())
                    .map(u -> u.getId().equals(msg.getSenderId()))
                    .orElse(false);
        if (!admin && !owner) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("message", "You can only delete your own messages"));
        }
        chatMessageRepository.delete(msg);
        ChatMessageDto tombstone = ChatMessageDto.builder()
                .id(id)
                .roomId(msg.getRoomId())
                .type(ChatMessageDto.MessageType.DELETE)
                .timestamp(LocalDateTime.now())
                .build();
        messagingTemplate.convertAndSend("/topic/chat/" + msg.getRoomId(), tombstone);
        messagingTemplate.convertAndSend("/topic/chat", tombstone);
        return ResponseEntity.ok(java.util.Map.of("message", "Message deleted"));
    }
}
