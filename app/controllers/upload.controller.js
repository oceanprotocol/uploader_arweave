const Bundlr = require("@bundlr-network/client");

const axios = require('axios');
const File = require("../models/upload.model.js");
const Quote = require("../models/quote.model.js");
const Nonce = require("../models/nonce.model.js");
const ethers = require('ethers');
const { acceptToken } = require("./tokens.js");
const { errorResponse } = require("./error.js");

exports.upload = async (req, res) => {
	console.log(`upload request: ${JSON.stringify(req.body)}`)

	// Validate request
	if(!req.body) {
		errorResponse(req, res, null, 400, "Content can not be empty!");
		return;
	}

	// validate fields
	const quoteId = req.body.quoteId;
	if(typeof quoteId === "undefined") {
		errorResponse(req, res, null, 400, "Missing quoteId.");
		return;
	}
	if(typeof quoteId !== "string") {
		errorResponse(req, res, null, 400, "Invalid quoteId.");
		return;
	}

	const files = req.body.files;
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

	const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})$/i;
	for(let i = 0; i < files.length; i++) {
		if(typeof files[i] !== "string") {
			errorResponse(req, res, null, 400, `Invalid files field on index ${i}.`);
			return;
		}
		// TODO: validate URL format better
		if(!files[i].startsWith('ipfs://')) {
			errorResponse(req, res, null, 400, `Invalid protocol on index ${i}. Must be ipfs://<CID>`);
			return;
		}
		if(!cidRegex.test(files[i].substring(7))) {
			errorResponse(req, res, null, 400, `Invalid CID on index ${i}.`);
			return;
		}
	}

	const nonce = req.body.nonce;
	if(typeof nonce === "undefined") {
		errorResponse(req, res, null, 400, "Missing nonce.");
		return;
	}
	if(typeof nonce !== "number") {
		errorResponse(req, res, null, 400, "Invalid nonce.");
		return;
	}

	const signature = req.body.signature;
	if(typeof signature === "undefined") {
		errorResponse(req, res, null, 400, "Missing signature.");
		return;
	}
	if(typeof signature !== "string") {
		errorResponse(req, res, null, 400, "Invalid signature.");
		return;
	}

	// validate quote
	let quote;
	try {
		quote = Quote.get(quoteId);
		if(quote == undefined) {
			errorResponse(req, res, null, 404, "Quote not found.");
			return;
		}
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Error occurred while validating quote.");
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
		errorResponse(req, res, err, 500, "Error occurred while storing nonce.");
		return;
	}

	// see if token still accepted
	const paymentToken = acceptToken(quote.chainId, quote.tokenAddress);
	if(!paymentToken) {
		errorResponse(req, res, null, 400, "Payment token no longer accepted.");
		return;
	}

	// check status of quote
	if(quote.status != Quote.QUOTE_STATUS_WAITING) {
		if(quote.status == Quote.QUOTE_STATUS_UPLOAD_END) {
			errorResponse(req, res, null, 400, "Quote has been completed.");
			return;
		}
		else {
			errorResponse(req, res, null, 400, "Quote is being processed.");
			return;
		}
	}

	// check if new price is sufficient
	let bundlr;
	try {
		const bundlrConfig = paymentToken.providerUrl ? {providerUrl: paymentToken.providerUrl, contractAddress: paymentToken.tokenAddress} : {};
		bundlr = new Bundlr.default(process.env.BUNDLR_URI, paymentToken.bundlrName, process.env.PRIVATE_KEY, bundlrConfig);
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Could not establish connection to payment processor.");
		return;
	}
	let bundlrPriceWei;
	let priceWei;
	try {
		bundlrPriceWei = await bundlr.getPrice(quote.size)
		priceWei = ethers.BigNumber.from(bundlrPriceWei.toString(10));
	}
	catch(err) {
		errorResponse(req, res, err, 500, "Could not query price from payment processor.");
		return;
	}
	const quoteTokenAmount = ethers.BigNumber.from(quote.tokenAmount);
	if(priceWei.gte(quoteTokenAmount)) {
		errorResponse(req, res, null, 400, `Quoted tokenAmount is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}`);
		return;
	}

	// Create provider
	let provider;
	try {
		const acceptedPayments = process.env.ACCEPTED_PAYMENTS.split(",");
		const jsonRpcUris = process.env.JSON_RPC_URIS.split(",");
		const jsonRpcUri = jsonRpcUris[acceptedPayments.indexOf(paymentToken.bundlrName)];
		if(jsonRpcUri === "default") {
			const defaultProviderUrl = paymentToken.providerUrl;
			console.log(`Using "default" provider url (from tokens) = ${defaultProviderUrl}`);
			provider = ethers.getDefaultProvider(defaultProviderUrl);
		}
		else {
			console.log(`Using provider url from JSON_RPC_URIS = ${jsonRpcUri}`);
			provider = ethers.getDefaultProvider(jsonRpcUri);
		}
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

	// Create payment token contract handle
	let token;
	try {
		const abi = [
			'function transferFrom(address from, address to, uint256 value) external returns (bool)',
			'function allowance(address owner, address spender) external view returns (uint256)',
			'function balanceOf(address owner) external view returns (uint256)',
			'function deposit(uint256 value) external',
			'function withdraw(uint256 value) external',
			'function transfer(address to, uint256 value) external returns (bool)'
		];
		const tokenAddress = paymentToken?.wrappedAddress || paymentToken.tokenAddress ;
		token = new ethers.Contract(tokenAddress, abi, wallet);
		console.log(`payment token address = ${token.address}`);
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while connecting to payment token contract.`);
		return;
	}

	// Check allowance
	let allowance;
	try {
		allowance = await token.allowance(userAddress, wallet.address);
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occured while checking allowance.`);
		return;
	}
	console.log(`allowance = ${allowance}`);
	if(allowance.lt(priceWei)) {
		errorResponse(req, res, null, 400, `Allowance is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}, allowance: ${allowance}`);
		return;
	}

	// Check that user has sufficient funds
	let userBalance;
	try {
		userBalance = await token.balanceOf(userAddress);
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while checking user token balance.`);
		return;
	}
	console.log(`userBalance = ${userBalance}`);
	if(userBalance.lt(priceWei)) {
		errorResponse(req, res, null, 400, `User balance is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}, userBalance: ${userBalance}`);
		return;
	}

	// Estimate gas costs for full upload process
	let transferFromEstimate;
	let unwrapEstimate;
	let sendEthEstimate
	let wrapEstimate;
	let transferEstimate;
	try {
		// 1. Pull ERC-20 token from userAddress
		transferFromEstimate = await token.estimateGas.transferFrom(userAddress, wallet.address, priceWei);
		// 2. Unwrap if necessary
		unwrapEstimate = await token.estimateGas.withdraw(priceWei);
		// 3. Push funds to Bundlr account
		// TODO: Move this to `token` struct in token.js
		const bundlrAddressOnMumbai = "0x853758425e953739F5438fd6fd0Efe04A477b039";
		sendEthEstimate = await wallet.estimateGas({to: bundlrAddressOnMumbai, value: priceWei}); // Assume price not dependent on "to" address
		// 4. Possibly refund in case of non-recoverable failure
		wrapEstimate = await token.estimateGas.deposit(priceWei); // Assume price not dependent on amount
		transferEstimate = await token.estimateGas.transfer(userAddress, priceWei); // Assume price not dependent on amount
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while estimating gas costs for upload.`);
		return;
	}
	console.log(`transferFromEstimate = ${transferFromEstimate}`);
	console.log(`unwrapEstimate = ${unwrapEstimate}`);
	console.log(`sendEthEstimate = ${sendEthEstimate}`);
	console.log(`wrapEstimate = ${wrapEstimate}`);
	console.log(`transferEstimate = ${transferEstimate}`);

	let gasEstimate = transferFromEstimate.add(sendEthEstimate).add(transferEstimate);
	if(paymentToken.wrappedAddress) {
		gasEstimate = gasEstimate.add(unwrapEstimate).add(wrapEstimate);
	}
	console.log(`gasEstimate = ${gasEstimate}`);

	let feeData;
	try {
		feeData = await provider.getFeeData();
	}
	catch(err) {
		errorResponse(req, res, err, 500, `Error occurred while getting fee data.`);
		return;
	}
	// Assume all payment chains support EIP-1559 transactions.
	const feeEstimate = gasEstimate.mul(feeData.maxFeePerGas.add(feeData.maxPriorityFeePerGas));
	console.log(`feeEstimate = ${feeEstimate}`);

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
	if(feeEstimate.gte(feeTokenBalance)) {
		errorResponse(req, res, null, 503, `Estimated fees to process payment exceed fee token reserves. feeEstimate: ${feeEstimate}, feeTokenBalance: ${feeTokenBalance}`);
		return;
	}

	// TODO: Consider Checking Bundlr account balance

	// send 200
	console.log(`${req.path} response: 200`);
	res.send(null);

	// change status
	try {
		Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_START);
	}
	catch(err) {
		console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_START: ${err?.name}: ${err?.message}`);
		return;
	}

	// Pull payment from user's account using transferFrom(userAddress, amount)
	const confirms = paymentToken.confirms;
	try {
		await (await token.transferFrom(userAddress, wallet.address, priceWei)).wait(confirms);
	}
	catch(err) {
		console.error(`Error occurred while pulling payment from user address: ${err?.name}: ${err?.message}`);
		try {
			Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED);
		}
		catch(err) {
			console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED: ${err?.name}: ${err?.message}`);
		}
		return;
	}

	try {
		Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PULL_SUCCESS);
	}
	catch(err) {
		console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PULL_SUCCESS: ${err?.name}: ${err?.message}`);
		return;
	}

	// If payment is wrapped, unwrap it (ex. WETH -> ETH)
	if(paymentToken.wrappedAddress) {
		try {
			await (await token.withdraw(priceWei)).wait(confirms);
		}
		catch(err) {
			console.error(`Error occurred while unwrapping payment: ${err?.name}: ${err?.message}`);
			try {
				Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_UNWRAP_FAILED);
			}
			catch(err) {
				console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_UNWRAP_FAILED: ${err?.name}: ${err?.message}`);
			}
			return;
		}
	}

	try {
		Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_UNWRAP_SUCCESS);
	}
	catch(err) {
		console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_UNWRAP_SUCCESS: ${err?.name}: ${err?.message}`);
		return;
	}

	// Fund server's Bundlr Account
	try {
		await bundlr.fund(bundlrPriceWei);
	}
	catch(err) {
		console.error(`Error occurred while funding Bundlr account: ${err?.name}: ${err?.message}`);
		try {
			Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PUSH_FAILED);
		}
		catch(err) {
			console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PUSH_FAILED: ${err?.name}: ${err?.message}}`);
			return;
		}
	}

	try {
		Quote.setStatus(quoteId, Quote.QUOTE_STATUS_UPLOAD_START);
	}
	catch(err) {
		console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_UPLOAD_START: ${err?.name}: ${err?.message}}`);
		return;
	}

	Promise.all(files.map((file, index) => {
		return new Promise(async (resolve, reject) => {
			// Get quoted file length
			let quotedFileLength;
			try {
				quotedFileLength = File.get(quoteId, index).length;
			}
			catch(err) {
				console.error(`Error occurred while reading quoted file length from database: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`);
				reject(Quote.QUOTE_STATUS_UPLOAD_INTERNAL_ERROR);
				return;
			}

			const ipfsFile = process.env.IPFS_GATEWAY + file.substring(7);

			// download file
			await axios({
				method: "get",
				url: ipfsFile,
				responseType: "arraybuffer"  // Download in chunks, stored in memory
			})
			.then(async res => {
				// download started
				const contentType = res.headers['content-type'];
				const actualLength = parseInt(res.headers['content-length']);

				if(actualLength) {
					if(actualLength > quotedFileLength) {
						console.error(`Actual file length exceeds quoted length. CID = ${file}, file index = ${index}, quoted length = ${quotedFileLength}, actual length ${actualLength}`);
						reject(Quote.QUOTE_STATUS_UPLOAD_ACTUAL_FILE_LEN_EXCEEDS_QUOTE);
						return;
					}
				}
				else {
					console.warn("Warning: Unknown file length. Uploading blindly.");
				}

				// Set the Arweave tags: https://github.com/ArweaveTeam/arweave-standards/blob/master/best-practices/BP-105.md
				const arweaveTags = contentType ? [{name: "Content-Type", value: contentType}] : [];

				const uploader = bundlr.uploader.chunkedUploader;
				uploader.setChunkSize(process.env.BUNDLR_CHUNK_SIZE || 524288); // Default: 512 kB
				uploader.setBatchSize(process.env.BUNDLR_BATCH_SIZE || 1); // Default: 1 chunk at a time

				uploader.on("chunkError", (e) => {
					console.error(`Error uploading chunk number ${e.id} - ${e.res.statusText}. CID = ${file}, file index = ${index}`);
					reject(Quote.QUOTE_STATUS_UPLOAD_UPLOAD_FAILED);
					return;
				});
				uploader.on("done", async (finishRes) => {
					const transactionId = finishRes.data.id;
					try {
						File.setHash(quoteId, index, transactionId);
					}
					catch(err) {
						console.error(`Error occurred while writing file transaction id to database: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`);
						reject(Quote.QUOTE_STATUS_UPLOAD_INTERNAL_ERROR);
						return;
					}

					// perform HEAD request to Arweave Gateway to verify that file uploaded successfully
					try {
						await axios.head(process.env.ARWEAVE_GATEWAY + transactionId, {timeout: 10000});
					}
					catch(err) {
						console.warn(`Unable to verify file via Arweave gateway. transaction id: ${transactionId}, error: ${err?.response?.status}`);
					}

					resolve(transactionId);
					return;
				});

				const transactionOptions = {tags: arweaveTags};
				try {
					// Download each chunk and immediately upload to Bundlr without storing to disk.
					await uploader.uploadData(Buffer.from(res.data, "binary"), transactionOptions);
				}
				catch(err) {
					console.error(`Error occurred while uploading file: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`);
					// TODO: Consider separate status for insufficient funds.
					reject(Quote.QUOTE_STATUS_UPLOAD_UPLOAD_FAILED);
					return;
				}
			})
			.catch(err => {
				console.error(`Error occurred while downloading file ${file}, index ${index}: ${err?.name}: ${err?.message}`);
				reject(Quote.QUOTE_STATUS_UPLOAD_DOWNLOAD_FAILED);
				return;
			});
		});
	})).then(() => {
		try {
			Quote.setStatus(quoteId, Quote.QUOTE_STATUS_UPLOAD_END);
		}
		catch(err) {
			console.error(`Error occurred while setting status to Quote.QUOTE_STATUS_UPLOAD_END: ${err?.name}: ${err?.message}}`);
			return;
		}
	}).catch(quoteStatus => {
		try {
			Quote.setStatus(quoteId, quoteStatus);
		}
		catch(err) {
			console.error(`Error occurred while setting status to ${quoteStatus}: ${err?.name}: ${err?.message}}`);
			return;
		}
	});
};
