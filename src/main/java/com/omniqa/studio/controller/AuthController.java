package com.omniqa.studio.controller;

import com.omniqa.studio.dto.ApiResponse;
import com.omniqa.studio.dto.AuthResponse;
import com.omniqa.studio.dto.ForgotPasswordRequest;
import com.omniqa.studio.dto.LoginRequest;
import com.omniqa.studio.dto.RegisterRequest;
import com.omniqa.studio.dto.ResetPasswordRequest;
import com.omniqa.studio.entity.UserEntity;
import com.omniqa.studio.repository.UserRepository;
import com.omniqa.studio.security.JwtTokenProvider;
import com.omniqa.studio.service.EmailService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "${app.cors.allowed-origins:http://localhost:5173}", maxAge = 3600)
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final EmailService emailService;

    public AuthController(AuthenticationManager authenticationManager,
                          UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtTokenProvider tokenProvider,
                          EmailService emailService) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.emailService = emailService;
    }

    /**
     * POST /api/auth/register
     * Handles user sign-up, encodes password, saves user entity, and sends a welcome email.
     */
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@RequestBody RegisterRequest request) {
        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Username is required"));
        }
        if (request.getEmail() == null || request.getEmail().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Email is required"));
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Password must be at least 6 characters"));
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Username is already taken!"));
        }

        if (userRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Email is already registered!"));
        }

        String role = request.getRole();
        if (userRepository.count() == 0) {
            // First ever user becomes workspace admin
            role = "ROLE_ADMIN";
        } else if (role == null || role.isBlank()) {
            role = "ROLE_QA_ENGINEER";
        } else if (!role.startsWith("ROLE_")) {
            role = "ROLE_" + role.toUpperCase();
        }

        UserEntity user = UserEntity.builder()
                .username(request.getUsername().trim())
                .email(request.getEmail().trim().toLowerCase())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(role)
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .phoneNumber(request.getPhoneNumber())
                .gender(request.getGender())
                .build();

        UserEntity savedUser = userRepository.save(user);

        // Send welcome email asynchronously / gracefully
        try {
            emailService.sendWelcomeEmail(savedUser.getEmail(), savedUser.getUsername());
        } catch (Exception ignored) {
            // Logged in emailService
        }

        // Generate JWT token for direct auto-login upon registration
        String jwt = tokenProvider.generateTokenFromUsername(savedUser.getUsername());

        return ResponseEntity.status(HttpStatus.CREATED).body(
                new AuthResponse(
                        jwt,
                        savedUser.getId(),
                        savedUser.getUsername(),
                        savedUser.getEmail(),
                        savedUser.getRole(),
                        savedUser.getFirstName(),
                        savedUser.getLastName(),
                        "User registered successfully! Welcome email sent."
                )
        );
    }

    /**
     * POST /api/auth/login
     * Authenticates credentials and returns a signed JWT token with user info.
     */
    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@RequestBody LoginRequest request) {
        if (request.getUsername() == null || request.getPassword() == null) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Username and password must not be empty"));
        }

        String inputIdentifier = request.getUsername().trim();

        // Resolve user by username or email
        Optional<UserEntity> userOpt = userRepository.findByUsername(inputIdentifier)
                .or(() -> userRepository.findByEmail(inputIdentifier));

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse(false, "Invalid username or password"));
        }

        UserEntity user = userOpt.get();

        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(user.getUsername(), request.getPassword())
            );

            SecurityContextHolder.getContext().setAuthentication(authentication);
            String jwt = tokenProvider.generateToken(authentication);

            return ResponseEntity.ok(new AuthResponse(
                    jwt,
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.getRole(),
                    user.getFirstName(),
                    user.getLastName(),
                    "Authentication successful"
            ));
        } catch (BadCredentialsException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse(false, "Invalid username or password"));
        }
    }

    /**
     * POST /api/auth/forgot-password
     * Generates a 6-digit OTP code and emails it to the user.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request) {
        if (request.getEmail() == null || request.getEmail().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Email is required"));
        }

        String email = request.getEmail().trim().toLowerCase();
        Optional<UserEntity> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            // Return success message to prevent user enumeration attacks
            return ResponseEntity.ok(new ApiResponse(
                    true,
                    "If an account is associated with this email, a 6-digit OTP has been sent."
            ));
        }

        emailService.generateAndSendPasswordResetOtp(email);

        return ResponseEntity.ok(new ApiResponse(
                true,
                "Password reset OTP code has been sent to your email. It will expire in 10 minutes."
        ));
    }

    /**
     * POST /api/auth/reset-password
     * Verifies the 6-digit OTP and updates user's password.
     */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
        if (request.getEmail() == null || request.getOtp() == null || request.getNewPassword() == null) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Email, OTP, and new password are required"));
        }

        if (request.getNewPassword().length() < 6) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "New password must be at least 6 characters"));
        }

        String email = request.getEmail().trim().toLowerCase();
        boolean isOtpValid = emailService.verifyPasswordResetOtp(email, request.getOtp());

        if (!isOtpValid) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "Invalid or expired OTP code"));
        }

        Optional<UserEntity> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, "User not found"));
        }

        UserEntity user = userOpt.get();
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        return ResponseEntity.ok(new ApiResponse(true, "Password has been successfully updated. You may now log in."));
    }
}
