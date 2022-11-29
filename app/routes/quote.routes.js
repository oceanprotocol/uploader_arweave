module.exports = app => {
	const quote = require("../controllers/quote.controller.js");

	app.post("/getQuote", quote.create);
	app.get("/getStatus", quote.getStatus);
	app.get("/getLink", quote.getLink);
};
