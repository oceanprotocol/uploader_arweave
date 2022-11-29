const sql = require("./db.js");

// constructor
const Nonce = function(nonce) {
	this.userAddress = nonce.userAddress;
	this.nonce = nonce.nonce;
};

Nonce.get = (userAddress) => {
	const query = `
		SELECT *
		FROM nonce
		WHERE userAddress = ?;
	`;
	return sql.prepare(query).get([userAddress]);
}

Nonce.set = (userAddress, nonce) => {
	const query = "INSERT OR REPLACE INTO nonce (userAddress, nonce) VALUES (?, ?);";
	sql.prepare(query).run([userAddress, nonce]);
};

module.exports = Nonce;
