const Bundlr = require("@bundlr-network/client");
const crypto = require("crypto");
const ethers = require('ethers');

const Quote = require("../models/quote.model.js");
const Nonce = require("../models/nonce.model.js");
const { getToken } = require("./tokens.js");
const { errorResponse } = require("./error.js");
const { gasEstimate } = require("./gasEstimate.js");

const quoteidRegex = /^[a-fA-F0-9]{32}$/;

exports.create = async (req, res) => {
	console.log(`getQuote request: ${JSON.stringify(req.body)}`)

	// Validate request
	if(!req.body) {
		errorResponse(req, res, null, 400, "Content can not be empty!");
		return;
	}

	// validate fields
	let type = req.body.type;
	if(typeof type === "undefined") {
		errorResponse(req, res, null, 400, "Missing type.");
		return;
	}
	if(typeof type !== "string") {
		errorResponse(req, res, null, 400, "Invalid type.");
		return;
	}
	if(type != "arweave") {
		errorResponse(req, res, null, 400, "Invalid type.");
		return;
	}

	let userAddress = req.body.userAddress;
	if(typeof userAddress === "undefined") {
		errorResponse(req, res, null, 400, "Missing userAddress.");
		return;
	}
	if(typeof userAddress !== "string") {
		errorResponse(req, res, null, 400, "Invalid userAddress.");
		return;
	}
	if(!ethers.utils.isAddress(userAddress)) {
		errorResponse(req, res, null, 400, "Invalid userAddress.");
		return;
	}

	let files = req.body.files;
	if(typeof files === "undefined") {
		errorResponse(req, res, null, 400, "Missing files field.");
		return;
	}
	if(typeof files !== "object" || !Array.isArray(files)) {
		errorResponse(req, res, null, 400, "Invalid files field.");
		return;
	}
	if(files.length == 0) {
		errorResponse(req, res, null, 400, "Empty files field.");
		return;
	}

	if(files.length > 64) {
		errorResponse(req, res, null, 400, "Too many files. Max 64.");
		return;
	}

	let totalLength = 0;
	let file_lengths = [];
	for(let i = 0; i < files.length; i++) {
		if(typeof files[i] !== "object") {
			errorResponse(req, res, null, 400, "Invalid files field.");
			return;
		}
		if(!files[i].hasOwnProperty("length")) {
			errorResponse(req, res, null, 400, "Invalid files field.");
			return;
		}
		else {
			file_length = files[i].length;
			if(isNaN(file_length) || (typeof file_length !== "number" && typeof(file_length) !== "string") || (typeof file_length === "string" && file_length.trim() === "")) {
				errorResponse(req, res, null, 400, "Invalid files length.");
				return;
			}
			file_length = parseInt(file_length);

			if(file_length <= 0) {
				errorResponse(req, res, null, 400, "Files length too small.");
				return;
			}
			if(process.env.MAX_UPLOAD_SIZE > 0 && file_length > process.env.MAX_UPLOAD_SIZE) {
				errorResponse(req, res, null, 400, `Individual files may not exceed ${process.env.MAX_UPLOAD_SIZE} bytes`);
				return;
			}
		}
		totalLength = totalLength + file_length
		file_lengths.push(file_length);
	}

	if(process.env.MAX_UPLOAD_SIZE > 0 && totalLength > process.env.MAX_UPLOAD_SIZE) {
		errorResponse(req, res, null, 400, `Total file length may not exceed ${process.env.MAX_UPLOAD_SIZE} bytes`);
		return;
	}

	let payment = req.body.payment;
	if(typeof payment === "undefined") {
		errorResponse(req, res, null, 400, "Missing payment field.");
		return;
	}
	if(typeof payment !== "object") {
		errorResponse(req, res, null, 400, "Invalid payment field.");
		return;
	}

	if(!payment.hasOwnProperty("chainId")) {
		errorResponse(req, res, null, 400, "Missing chainId field.");
		return;
	}
	let chainId = payment.chainId;
	if(isNaN(chainId) || (typeof chainId !== "number" && typeof(chainId) !== "string") || (typeof chainId === "string" && chainId.trim() === "")) {
		errorResponse(req, res, null, 400, "Invalid chainId.");
		return;
	}

	chainId = parseInt(chainId);
	if(chainId <= 0) {
		errorResponse(req, res, null, 400, "chainId too small.");
		return;
	}

	if(!payment.hasOwnProperty("tokenAddress")) {
		errorResponse(req, res, null, 400, "Missing tokenAddress field.");
		return;
	}
	let tokenAddress = payment.tokenAddress;
	if(typeof tokenAddress !== "string") {
		errorResponse(req, res, null, 400, "Invalid tokenAddress.");
		return;
	}
	if(!ethers.utils.isAddress(tokenAddress)) {
		errorResponse(req, res, null, 400, "Invalid tokenAddress format.");
		return;
	}

	const paymentToken = getToken(chainId, tokenAddress);
	if(!paymentToken) {
		errorResponse(req, res, null, 400, "Payment token not accepted.");
		return;
	}

	// Get providerUri from environment, fallback to tokens.providerUrl
	const acceptedPayments = process.env.ACCEPTED_PAYMENTS.split(",");
	const nodeRpcUris = process.env.NODE_RPC_URIS.split(",");
	const jsonRpcUri = nodeRpcUris[acceptedPayments.indexOf(paymentToken.bundlrName)];
	let providerUri;
	if(jsonRpcUri === "default") {
		console.log(`Using "default" provider url (from tokens) = ${paymentToken.providerUrl}`);
		providerUri = paymentToken.providerUrl;
	}
	else {
		console.log(`Using provider url from envvar NODE_RPC_URIS = ${jsonRpcUri}`);
		providerUri = jsonRpcUri;
	}

	// Create Bundlr instance
	let bundlr;
	try {
		const bundlrConfig = { providerUrl: providerUri };
		bundlr = new Bundlr.default(process.env.BUNDLR_URI, paymentToken.bundlrName, process.env.PRIVATE_KEY, bundlrConfig);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Unable to connect to payment processor.");
		return;
	}

	// Get price estimate from Bundlr
	let bundlrPriceWei;
	let priceWei;
	try {
		bundlrPriceWei = await bundlr.getPrice(totalLength);
		priceWei = ethers.BigNumber.from(bundlrPriceWei.toString(10)); // need to convert so we can add buffer
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Unable to get price from payment processor.");
		return;
	}
	console.log(`priceWei = ${priceWei}`);

	// add buffer since price fluctuates
	const uploadFeePlusBuffer = priceWei.add(priceWei.div(process.env.BUNDLR_PRICE_BUFFER ?? 10));
	console.log(`uploadFeePlusBuffer = ${uploadFeePlusBuffer}`);

	// Create provider
	let provider;
	try {
		provider = ethers.getDefaultProvider(providerUri);
		console.log(`network = ${JSON.stringify(await provider.getNetwork())}`);
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while establishing connection to Node RPC provider`);
		return;
	}

	// Create wallet
	let wallet;
	try {
		wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while creating a Wallet instance.`);
		return;
	}

	let feeData;
	try {
		feeData = await provider.getFeeData();
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while getting fee data.`);
		return;
	}
	// Assume all payment chains support EIP-1559 transactions.
	const gasFeeEstimate = gasEstimate.mul(feeData.maxFeePerGas.add(feeData.maxPriorityFeePerGas));
	console.log(`gasFeeEstimate = ${gasFeeEstimate}`);

	const gasFeePlusBuffer = gasFeeEstimate.add(gasFeeEstimate.div(process.env.GAS_PRICE_BUFFER ?? 10));
	console.log(`gasFeePlusBuffer = ${gasFeePlusBuffer}`);

	// Check server fee token balance exeeds fee estimate
	let feeTokenBalance;
	try {
		feeTokenBalance = await wallet.getBalance();
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while getting server fee token balance.`);
		return;
	}
	console.log(`feeTokenBalance = ${feeTokenBalance}`);
	if(gasFeePlusBuffer.gte(feeTokenBalance)) {
		errorResponse(
			req,
			res,
			`Estimated fees exceed server native fee token reserves. feeTokenSymbol: ${paymentToken.symbol} feeEstimate: ${gasFeeEstimate}, feeTokenBalance: ${feeTokenBalance}`,
			503,
			`Server is unable to process payments at this time. Please try again later.`);
		return;
	}

	const quoteId = crypto.randomBytes(16).toString("hex");

	// save data in database
	const quote = new Quote({
		quoteId: quoteId,
		status: Quote.QUOTE_STATUS_WAITING,
		created: Date.now(),
		chainId: chainId,
		tokenAddress: paymentToken.tokenAddress,
		userAddress: userAddress,
		tokenAmount: uploadFeePlusBuffer.add(gasFeePlusBuffer).toString(),
		approveAddress: wallet.address,
		files: file_lengths
	});

	try {
		const data = Quote.create(quote);
		console.log(`${req.path} response: 200: ${JSON.stringify(data)}`);
		res.send(data);
	}
	catch(err) {
		errorResponse(req, res, err, 400, "Error occurred while creating the quote.");
	}
};

