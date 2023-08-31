module.exports = app => {
	const quote = require("../controllers/quote.controller.js");
	const history = require("../controllers/history.controller.js");

	app.post("/getQuote", quote.create);
	app.get("/getStatus", quote.getStatus);
	app.get("/getLink", quote.getLink);
	app.get("/getHistory", history.getHistory);
};
