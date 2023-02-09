const { URL } = require('url');

const checkConfig = () => {
	const acceptedPayments = process.env.ACCEPTED_PAYMENTS;
	if(acceptedPayments == null) {
		console.log("ACCEPTED_PAYMENTS environment variable not set");
		return false;
	}
	const payments = acceptedPayments.split(",");

	const nodeRpcUris = process.env.NODE_RPC_URIS;
	if(nodeRpcUris == null) {
		console.log("NODE_RPC_URIS environment variable not set");
		return false;
	}
	const uris = nodeRpcUris.split(",");
	if(uris.length != payments.length) {
		console.log("ACCEPTED_PAYMENTS and NODE_RPC_URIS environment variables do not have the same number of entries");
		console.log(uris);
		console.log(payments);
		return false;
	}
	for(let i = 0; i < uris.length; i++) {
		let url;
		if(uris[i] != "default") {
			try {
				url = new URL(uris[i]);
				if(url.protocol != "http:" && url.protocol != "https:") { // do we allow wss://?
					console.log("each NODE_RPC_URIS should be http or https");
					return false;
				}
			}
			catch(err) {
				console.log("One of the NODE_RPC_URIS is invalid");
				return false;
			}
		}
	}

	const bundlrUri = process.env.BUNDLR_URI;
	if(bundlrUri == null) {
		console.log("BUNDLR_URI environment variable not set");
		console.log("Try https://node1.bundlr.network or https://devnet.bundlr.network");
		return false;
	}
	try {
		const bundlrUrl = new URL(bundlrUri);
		if(bundlrUrl.protocol != "http:" && bundlrUrl.protocol != "https:") {
			console.log("BUNDLR_URI should be http or https");
			return false;
		}
	}
	catch(err) {
		console.log("BUNDLR_URI is invalid");
		return false;
	}

	const privateKey = process.env.PRIVATE_KEY;
	if(privateKey == null) {
		console.log("PRIVATE_KEY environment variable not set");
		return false;
	}
	const keyRegex = /^[0-9A-F]{64,}$/i;
	if(!keyRegex.test(privateKey)) {
		console.log("PRIVATE_KEY environment variable has invalid format");
		return false;
	}

	const sqlitePath = process.env.SQLITE_DB_PATH;
	if(sqlitePath == null) {
		console.log("SQLITE_DB_PATH environment variable not set");
		return false;
	}

	const port = process.env.ARWEAVE_DBS_PORT;
	if(port != null && isNaN(port)) {
		console.log("ARWEAVE_DBS_PORT environment variable should be a number");
		return false;
	}

	const registrationInterval = process.env.REGISTRATION_INTERVAL;
	if(registrationInterval != null && isNaN(registrationInterval)) {
		console.log("REGISTRATION_INTERVAL environment variable should be the number of milliseconds between registration calls");
		return false;
	}

	const dbsUri = process.env.DBS_URI;
	if(dbsUri == null) {
		console.log("DBS_URI environment variable not set");
		return false;
	}
	if(dbsUri != "DEBUG") {
		try {
			const dbsUrl = new URL(dbsUri);
			if(dbsUrl.protocol != "http:" && dbsUrl.protocol != "https:") {
				console.log("DBS_URI should be http or https");
				return false;
			}
		}
		catch(err) {
			console.log("DBS_URI is invalid");
			return false;
		}
	}

	const selfUri = process.env.SELF_URI;
	if(selfUri == null) {
		console.log("SELF_URI environment variable not set");
		return false;
	}
	try {
		const selfUrl = new URL(selfUri);
		if(selfUrl.protocol != "http:" && selfUrl.protocol != "https:") {
			console.log("SELF_URI should be http or https");
			return false;
		}
	}
	catch(err) {
		console.log("SELF_URI is invalid");
		return false;
	}

	const ipfsUri = process.env.IPFS_GATEWAY;
	if(ipfsUri == null) {
		console.log("IPFS_GATEWAY environment variable not set");
		return false;
	}
	try {
		const ipfsUrl = new URL(ipfsUri);
		if(ipfsUrl.protocol != "http:" && ipfsUrl.protocol != "https:") {
			console.log("IPFS_GATEWAY should be http or https");
			return false;
		}
	}
	catch(err) {
		console.log("IPFS_GATEWAY is invalid");
		return false;
	}

	const arweaveUri = process.env.ARWEAVE_GATEWAY;
	if(arweaveUri == null) {
		console.log("ARWEAVE_GATEWAY environment variable not set");
		return false;
	}
	try {
		const arweaveUrl = new URL(arweaveUri);
		if(arweaveUrl.protocol != "http:" && arweaveUrl.protocol != "https:") {
			console.log("ARWEAVE_GATEWAY should be http or https");
			return false;
		}
	}
	catch(err) {
		console.log("ARWEAVE_GATEWAY is invalid");
		return false;
	}

	const bundlrBatchSize = process.env.BUNDLR_BATCH_SIZE;
	if(bundlrBatchSize != null && isNaN(bundlrBatchSize)) {
		console.log("BUNDLR_BATCH_SIZE environment variable should be a number");
		return false;
	}

	const bundlrChunkSize = process.env.BUNDLR_CHUNK_SIZE;
	if(bundlrChunkSize != null && isNaN(bundlrChunkSize)) {
		console.log("BUNDLR_CHUNK_SIZE environment variable should be a number");
		return false;
	}

	const maxUploadSize = process.env.MAX_UPLOAD_SIZE;
	if(maxUploadSize == null) {
		console.log("MAX_UPLOAD_SIZE environment variable not set");
		return false;
	}
	if(isNaN(maxUploadSize)) {
		console.log("MAX_UPLOAD_SIZE environment variable should be a number, in bytes");
		return false;
	}

	const bundlrPriceBuffer = process.env.BUNDLR_PRICE_BUFFER;
	if(bundlrPriceBuffer != null && isNaN(bundlrPriceBuffer)) {
		console.log("BUNDLR_PRICE_BUFFER environment variable should be a number");
		return false;
	}

	const gasPriceBuffer = process.env.GAS_PRICE_BUFFER;
	if(gasPriceBuffer != null && isNaN(gasPriceBuffer)) {
		console.log("GAS_PRICE_BUFFER environment variable should be a number");
		return false;
	}

	return true;
};

module.exports = { checkConfig };
