module.exports = app => {
	const upload = require("../controllers/upload.controller.js");

	app.post("/upload", upload.upload);
};