exports.getStatus = async (req, res) => {
	console.log(`getStatus request: ${JSON.stringify(req.query)}`)

	if(!req.query || !req.query.quoteId) {
		errorResponse(req, res, null, 400, "Error, quoteId required.");
		return;
	}
	const quoteId = req.query.quoteId;

	if(!quoteidRegex.test(quoteId)) {
		errorResponse(req, res, null, 400, "Invalid quoteId format.");
		return;
	}

	try {
		const status = Quote.getStatus(quoteId);
		if(status == undefined) {
			errorResponse(req, res, null, 404, "Quote not found.");
			return;
		}
		console.log(`${req.path} response: 200: ${JSON.stringify(status)}`);
		res.send(status);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while looking up status.");
	}
};

exports.setStatus = async (quoteId, status) => {
	try {
		Quote.setStatus(quoteId, status);
	}
	catch(err) {
		console.error(err);
	}
};

exports.getLink = async (req, res) => {
	console.log(`getLink request: ${JSON.stringify(req.query)}`)

	if(!req.query || !req.query.quoteId) {
		errorResponse(req, res, null, 400, "Error, quoteId required.");
		return;
	}
	const quoteId = req.query.quoteId;

	if(!quoteidRegex.test(quoteId)) {
		errorResponse(req, res, null, 400, "Invalid quoteId format.");
		return;
	}

	const nonce = req.query.nonce;
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

	let quote;
	try {
		quote = Quote.get(quoteId);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while looking up userAddress.");
		return;
	}

	if(quote == undefined) {
		errorResponse(req, res, null, 404, "Quote not found.");
		return;
	}
	if(quote?.status != Quote.QUOTE_STATUS_UPLOAD_END) {
		errorResponse(req, res, null, 400, "Upload not completed yet.");
		return;
	}

	const userAddress = quote.userAddress;
	const message = ethers.utils.sha256(ethers.utils.toUtf8Bytes(quoteId + nonce.toString()));
	let signerAddress;
	try {
		signerAddress = ethers.utils.verifyMessage(message, signature);
	}
	catch(err) {
		errorResponse(req, res, err, 403, "Invalid signature.");
		return;
	}

	if(signerAddress != userAddress) {
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

	let link;
	try {
		link = Quote.getLink(quoteId);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while looking up link.");
		return;
	}

	if(link == undefined) {
		errorResponse(req, res, null, 404, "Link(s) not found.");
		return;
	}
	console.log(`${req.path} response: 200: ${JSON.stringify(link)}`);
	res.send(link);
};

exports.getHistory = async (req, res) => {
	console.log(`getHistory request: ${JSON.stringify(req.query)}`)

	if(!req.query || !req.query.userAddress) {
		errorResponse(req, res, null, 400, "Error, userAddress required.");
		return;
	}
	const userAddress = req.query.userAddress;

	try {
		const history = Quote.getHistory(userAddress);
		if(history == undefined) {
			errorResponse(req, res, null, 404, "History not found.");
			return;
		}
		console.log('history: ', history);
		console.log(`${req.path} response: 200: ${JSON.stringify(history)}`);
		res.send(history);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while looking up status.");
	}
};
