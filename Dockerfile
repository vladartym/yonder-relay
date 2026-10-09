# The Yonder relay. It needs only main.ts, and privacy.html for /privacy. Put HTTPS in front of it (compose.yml).
FROM oven/bun:1-alpine
WORKDIR /app
COPY main.ts privacy.html ./
USER bun
EXPOSE 8080
CMD ["bun", "main.ts"]
