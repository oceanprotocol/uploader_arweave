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
ENV ACCEPTED_PAYMENTS=ethereum,matic
ENV NODE_RPC_URIS=default,default
#ENV BUNDLR_URI="https://node1.bundlr.network"
ENV BUNDLR_URI="https://devnet.bundlr.network"
ENV PORT=8081
ENV PRIVATE_KEY="0000000000000000000000000000000000000000000000000000000000000000"
ENV SQLITE_DB_PATH=/usr/src/app/db.sqlite3
ENV REGISTRATION_INTERVAL=30000
ENV DBS_URI="http://localhost"
ENV SELF_URI="https://localhost"
ENV IPFS_GATEWAY="https://cloudflare-ipfs.com/ipfs/"
ENV ARWEAVE_GATEWAY="https://arweave.net/"
ENV MAX_UPLOAD_SIZE=1099511627776
ENV BUNDLR_BATCH_SIZE=1
ENV BUNDLR_CHUNK_SIZE=524288
ENV BUNDLR_PRICE_BUFFER=10
ENV GAS_PRICE_BUFFER=10

EXPOSE 8081

CMD ["npm", "start"]