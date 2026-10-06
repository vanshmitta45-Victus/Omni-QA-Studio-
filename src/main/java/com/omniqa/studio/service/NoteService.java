package com.omniqa.studio.service;

import com.omniqa.studio.dto.NoteRequest;
import com.omniqa.studio.dto.NoteResponse;
import com.omniqa.studio.entity.NoteEntity;
import com.omniqa.studio.entity.UserEntity;
import com.omniqa.studio.repository.NoteRepository;
import com.omniqa.studio.repository.UserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class NoteService {

    private final NoteRepository noteRepository;
    private final UserRepository userRepository;

    public NoteService(NoteRepository noteRepository, UserRepository userRepository) {
        this.noteRepository = noteRepository;
        this.userRepository = userRepository;
    }

    /**
     * Creates a new markdown note for the authenticated user.
     */
    @Transactional
    public NoteResponse createNote(NoteRequest request, String username) {
        UserEntity user = getUserByUsername(username);

        NoteEntity note = NoteEntity.builder()
                .userId(user.getId())
                .title(request.getTitle())
                .content(request.getContent())
                .isShared(request.getIsShared() != null && request.getIsShared())
                .build();

        NoteEntity saved = noteRepository.save(note);
        return mapToResponse(saved, user, true);
    }

    /**
     * Retrieves all personal notes and shared team notes for the current user.
     */
    @Transactional(readOnly = true)
    public List<NoteResponse> getAllAccessibleNotes(String username) {
        UserEntity user = getUserByUsername(username);
        List<NoteEntity> notes = noteRepository.findByUserIdOrIsSharedTrue(user.getId());

        return notes.stream()
                .map(note -> {
                    boolean isOwner = note.getUserId().equals(user.getId());
                    String authorName = isOwner ? user.getUsername() :
                            userRepository.findById(note.getUserId())
                                    .map(UserEntity::getUsername)
                                    .orElse("Team Member");
                    return mapToResponse(note, authorName, isOwner);
                })
                .collect(Collectors.toList());
    }

    /**
     * Retrieves a single note by ID with permission checks.
     */
    @Transactional(readOnly = true)
    public NoteResponse getNoteById(UUID noteId, String username) {
        UserEntity user = getUserByUsername(username);
        NoteEntity note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Note not found with id: " + noteId));

        boolean isOwner = note.getUserId().equals(user.getId());
        if (!isOwner && !Boolean.TRUE.equals(note.getIsShared())) {
            throw new AccessDeniedException("You do not have permission to view this note.");
        }

        String authorName = isOwner ? user.getUsername() :
                userRepository.findById(note.getUserId())
                        .map(UserEntity::getUsername)
                        .orElse("Team Member");

        return mapToResponse(note, authorName, isOwner);
    }

    /**
     * Updates an existing note (restricted to the note owner).
     */
    @Transactional
    public NoteResponse updateNote(UUID noteId, NoteRequest request, String username) {
        UserEntity user = getUserByUsername(username);
        NoteEntity note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Note not found with id: " + noteId));

        if (!note.getUserId().equals(user.getId()) && !"ROLE_ADMIN".equals(user.getRole())) {
            throw new AccessDeniedException("Only the note author or an admin can modify this note.");
        }

        if (request.getTitle() != null) {
            note.setTitle(request.getTitle());
        }
        if (request.getContent() != null) {
            note.setContent(request.getContent());
        }
        if (request.getIsShared() != null) {
            note.setIsShared(request.getIsShared());
        }

        NoteEntity updated = noteRepository.save(note);
        return mapToResponse(updated, user, true);
    }

    /**
     * Deletes a note (restricted to the note owner).
     */
    @Transactional
    public void deleteNote(UUID noteId, String username) {
        UserEntity user = getUserByUsername(username);
        NoteEntity note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Note not found with id: " + noteId));

        if (!note.getUserId().equals(user.getId()) && !"ROLE_ADMIN".equals(user.getRole())) {
            throw new AccessDeniedException("Only the note author or an admin can delete this note.");
        }

        noteRepository.delete(note);
    }

    /**
     * Toggles whether the note is shared with the team.
     */
    @Transactional
    public NoteResponse toggleShare(UUID noteId, String username) {
        UserEntity user = getUserByUsername(username);
        NoteEntity note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Note not found with id: " + noteId));

        if (!note.getUserId().equals(user.getId()) && !"ROLE_ADMIN".equals(user.getRole())) {
            throw new AccessDeniedException("Only the note author can change sharing permissions.");
        }

        note.setIsShared(!Boolean.TRUE.equals(note.getIsShared()));
        NoteEntity updated = noteRepository.save(note);
        return mapToResponse(updated, user, true);
    }

    private UserEntity getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .or(() -> userRepository.findByEmail(username))
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    private NoteResponse mapToResponse(NoteEntity note, UserEntity user, boolean isOwner) {
        return mapToResponse(note, user.getUsername(), isOwner);
    }

    private NoteResponse mapToResponse(NoteEntity note, String authorName, boolean isOwner) {
        return NoteResponse.builder()
                .id(note.getId())
                .userId(note.getUserId())
                .authorUsername(authorName)
                .title(note.getTitle())
                .content(note.getContent())
                .isShared(note.getIsShared())
                .isOwner(isOwner)
                .createdAt(note.getCreatedAt())
                .updatedAt(note.getUpdatedAt())
                .build();
    }
}
