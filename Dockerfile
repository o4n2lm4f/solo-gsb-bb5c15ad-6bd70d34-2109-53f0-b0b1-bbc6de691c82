# ---- 阶段 1：构建 React 前端 ----
FROM node:20-alpine AS build
WORKDIR /app

# 先拷贝 workspace 清单以利用缓存
COPY package.json package-lock.json* ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

# 安装全部依赖（workspaces 会提升到根 node_modules）
RUN npm install

# 拷贝源码并构建前端（产物输出到 client/dist）
COPY client ./client
COPY server ./server
RUN npm run build -w client

# ---- 阶段 2：仅后端 + 静态产物的运行镜像 ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# 运行阶段不依赖 npm workspaces：只安装 server 的生产依赖
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 4000
CMD ["node", "server/src/server.js"]
