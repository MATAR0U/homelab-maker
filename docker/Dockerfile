# ---------- Build ----------
FROM python:3.13-slim AS builder

# Install build‑time deps (gcc, libffi, etc.) – nécessaires uniquement pour pip
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libc-dev libffi-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------- Runtime ----------
FROM python:3.13-slim

# Copie des paquets Python depuis le builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

WORKDIR /app

# --- Application code ---
COPY app/ ./app
COPY frontend/ ./static

# Expose le port interne
EXPOSE 8000

# Lancement de l’application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]