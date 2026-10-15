# Porównywarka CV – obraz Docker (aplikacja wewnętrzna, jeden kontener).
# Dane (baza + pliki CV) są w wolumenie /app/storage – NIE w obrazie.
FROM node:22-bookworm-slim

# LibreOffice służy wyłącznie do konwersji starych plików .doc → .docx.
# Aby zbudować mniejszy obraz bez tej funkcji: docker build --build-arg WITH_LIBREOFFICE=false .
ARG WITH_LIBREOFFICE=true
RUN if [ "$WITH_LIBREOFFICE" = "true" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends libreoffice-writer-nogui \
      && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# --ignore-scripts: zależności natywne (better-sqlite3, canvas) mają gotowe binarki w paczkach npm,
# więc nie jest potrzebny kompilator; klienta Prismy generujemy jawnie.
RUN npm ci --ignore-scripts && npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    DATA_DIR=/app/storage \
    DATABASE_URL=file:/app/storage/app.db \
    PORT=3000 \
    HOSTNAME=0.0.0.0
VOLUME ["/app/storage"]
EXPOSE 3000

# prestart: przygotowanie katalogów i migracje bazy, potem serwer
CMD ["npm", "start"]
