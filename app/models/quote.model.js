const sql = require("./db.js");

// constructor
const Quote = function(quote) {
	this.quoteId = quote.quoteId;
	this.status = quote.status;
	this.created = quote.created;
	this.chainId = quote.chainId;
	this.tokenAddress = quote.tokenAddress;
	this.userAddress = quote.userAddress;
	this.tokenAmount = quote.tokenAmount;
	this.approveAddress = quote.approveAddress;
	this.files = quote.files;
};

// status constants
// 0	No such quote
// 1-99	Waiting for files to be uploaded by the user
// 100-199	Processing payment
// 200-299	Processing payment failure modes
// 300-399	Uploading files to storage
// 400	Upload done
// 401-499	Upload failure modes

Quote.QUOTE_STATUS_NONE = 0;
Quote.QUOTE_STATUS_WAITING = 1;
Quote.QUOTE_STATUS_PAYMENT_START = 100;
Quote.QUOTE_STATUS_PAYMENT_PULL_SUCCESS = 101;
Quote.QUOTE_STATUS_PAYMENT_UNWRAP_SUCCESS = 102;
Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED = 200;
Quote.QUOTE_STATUS_PAYMENT_UNWRAP_FAILED = 201;
Quote.QUOTE_STATUS_PAYMENT_PUSH_FAILED = 202;
Quote.QUOTE_STATUS_UPLOAD_START = 300;
Quote.QUOTE_STATUS_UPLOAD_END = 400;
Quote.QUOTE_STATUS_UPLOAD_INTERNAL_ERROR = 401;
Quote.QUOTE_STATUS_UPLOAD_ACTUAL_FILE_LEN_EXCEEDS_QUOTE = 402;
Quote.QUOTE_STATUS_UPLOAD_DOWNLOAD_FAILED = 403;
Quote.QUOTE_STATUS_UPLOAD_UPLOAD_FAILED = 404;

Quote.create = (newQuote) => {
	const params = [
		newQuote.quoteId,
		newQuote.status,
		newQuote.created,
		newQuote.chainId,
		newQuote.tokenAddress,
		newQuote.userAddress,
		newQuote.tokenAmount,
		newQuote.approveAddress,
	];

	const quote_sql = "INSERT INTO quote (quoteId, status, created, chainId, tokenAddress, userAddress, tokenAmount, approveAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";

	sql.prepare(quote_sql).run(params)

	// generate files sql
	const placeholders = newQuote.files.map(() => "(?, ?, ?)").join(', ');
	const files_sql = 'INSERT INTO files ("quoteId", "index", "length") VALUES ' + placeholders;

	let files_params = [];
	newQuote.files.forEach((length, index) => {
		const arr = [newQuote.quoteId, index, length];
		files_params = [...files_params, ...arr];
	});

	sql.prepare(files_sql).run(files_params);

	delete newQuote.status;
	delete newQuote.created;
	delete newQuote.userAddress;
	delete newQuote.files;

	return newQuote;
}


Quote.get = (quoteId) => {
	const query = `
		SELECT *, (SELECT SUM(length) FROM files WHERE quoteId = ?) AS 'size'
		FROM quote
		WHERE quoteId = ?;
	`;
	return sql.prepare(query).get([quoteId, quoteId]);
};

Quote.getStatus = (quoteId) => {
	const query = "SELECT status FROM quote WHERE quoteId = ?;";
	return sql.prepare(query).get([quoteId]);
};

Quote.setStatus = (quoteId, status) => {
	const query = "UPDATE quote SET status = ? WHERE quoteId = ?;"
	sql.prepare(query).run([status, quoteId]);
};

Quote.getLink = (quoteId) => {
	const query = `SELECT 'arweave' AS 'type', transactionHash
		FROM files
		WHERE quoteId = ?
		ORDER BY "index" ASC;`;

	return sql.prepare(query).all([quoteId]);
};

module.exports = Quote;
