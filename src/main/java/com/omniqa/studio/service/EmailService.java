package com.omniqa.studio.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final CacheManager cacheManager;

    @Value("${spring.mail.username:noreply@omniqa.studio}")
    private String fromEmail;

    private static final long OTP_EXPIRATION_SECONDS = 600; // 10 minutes

    public EmailService(@Autowired(required = false) JavaMailSender mailSender,
                        @Autowired(required = false) CacheManager cacheManager) {
        this.mailSender = mailSender;
        this.cacheManager = cacheManager;
    }

    private Cache otpCache() {
        if (cacheManager == null) return null;
        return cacheManager.getCache("otpCache");
    }

    /**
     * Sends a welcome email to newly registered users.
     */
    @Async("taskExecutor")
    public void sendWelcomeEmail(String toEmail, String username) {
        String subject = "Welcome to OmniQA Studio!";
        String content = """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="background-color: #3b82f6; padding: 16px; border-radius: 6px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">OmniQA Studio</h1>
                    </div>
                    <div style="padding: 24px 0;">
                        <h2 style="color: #1e293b;">Hello %s, welcome aboard!</h2>
                        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                            Thank you for joining <strong>OmniQA Studio</strong> — the Enterprise QA Intelligence, Test Automation, and Collaboration Platform.
                        </p>
                        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                            Your account has been successfully created. You can now track automated test runs, generate AI root cause analysis, collaborate via team rooms, and manage testing notes in real-time.
                        </p>
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="http://localhost:5173/login" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Go to Dashboard
                            </a>
                        </div>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
                        &copy; %d OmniQA Studio. All rights reserved.
                    </div>
                </div>
                """.formatted(username, java.time.Year.now().getValue());

        sendHtmlEmail(toEmail, subject, content);
    }

    /**
     * Generates a 6-digit OTP code with a 10-minute expiration and emails it to the user.
     */
    public String generateAndSendPasswordResetOtp(String toEmail) {
        SecureRandom random = new SecureRandom();
        int otpNumber = 100000 + random.nextInt(900000);
        String otp = String.valueOf(otpNumber);

        Instant expiresAt = Instant.now().plusSeconds(OTP_EXPIRATION_SECONDS);
        String key = toEmail.toLowerCase();
        if (otpCache() != null) {
            otpCache().put(key, new OtpDetails(otp, expiresAt));
        } else {
            FallbackOtpStore.put(key, new OtpDetails(otp, expiresAt));
        }

        logger.info("Generated 6-digit OTP [{}] for email [{}], expires in 10 minutes", otp, toEmail);

        String subject = "OmniQA Studio - Password Reset Verification Code";
        String content = """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="background-color: #ef4444; padding: 16px; border-radius: 6px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Password Reset Request</h1>
                    </div>
                    <div style="padding: 24px 0;">
                        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                            We received a request to reset your password for your OmniQA Studio account.
                        </p>
                        <p style="color: #475569; font-size: 16px;">
                            Please use the following 6-digit verification code to proceed:
                        </p>
                        <div style="margin: 20px 0; text-align: center;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background-color: #f1f5f9; padding: 12px 24px; border-radius: 8px; color: #0f172a; display: inline-block;">
                                %s
                            </span>
                        </div>
                        <p style="color: #64748b; font-size: 14px;">
                            This OTP is valid for <strong>10 minutes</strong>. If you did not request this password reset, please ignore this email or contact support immediately.
                        </p>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
                        &copy; %d OmniQA Studio. All rights reserved.
                    </div>
                </div>
                """.formatted(otp, java.time.Year.now().getValue());

        sendHtmlEmail(toEmail, subject, content);
        return otp;
    }

    /**
     * Verifies the OTP code for password reset.
     */
    public boolean verifyPasswordResetOtp(String email, String otp) {
        String key = email.toLowerCase();
        OtpDetails details = null;
        if (otpCache() != null) {
            details = otpCache().get(key, OtpDetails.class);
        } else {
            details = FallbackOtpStore.get(key);
        }
        if (details == null) {
            return false;
        }

        if (Instant.now().isAfter(details.expiresAt())) {
            if (otpCache() != null) otpCache().evict(key);
            else FallbackOtpStore.remove(key);
            return false;
        }

        boolean isValid = details.otp().equals(otp.trim());
        if (isValid) {
            if (otpCache() != null) otpCache().evict(key);
            else FallbackOtpStore.remove(key);
        }
        return isValid;
    }

    private void sendHtmlEmail(String toEmail, String subject, String htmlContent) {
        if (mailSender == null) {
            logger.warn("JavaMailSender is not available. Skipping email dispatch to [{}] with subject [{}]", toEmail, subject);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);

            mailSender.send(message);
            logger.info("Email successfully dispatched to [{}] with subject [{}]", toEmail, subject);
        } catch (MessagingException ex) {
            logger.error("Failed to construct or send email to [{}]: {}", toEmail, ex.getMessage());
        } catch (Exception ex) {
            logger.warn("Mail server connection failed (likely unconfigured credentials in dev environment) for [{}]: {}", toEmail, ex.getMessage());
        }
    }

    private record OtpDetails(String otp, Instant expiresAt) {}

    // Static fallback when no CacheManager (tests / minimal profile)
    private static final class FallbackOtpStore {
        private static final java.util.Map<String, OtpDetails> MAP = new java.util.concurrent.ConcurrentHashMap<>();
        static void put(String k, OtpDetails v) { MAP.put(k, v); }
        static OtpDetails get(String k) { return MAP.get(k); }
        static void remove(String k) { MAP.remove(k); }
    }
}
