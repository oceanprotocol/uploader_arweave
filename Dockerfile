FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json ./

# If you are building your code for production
RUN npm ci
# RUN npm ci --only=production

# Bundle app source
COPY . ./

EXPOSE 8081

CMD ["npm", "start"]
