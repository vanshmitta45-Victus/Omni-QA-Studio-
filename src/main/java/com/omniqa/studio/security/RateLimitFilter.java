package com.omniqa.studio.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory rate limiter: 120 requests/minute per IP.
 * Prevents brute-force on /api/auth/** and DDoS on ingest endpoints.
 * For distributed deployments replace with Redis Bucket4j.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_PER_MINUTE = 120;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    private record Window(long minute, int count) {}

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        // Only rate-limit API + WebSocket handshake. Skip static + H2 console.
        if (path.startsWith("/api/") || path.startsWith("/ws")) {
            String ip = request.getRemoteAddr();
            if (ip == null) ip = "unknown";
            long minute = System.currentTimeMillis() / 60_000L;
            String key = ip;
            Window w = windows.compute(key, (k, v) -> {
                if (v == null || v.minute() != minute) return new Window(minute, 1);
                return new Window(minute, v.count() + 1);
            });
            // Opportunistic cleanup of stale entries (different minute)
            if (windows.size() > 10_000) {
                windows.entrySet().removeIf(e -> e.getValue().minute() != minute);
            }
            if (w.count() > MAX_PER_MINUTE) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"Rate limit exceeded. Retry in 1 minute.\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
