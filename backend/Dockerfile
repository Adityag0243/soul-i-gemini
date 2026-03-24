FROM node:22

USER node

WORKDIR /home/node/app

COPY --chown=node:node package*.json ./

RUN npm install

COPY --chown=node:node . .

# Increase memory for build
ENV NODE_OPTIONS=--max-old-space-size=1024

# ✅ Build at image time (NOT runtime)
RUN npm run build

EXPOSE 8000

# ✅ Directly run built code
CMD ["node", "-r", "dotenv/config", "dist/index.js"]