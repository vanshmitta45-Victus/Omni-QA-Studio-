@echo off
REM Local dev without Docker
if not exist frontend\.env copy frontend\.env.example frontend\.env
set SPRING_PROFILES_ACTIVE=local
set CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
set REDIS_ENABLED=false
start "omniqa-backend" mvnw.cmd spring-boot:run
cd frontend
npm run dev
