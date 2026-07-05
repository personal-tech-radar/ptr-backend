# node:20-alpine (musl libc) cannot run Playwright's Chromium — it's missing the glibc-linked
# system libraries Chromium needs. Both stages use the Debian-based `bookworm-slim` image instead
# of Microsoft's `mcr.microsoft.com/playwright` image so the Node version stays pinned to exactly
# what this project already targets, rather than whatever Node version that image ships.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./

# The builder stage never launches a browser (only `nest build`/tsc runs here) — skip Playwright's
# browser download so `npm ci` doesn't spend time/network on a binary this stage never uses.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm ci && \
    npm cache clean --force

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/config ./config

# Installs the Chromium build matching the `playwright` version pinned in package.json, plus the
# Debian system libraries it needs. `--with-deps` runs apt-get itself, so the required library
# list stays correct as Playwright versions change instead of being hand-maintained here.
RUN npx playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

CMD ["node", "dist/main"]
