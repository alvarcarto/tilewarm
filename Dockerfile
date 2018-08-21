FROM node:10-alpine
WORKDIR /app
COPY . .

RUN npm install

ENTRYPOINT ["node", "src/index.js"]
