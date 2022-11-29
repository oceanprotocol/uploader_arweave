const db_file = process.env.SQLITE_DB_PATH;

const sqlite = require('better-sqlite3');
const path = require('path');

const create_quote = `
	CREATE TABLE IF NOT EXISTS "quote" (
		"quoteId"	TEXT NOT NULL UNIQUE,
		"status"	INTEGER NOT NULL,
		"created"	INTEGER NOT NULL,
		"chainId"	INTEGER NOT NULL,
		"tokenAddress"	TEXT NOT NULL,
		"userAddress"	TEXT NOT NULL,
		"tokenAmount"	TEXT,
		"approveAddress"	TEXT NOT NULL,
		PRIMARY KEY("quoteId")
	);
`;

const create_files = `
	CREATE TABLE IF NOT EXISTS "files" (
		"quoteId"	TEXT NOT NULL,
		"index"	INTEGER NOT NULL,
		"length"	INTEGER NOT NULL,
		"transactionHash"	TEXT,
		FOREIGN KEY("quoteId") REFERENCES "quote"("quoteId") ON DELETE CASCADE,
		PRIMARY KEY("quoteId","index")
	);
`;

const create_nonce = `
	CREATE TABLE IF NOT EXISTS "nonce" (
		"userAddress"	TEXT NOT NULL UNIQUE,
		"nonce"	FLOAT,
		PRIMARY KEY("userAddress")
	);
`;

let db;
try {
	db = new sqlite(path.resolve(db_file));
}
catch(err) {
	console.log(err);
}

const check_sql = "SELECT name FROM sqlite_master WHERE type='table' AND name='quote';";
const stmt = db.prepare(check_sql);
const tables = stmt.get();
if(!tables) {
	try {
		db.prepare(create_quote).run();
		db.prepare(create_files).run();
		db.prepare(create_nonce).run();
	}
	catch(err) {
		console.log(err);
	}
}

module.exports = db;

