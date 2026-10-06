package com.omniqa.studio.controller;

import com.omniqa.studio.entity.UserEntity;
import com.omniqa.studio.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public record UserDto(UUID id, String username, String email, String role,
                          String firstName, String lastName, String phoneNumber,
                          String gender, String createdAt) {}

    private UserDto toDto(UserEntity u) {
        return new UserDto(u.getId(), u.getUsername(), u.getEmail(), u.getRole(),
                u.getFirstName(), u.getLastName(), u.getPhoneNumber(), u.getGender(),
                u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
    }

    private String normalizeRole(String role) {
        if (!StringUtils.hasText(role)) return "ROLE_QA_ENGINEER";
        String r = role.trim().toUpperCase();
        if (!r.startsWith("ROLE_")) r = "ROLE_" + r;
        return r;
    }

    private boolean isAllowedRole(String role) {
        return List.of("ROLE_ADMIN", "ROLE_QA_LEAD", "ROLE_QA_ENGINEER", "ROLE_DEVELOPER").contains(role);
    }

    @GetMapping
    public ResponseEntity<List<UserDto>> listUsers() {
        return ResponseEntity.ok(userRepository.findAll().stream().map(this::toDto).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getUser(@PathVariable UUID id) {
        return userRepository.findById(id).<ResponseEntity<?>>map(u -> ResponseEntity.ok(toDto(u)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * POST /api/users — admin creates a team member with full profile.
     * Body: firstName, lastName, username, email, phoneNumber, gender, role, password
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> createUser(@RequestBody Map<String, String> body) {
        String username = body.getOrDefault("username", "").trim();
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        String password = body.getOrDefault("password", "");

        if (!StringUtils.hasText(username)) return bad("Username is required");
        if (!StringUtils.hasText(email)) return bad("Email is required");
        if (password.length() < 6) return bad("Password must be at least 6 characters");
        if (userRepository.existsByUsername(username)) return bad("Username is already taken!");
        if (userRepository.existsByEmail(email)) return bad("Email is already registered!");

        String role = normalizeRole(body.get("role"));
        if (!isAllowedRole(role)) return bad("Unknown role: " + role);

        UserEntity saved = userRepository.save(UserEntity.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .role(role)
                .firstName(body.get("firstName"))
                .lastName(body.get("lastName"))
                .phoneNumber(body.get("phoneNumber"))
                .gender(body.get("gender"))
                .build());
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(saved));
    }

    /**
     * PUT /api/users/{id} — admin updates profile (+ optional password reset).
     * Empty password = keep existing.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateUser(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return userRepository.findById(id).<ResponseEntity<?>>map(u -> {
            String username = body.getOrDefault("username", u.getUsername()).trim();
            String email = body.getOrDefault("email", u.getEmail()).trim().toLowerCase();
            if (!StringUtils.hasText(username)) return bad("Username is required");
            if (!StringUtils.hasText(email)) return bad("Email is required");
            if (!username.equals(u.getUsername()) && userRepository.existsByUsername(username))
                return bad("Username is already taken!");
            if (!email.equals(u.getEmail()) && userRepository.existsByEmail(email))
                return bad("Email is already registered!");

            u.setUsername(username);
            u.setEmail(email);
            if (body.containsKey("firstName")) u.setFirstName(body.get("firstName"));
            if (body.containsKey("lastName")) u.setLastName(body.get("lastName"));
            if (body.containsKey("phoneNumber")) u.setPhoneNumber(body.get("phoneNumber"));
            if (body.containsKey("gender")) u.setGender(body.get("gender"));
            if (body.containsKey("role")) {
                String role = normalizeRole(body.get("role"));
                if (!isAllowedRole(role)) return bad("Unknown role: " + role);
                u.setRole(role);
            }
            String password = body.getOrDefault("password", "");
            if (StringUtils.hasText(password)) {
                if (password.length() < 6) return bad("Password must be at least 6 characters");
                u.setPasswordHash(passwordEncoder.encode(password));
            }
            return ResponseEntity.ok(toDto(userRepository.save(u)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateRole(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        String role = normalizeRole(body.get("role"));
        if (!isAllowedRole(role)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Unknown role: " + role));
        }
        final String nextRole = role;
        return userRepository.findById(id).<ResponseEntity<?>>map(u -> {
            u.setRole(nextRole);
            return ResponseEntity.ok(toDto(userRepository.save(u)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> deleteUser(@PathVariable UUID id, Authentication auth) {
        return userRepository.findById(id).<ResponseEntity<?>>map(u -> {
            if (auth != null && u.getUsername().equals(auth.getName())) {
                return ResponseEntity.badRequest().body(Map.of("message", "You cannot delete your own account"));
            }
            userRepository.delete(u);
            return ResponseEntity.ok(Map.of("message", "User removed"));
        }).orElse(ResponseEntity.notFound().build());
    }

    private ResponseEntity<Map<String, String>> bad(String message) {
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }
}
