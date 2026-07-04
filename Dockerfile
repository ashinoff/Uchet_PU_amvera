# ── Stage 1: сборка фронтенда ────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ── Stage 2: боевой образ ────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Локальная таймзона, чтобы date.today() и штампы в интерфейсе
# соответствовали дню пользователей, а не UTC.
ENV TZ=Europe/Moscow
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

# Python-зависимости
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Бэкенд
COPY backend/ ./backend/

# Сборка фронтенда из stage 1 — FastAPI раздаёт её как статику
COPY --from=frontend /app/frontend/dist ./frontend/dist

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
