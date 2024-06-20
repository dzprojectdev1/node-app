FROM node:10-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install -g node-gyp
RUN npm install
COPY . .
EXPOSE 8080
CMD [ "npm", "start" ]
