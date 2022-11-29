const ethers = require("ethers");
const axios = require("axios");
const { expect } = require("chai");
const { getQuote, waitForUpload } = require("./test.helpers.js");
const Quote = require("../app/models/quote.model.js");
const { getToken } = require("../app/controllers/tokens.js");


describe("DBS Arweave Upload", function () {
    const providerUri = getToken(parseInt(process.env.CHAIN_ID), process.env.TOKEN_ADDRESS).providerUrl;
    const provider = ethers.getDefaultProvider(providerUri);
    const userWallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY, provider);
    console.log(`user wallet address: ${userWallet.address}`);

    describe("getQuote", function () {

        it("getQuote should respond 400 when request is empty", async function () {
            const res = await axios.post(`http://localhost:8081/getQuote`).catch((err) => err.response);
            expect(res.status).equals(400);
            expect(res.data.message).contains("Missing type");
        });

        it("getQuote should respond 200 when request is valid", async function () {
            const res = await getQuote(userWallet).catch((err) => err.response);
            expect(res.status).equals(200);
            expect(res.data).contains.all.keys(
                "quoteId",
                "chainId",
                "tokenAddress",
                "tokenAmount",
                "approveAddress"
            );
        });

        it("getQuote should respond 200 when request is valid, even when file is 1 TB", async function () {
            const TB = 1_000_000_000_000;
            const res = await getQuote(userWallet, TB).catch((err) => err.response);
            expect(res.status).equals(200);
            expect(res.data).contains.all.keys(
                "quoteId",
                "chainId",
                "tokenAddress",
                "tokenAmount",
                "approveAddress"
            );
        });
    });

    describe("Integration tests", function () {

        const abi = [
            'function approve(address, uint256) external returns (bool)',
            'function balanceOf(address owner) external view returns (uint256)'
        ];

        describe("without approval", function () {

            it("upload, without approval, should fail to pull funds from user account", async function() {
                this.timeout(20 * 1000);

                const getQuoteResponse = await getQuote(userWallet).catch((err) => err.response);
                const quote = getQuoteResponse.data;
                const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);
                const userBalanceBefore = await token.balanceOf(userWallet.address);

                const nonce = Math.floor(new Date().getTime()) / 1000;
                const message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                const signature = await userWallet.signMessage(message);
                const uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                }).catch((err) => err.response);
                expect(uploadResponse.status).equals(400);
                expect(uploadResponse.data.message).contains("Allowance is less than current rate")

                const getStatusResponse = await axios.get(`http://localhost:8081/getStatus?quoteId=${quote.quoteId}`);
                expect(getStatusResponse.data.status).equals(Quote.QUOTE_STATUS_WAITING);

                const userBalanceAfter = await token.balanceOf(userWallet.address);
                expect(userBalanceBefore.eq(userBalanceAfter)).to.be.true;
            });

        });

        describe("with approval", function () {
            const timeoutSeconds = 200;
            this.timeout(timeoutSeconds * 1000);

            afterEach("revoke approval", async function () {
                const serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
                const token = new ethers.Contract(process.env.TOKEN_ADDRESS, abi, userWallet);
                await (await token.approve(serverWallet.address, ethers.BigNumber.from(0))).wait();
            });

            it("upload, with approval, should successfully pull funds from user account", async function() {
                const quoteResponse = await getQuote(userWallet);
                const quote = quoteResponse.data;
                const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);
                const userBalanceBefore = await token.balanceOf(userWallet.address);

                await (await token.approve(quote.approveAddress, ethers.constants.MaxInt256)).wait();

                const nonce = Math.floor(new Date().getTime()) / 1000;
                const message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                const signature = await userWallet.signMessage(message);
                const uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                });
                expect(uploadResponse.status).equals(200);
                expect(uploadResponse.data).equals('');

                const status = await waitForUpload(timeoutSeconds, quote.quoteId);
                expect(status).equals(Quote.QUOTE_STATUS_UPLOAD_END);

                const userBalanceAfter = await token.balanceOf(userWallet.address);
                expect(userBalanceBefore.sub(quote.tokenAmount).lte(userBalanceAfter)).to.be.true;
            });

            it("upload, with approval, should respond 403 when nonce is old", async function() {
                const getQuoteResponse = await getQuote(userWallet).catch((err) => err.response);
                const quote = getQuoteResponse.data;
                const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);

                await (await token.approve(quote.approveAddress, ethers.constants.MaxInt256)).wait();

                let nonce = Math.floor(new Date().getTime()) / 1000;
                let message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                let signature = await userWallet.signMessage(message);
                let uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                }).catch((err) => err.response);

                const status = await waitForUpload(timeoutSeconds, quote.quoteId);
                expect(status).equals(Quote.QUOTE_STATUS_UPLOAD_END);

                // Attempt upload with nonce lower than previous
                nonce = 0;
                message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                signature = await userWallet.signMessage(message);
                uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                }).catch((err) => err.response);
                expect(uploadResponse.status).equals(403);
                expect(uploadResponse.data.message).contains("Invalid nonce");
            });

            it("upload, with approval, should fail when invalid IPFS URI", async function() {
                const timeoutSeconds = 300;
                this.timeout(timeoutSeconds * 1000);

                const quoteResponse = await getQuote(userWallet).catch((err) => err.response);
                const quote = quoteResponse.data;
                const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);

                await (await token.approve(quote.approveAddress, ethers.constants.MaxInt256)).wait();

                const nonce = Math.floor(new Date().getTime()) / 1000;
                const message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                const signature = await userWallet.signMessage(message);
                const uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://Qmbadbadbadbadbadbadbadbadbadbadbadbadbadbadba", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                });
                expect(uploadResponse.status).equals(200);
                expect(uploadResponse.data).equals('');

                const status = await waitForUpload(timeoutSeconds, quote.quoteId);
                expect(status).equals(Quote.QUOTE_STATUS_UPLOAD_DOWNLOAD_FAILED);
            });


            it("getLink, after successful upload, should return a list of transaction IDs", async function() {
                const getQuoteResponse = await getQuote(userWallet).catch((err) => err.response);
                const quote = getQuoteResponse.data;
                const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);

                await (await token.approve(quote.approveAddress, ethers.constants.MaxInt256)).wait();

                let nonce = Math.floor(new Date().getTime()) / 1000;
                let message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                let signature = await userWallet.signMessage(message);
                const uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                    quoteId: quote.quoteId,
                    files: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                    nonce: nonce,
                    signature: signature,
                }).catch((err) => err.response);
                expect(uploadResponse.status).equals(200);
                expect(uploadResponse.data).equals('');

                const status = await waitForUpload(timeoutSeconds, quote.quoteId);
                expect(status).equals(Quote.QUOTE_STATUS_UPLOAD_END);

                nonce = Math.floor(new Date().getTime()) / 1000;
                message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                signature = await userWallet.signMessage(message);
                const getLinkResponse = await axios.get(`http://localhost:8081/getLink?quoteId=${quote.quoteId}&nonce=${nonce}&signature=${signature}`);
                expect(getLinkResponse.status).to.equal(200);
                expect(getLinkResponse.data[0]).contains.all.keys(
                    "type",
                    "transactionHash"
                );
            });

            it("upload, with large file, should successfully upload file to arweave", async function() {
                if (process.env.ENABLE_EXPENSIVE_TESTS == "true") {
                    const timeoutSeconds = 3600;
                    this.timeout(timeoutSeconds * 1000);

                    const quoteResponse = await getQuote(wallet, 1103811824).catch((err) => err.response);
                    const quote = quoteResponse.data;
                    const token = new ethers.Contract(quote.tokenAddress, abi, userWallet);

                    await (await token.approve(quote.approveAddress, ethers.constants.MaxInt256)).wait();

                    let nonce = Math.floor(new Date().getTime()) / 1000;
                    let message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                    let signature = await userWallet.signMessage(message);
                    const uploadResponse = await axios.post(`http://localhost:8081/upload`, {
                        quoteId: quote.quoteId,
                        // 1.1 GB mp4 video, sha256 = 964101726e2191d094fc4d567e60d2171a93b18430b729c68293e5e93fd8585d
                        files: ["ipfs://QmPySemsQXoqMe4jyk9PiJ494jxB3dRL8kekrg9tD64btv", "ipfs://QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx"],
                        nonce: nonce,
                        signature: signature,
                    });
                    expect(uploadResponse.status).equals(200);
                    expect(uploadResponse.data).equals('');

                    const status = await waitForUpload(timeoutSeconds, quote.quoteId);
                    expect(status).equals(Quote.QUOTE_STATUS_UPLOAD_END);

                    nonce = Math.floor(new Date().getTime()) / 1000;
                    message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quote.quoteId + nonce.toString()));
                    signature = await userWallet.signMessage(message);
                    const getLinkResponse = await axios.get(`http://localhost:8081/getLink?quoteId=${quote.quoteId}&nonce=${nonce}&signature=${signature}`);
                    expect(getLinkResponse.status).to.equal(200);
                    expect(getLinkResponse.data[0]).contains.all.keys(
                        "type",
                        "transactionHash"
                    );
                }
                else {
                    this.skip();
                }
            });
        });
    });
});
