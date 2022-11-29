const axios = require("axios");
const Quote = require("../app/models/quote.model");

exports.getQuote = async (wallet, size = 119762) => {
    return axios.post(`http://localhost:8081/getQuote`, {
        type: "arweave",
        userAddress: wallet.address,
        files: [{length: size}, {length: 13}],
        payment: {
            chainId: process.env.CHAIN_ID,
            tokenAddress: process.env.TOKEN_ADDRESS,
        },
    });
}

exports.waitForUpload = async (timeoutSeconds, quoteId) => {
    let status;
    for(let i = 0; i < timeoutSeconds; i++) {
        const getStatusResponse = await axios.get(`http://localhost:8081/getStatus?quoteId=${quoteId}`);
        status = getStatusResponse.data.status;
        // if 200 - 299 or 400 - 499
        if((status >= Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED
            && status < Quote.QUOTE_STATUS_UPLOAD_START)
        || status >= Quote.QUOTE_STATUS_UPLOAD_END) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return status;
};
