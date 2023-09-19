const ethers = require('ethers');
const { errorResponse } = require("./error.js");
const Quote = require("../models/quote.model.js");
const Nonce = require("../models/nonce.model.js");

exports.getHistory = async (req, res) => {
	console.log(`getHistory request: ${JSON.stringify(req.query)}`)

	if(!req.query || !req.query.userAddress) {
		errorResponse(req, res, null, 400, "Error, userAddress required.");
		return;
	}
	const nonce = req.query.nonce;
    const pageSize = parseInt(req.query.pageSize) || 25; 
    const page = parseInt(req.query.page) || 1; // Default to the first page
    const offset = (page - 1) * pageSize;

	if(typeof nonce === "undefined") {
		errorResponse(req, res, null, 400, "Missing nonce.");
		return;
	}
	if(typeof nonce !== "string") {
		errorResponse(req, res, null, 400, "Invalid nonce.");
		return;
	}

	const signature = req.query.signature;
	if(typeof signature === "undefined") {
		errorResponse(req, res, null, 400, "Missing signature.");
		return;
	}
	if(typeof signature !== "string") {
		errorResponse(req, res, null, 400, "Invalid signature format.");
		return;
	}

	const userAddress = req.query.userAddress;
	const message = ethers.utils.sha256(ethers.utils.toUtf8Bytes('' + nonce.toString()));
	let signerAddress;
	try {
		signerAddress = ethers.utils.verifyMessage(message, signature);
	}
	catch(err) {
		errorResponse(req, res, err, 403, "Invalid signature.");
		return;
	}

	if(signerAddress !== userAddress) {
		errorResponse(req, res, null, 403, "Invalid signature.");
		return;
	}

	let oldNonce;
	try {
		oldNonce = Nonce.get(userAddress)?.nonce || 0.0;
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while validating nonce.");
		return;
	}
	if(parseFloat(nonce) <= parseFloat(oldNonce)) {
		errorResponse(req, res, null, 403, "Invalid nonce.");
		return;
	}
	try {
		Nonce.set(userAddress, nonce);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while setting nonce.");
		return;
	}

	try {
		const history = Quote.getHistory(userAddress, offset, pageSize);
		if (history === undefined) {
            console.log('history not found')
            errorResponse(req, res, null, 404, "History not found.");
            return;
        }
		console.log(`${req.path} response: 200: ${JSON.stringify(history)}`);

		res.send(history);
	}
	catch(err) {
        console.error(err); 
		errorResponse(req, res, err, 500, "Error occurred while looking up history.");
	}
};
