# OmniQA Studio

Enterprise QA Intelligence, Test Automation, and Collaboration Platform.

## Stack (merged single project)

- Backend: Spring Boot 4.1.1 / Java 21 (`src/`), JPA, Security + JWT, WebSocket, Mail, GCS, Caffeine (+ optional Redis)
- Merged `ai-test` module (`src/main/java/com/omniqa/studio/aitest/`): DOM extraction (JSoup + headless Chrome), Selenium code generation (OpenAI with local Ollama `llama3.2` fallback), self-healing locators, in-JVM sandbox compile+run — served at `/api/ai-test/*`
- Frontend: React 19 + Vite 8 + Tailwind 4 (`frontend/`, dev `:5173`), incl. Autonomous Lab page (`/autonomous`: Generator, Self-Healing, Sandbox Runner, History)
- Gateway: Spring Cloud Gateway `:8081` (CORS + Redis rate-limit)
- Automation-Engine: Selenium + TestNG + Cucumber + REST Assured (`automation-engine/`)

## Run locally (no Docker)

Requirements: Java 21, Node 20+.

```bat
REM Option A (cmd)
start-dev.bat

REM Option B (powershell)
powershell -ExecutionPolicy Bypass -File ./start-dev.ps1
```

This starts:
- Backend `http://localhost:8080` with H2 (`SPRING_PROFILES_ACTIVE=local`, no Redis/Postgres needed)
- Frontend `http://localhost:5173` (Vite proxies `/api` + `/ws` to `:8080`)

Manual:
```powershell
$env:SPRING_PROFILES_ACTIVE="local"
$env:CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
$env:REDIS_ENABLED="false"
.\mvnw.cmd spring-boot:run
cd frontend; npm install; npm run dev
```

H2 console: `http://localhost:8080/h2-console` (JDBC `jdbc:h2:mem:omniqadb`, user `sa`).

First registered user becomes `ROLE_ADMIN`.

## Run with Docker

```bash
docker compose up --build
```
- Frontend `:5173` -> Gateway `:8081` -> Backend `:8080` + Redis `:6379`
- Backend uses `SPRING_PROFILES_ACTIVE=default` (Postgres via `DB_URL`) + `REDIS_ENABLED=true`.

## Env

Copy `.env.example` to `.env`. Key vars:
`SPRING_PROFILES_ACTIVE, PORT, CORS_ALLOWED_ORIGINS, REDIS_ENABLED, SERVICE_API_KEY, DB_URL/USERNAME/PASSWORD, JWT_SECRET, AI_API_KEY/URL/MODEL, OLLAMA_BASE_URL/MODEL, MAIL_*, GCS_*, BACKEND_URL/WS_URL, SPRING_DATA_REDIS_*`.

- `REDIS_ENABLED=false` locally (Caffeine). Set `true` only when Redis is up.
- `SERVICE_API_KEY` empty = open dev ingest for `POST /api/test-runs`. Set it in prod.
- Mail/GCS/AI are optional — backend logs a warning and continues with local fallbacks (`uploads/`, regex analyzer).
- `ai-test` generation: OpenAI when `AI_API_KEY` is set, else local Ollama (`OLLAMA_BASE_URL`, default `llama3.2`). `GET /api/ai-test/health` is open; other `/api/ai-test/*` require JWT.

## Notes

- Frontend SPA refresh works via `frontend/nginx.conf` (`try_files ... /index.html`).
- Uploads stored in `uploads/` locally, GCS when credentials are set.
