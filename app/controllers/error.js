errorResponse = (req, res, err, statusCode, message) => {
	const userError = { message: message };
	let systemError;
	if(err) {
		if(err?.name && err?.message) {
			systemError = err?.name + " " + err?.message;
		}
		else {
			systemError = err?.toString();
		}
	}
	else {
		systemError = message;
	}
	console.error(`${req.path} response: ${statusCode}: ${systemError}`);
	res.status(statusCode).send(userError);
}

module.exports = { errorResponse };
