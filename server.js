const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const ethers = require('ethers');
const { getAcceptedPaymentDetails } = require("./app/controllers/tokens.js");
const { checkConfig } = require("./app/controllers/config.js");
const { errorResponse } = require("./app/controllers/error.js");

const app = express();
app.disable('x-powered-by');

if(!checkConfig()) {
	process.exit(1);
}

app.use(function(req, res, next) {
    next(); // moves to next middleware
});

// parse requests of content-type - application/json
app.use(bodyParser.json());
app.use(function(error, req, res, next) {
	// catch json error
	errorResponse(req, res, null, 400, "Invalid JSON");
});

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// simple route
app.get("/", (req, res) => {
	res.json({ message: "Welcome to API application." });
});
app.get("/robots.txt", (req, res) => {
	res.set("Content-Type", "text/plain");
	res.send("User-agent: *\nDisallow: /\n");
});

require("./app/routes/quote.routes.js")(app);
require("./app/routes/upload.routes.js")(app);

// set port, listen for requests
const PORT = process.env.PORT || 8081;
app.listen(PORT, "0.0.0.0", () => {
	console.log(`API Server is running at http://0.0.0.0:${PORT}/`);
	const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
	console.log(`Server wallet address = ${wallet.address}`);
	if(process.env.DBS_URI !== "DEBUG") {
		register();
		const registrationTimer = setInterval(register, process.env.REGISTRATION_INTERVAL || 30000)
		// Don't call timeout if it is the last code to execute, won't keep process alive.
		registrationTimer.unref()
	}
	else {
		console.log('Registration disabled because DBS_URI == "DEBUG"');
	}
});

const register = () => {
	axios.post(`${process.env.DBS_URI}/register`, {
		type: "arweave",
		description: "File storage on Arweave",
		url: process.env.SELF_URI,
		payment: getAcceptedPaymentDetails(),
	})
	.catch((error) => {
		console.error('Error registering with DBS:', error);
	})
}
