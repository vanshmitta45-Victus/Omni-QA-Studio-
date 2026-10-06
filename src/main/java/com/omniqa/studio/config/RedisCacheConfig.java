package com.omniqa.studio.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

import java.time.Duration;

/**
 * Prod cache: activates only when app.cache.redis-enabled=true AND Redis host is set.
 * Local dev keeps Caffeine (AsyncConfig.cacheManager).
 */
@Configuration
@ConditionalOnProperty(name = "app.cache.redis-enabled", havingValue = "true")
public class RedisCacheConfig {

    @Bean
    @Primary
    public CacheManager redisCacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration conf = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10))
                .disableCachingNullValues();
        return RedisCacheManager.builder(factory)
                .cacheDefaults(conf)
                .withCacheConfiguration("otpCache", conf.entryTtl(Duration.ofMinutes(10)))
                .withCacheConfiguration("dashboardCache", conf.entryTtl(Duration.ofMinutes(2)))
                .build();
    }
}
