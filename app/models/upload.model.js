const sql = require("./db.js");

// constructor
const File = function(file) {
	this.quoteId = file.quoteId;
	this.index = file.index;
	this.length = file.length;
	this.hash = file.hash;
	this.transactionHash = file.transactionHash;
};

File.get = (quoteId, index) => {
	const query = `
		SELECT *
		FROM files
		WHERE "quoteId" = ?
		AND "index" = ?;
	`;
	return sql.prepare(query).get([quoteId, index]);
}

File.setHash = (quoteId, index, transactionHash) => {
	const query = `
		UPDATE files SET transactionHash = ?
		WHERE "quoteId" = ?
		AND "index" = ?;
	`;
	return sql.prepare(query).run([transactionHash, quoteId, index]);
}

module.exports = File;
