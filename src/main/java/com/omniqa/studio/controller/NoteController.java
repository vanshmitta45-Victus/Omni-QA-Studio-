package com.omniqa.studio.controller;

import com.omniqa.studio.dto.ApiResponse;
import com.omniqa.studio.dto.NoteRequest;
import com.omniqa.studio.dto.NoteResponse;
import com.omniqa.studio.service.NoteService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/notes")
@CrossOrigin(origins = "*", maxAge = 3600)
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    /**
     * POST /api/notes
     * Create a new markdown note.
     */
    @PostMapping
    public ResponseEntity<NoteResponse> createNote(@RequestBody NoteRequest request, Principal principal) {
        NoteResponse response = noteService.createNote(request, principal.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * GET /api/notes
     * Retrieve all personal notes and shared team notes.
     */
    @GetMapping
    public ResponseEntity<List<NoteResponse>> getAllNotes(Principal principal) {
        List<NoteResponse> notes = noteService.getAllAccessibleNotes(principal.getName());
        return ResponseEntity.ok(notes);
    }

    /**
     * GET /api/notes/{id}
     * Retrieve a specific note by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getNoteById(@PathVariable UUID id, Principal principal) {
        try {
            NoteResponse note = noteService.getNoteById(id, principal.getName());
            return ResponseEntity.ok(note);
        } catch (AccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiResponse(false, ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse(false, ex.getMessage()));
        }
    }

    /**
     * PUT /api/notes/{id}
     * Update an existing note.
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateNote(@PathVariable UUID id,
                                        @RequestBody NoteRequest request,
                                        Principal principal) {
        try {
            NoteResponse updated = noteService.updateNote(id, request, principal.getName());
            return ResponseEntity.ok(updated);
        } catch (AccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiResponse(false, ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse(false, ex.getMessage()));
        }
    }

    /**
     * DELETE /api/notes/{id}
     * Delete a note.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteNote(@PathVariable UUID id, Principal principal) {
        try {
            noteService.deleteNote(id, principal.getName());
            return ResponseEntity.ok(new ApiResponse(true, "Note successfully deleted."));
        } catch (AccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiResponse(false, ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse(false, ex.getMessage()));
        }
    }

    /**
     * PATCH /api/notes/{id}/share
     * Toggle the share status of a note.
     */
    @PatchMapping("/{id}/share")
    public ResponseEntity<?> toggleShareNote(@PathVariable UUID id, Principal principal) {
        try {
            NoteResponse note = noteService.toggleShare(id, principal.getName());
            return ResponseEntity.ok(note);
        } catch (AccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiResponse(false, ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse(false, ex.getMessage()));
        }
    }
}
