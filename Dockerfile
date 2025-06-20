# Build de l'app
FROM node:20-alpine AS builder

WORKDIR /app

# Installation des dépendances
COPY package.json package-lock.json* ./
RUN npm install

# Copie des sources
COPY . .

# Build de l'application Next.js (en mode production)
RUN npm run build

# ======================
# Image finale
# ======================
FROM node:20-alpine

# Installation de docker CLI & curl
RUN apk add --no-cache docker-cli curl bash

# Installation manuelle de docker-compose (v2)
RUN mkdir -p /usr/libexec/docker/cli-plugins && \
    curl -SL https://github.com/docker/compose/releases/download/v2.27.1/docker-compose-linux-x86_64 \
    -o /usr/libexec/docker/cli-plugins/docker-compose && \
    chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# Création d'un dossier partagé (optionnel)
RUN mkdir -p /docker

# Répertoire de travail
WORKDIR /app

# Copie du build depuis l'étape précédente
COPY --from=builder /app .

# Port exposé
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
