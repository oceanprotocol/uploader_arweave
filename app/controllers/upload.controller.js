const Bundlr = require("@bundlr-network/client");

const axios = require("axios");
const File = require("../models/upload.model.js");
const Quote = require("../models/quote.model.js");
const Nonce = require("../models/nonce.model.js");
const ethers = require("ethers");
const { getToken } = require("./tokens.js");
const { errorResponse } = require("./error.js");
const MIN_GAS_FEE_POLYGON = 30000000000; // 30 gwei

exports.upload = async (req, res) => {
  console.log(`upload request: ${JSON.stringify(req.body)}`);

  // Validate request
  if (!req.body) {
    errorResponse(req, res, null, 400, "Content can not be empty!");
    return;
  }

  // validate fields
  const quoteId = req.body.quoteId;
  if (typeof quoteId === "undefined") {
    errorResponse(req, res, null, 400, "Missing quoteId.");
    return;
  }
  if (typeof quoteId !== "string") {
    errorResponse(req, res, null, 400, "Invalid quoteId.");
    return;
  }

  const files =
    typeof req.body.files === "string" ? [req.body.files] : req.body.files;
  if (typeof files === "undefined") {
    errorResponse(req, res, null, 400, "Missing files field.");
    return;
  }
  if (typeof files !== "object" || !Array.isArray(files)) {
    errorResponse(req, res, null, 400, "Invalid files field.");
    return;
  }
  if (files.length == 0) {
    errorResponse(req, res, null, 400, "Empty files field.");
    return;
  }

  if (files.length > 64) {
    errorResponse(req, res, null, 400, "Too many files. Max 64.");
    return;
  }

  const cidRegex =
    /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})$/i;
  for (let i = 0; i < files.length; i++) {
    if (typeof files[i] !== "string") {
      errorResponse(req, res, null, 400, `Invalid files field on index ${i}.`);
      return;
    }
    // TODO: validate URL format better
    if (!files[i].startsWith("ipfs://")) {
      errorResponse(
        req,
        res,
        null,
        400,
        `Invalid protocol on index ${i}. Must be ipfs://<CID>`
      );
      return;
    }
    if (!cidRegex.test(files[i].substring(7))) {
      errorResponse(req, res, null, 400, `Invalid CID on index ${i}.`);
      return;
    }
  }

  if (typeof req.body.nonce === "undefined") {
    errorResponse(req, res, null, 400, "Missing nonce.");
    return;
  }

  const nonce = Number(req.body.nonce);

  if (isNaN(nonce)) {
    errorResponse(req, res, null, 400, "Invalid nonce.");
    return;
  }

  const signature = req.body.signature;
  if (typeof signature === "undefined") {
    errorResponse(req, res, null, 400, "Missing signature.");
    return;
  }
  if (typeof signature !== "string") {
    errorResponse(req, res, null, 400, "Invalid signature.");
    return;
  }

  // validate quote
  let quote;
  try {
    quote = Quote.get(quoteId);
    if (quote == undefined) {
      errorResponse(req, res, null, 404, "Quote not found.");
      return;
    }
  } catch (err) {
    errorResponse(req, res, err, 500, "Error occurred while validating quote.");
    return;
  }

  const userAddress = quote.userAddress;
  const message = ethers.utils.sha256(
    ethers.utils.toUtf8Bytes(quoteId + nonce.toString())
  );
  let signerAddress;
  try {
    signerAddress = ethers.utils.verifyMessage(message, signature);
  } catch (err) {
    errorResponse(req, res, err, 403, "Invalid signature.");
    return;
  }

  if (signerAddress != userAddress) {
    errorResponse(req, res, null, 403, "Invalid signature.");
    return;
  }

  let oldNonce;
  try {
    oldNonce = Nonce.get(userAddress)?.nonce || 0.0;
  } catch (err) {
    errorResponse(req, res, err, 500, "Error occurred while validating nonce.");
    return;
  }
  if (parseFloat(nonce) <= parseFloat(oldNonce)) {
    errorResponse(req, res, null, 403, "Invalid nonce.");
    return;
  }
  try {
    Nonce.set(userAddress, nonce);
  } catch (err) {
    errorResponse(req, res, err, 500, "Error occurred while storing nonce.");
    return;
  }

  // check status of quote
  if (quote.status != Quote.QUOTE_STATUS_WAITING) {
    if (quote.status == Quote.QUOTE_STATUS_UPLOAD_END) {
      errorResponse(req, res, null, 400, "Quote has been completed.");
      return;
    } else {
      errorResponse(req, res, null, 400, "Quote is being processed.");
      return;
    }
  }

  // see if token still accepted
  const paymentToken = getToken(quote.chainId, quote.tokenAddress);
  if (!paymentToken) {
    errorResponse(req, res, null, 400, "Payment token no longer accepted.");
    return;
  }

  // Get providerUri from environment, fallback to tokens.providerUrl
  const acceptedPayments = process.env.ACCEPTED_PAYMENTS.split(",");
  const nodeRpcUris = process.env.NODE_RPC_URIS.split(",");
  const jsonRpcUri =
    nodeRpcUris[acceptedPayments.indexOf(paymentToken.bundlrName)];
  let providerUri;
  if (jsonRpcUri === "default") {
    console.log(
      `Using "default" provider url from tokens.js = ${paymentToken.providerUrl}`
    );
    providerUri = paymentToken.providerUrl;
  } else {
    console.log(`Using provider url from envvar NODE_RPC_URIS = ${jsonRpcUri}`);
    providerUri = jsonRpcUri;
  }

  // Create Bundlr instance
  let bundlr;
  try {
    const bundlrConfig = { providerUrl: providerUri };
    bundlr = new Bundlr.default(
      process.env.BUNDLR_URI,
      paymentToken.bundlrName,
      process.env.PRIVATE_KEY,
      bundlrConfig
    );
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      "Could not establish connection to payment processor."
    );
    return;
  }

  // check if new price is sufficient
  let bundlrPriceWei;
  let priceWei;
  try {
    console.log("get quote from bundlr");
    bundlrPriceWei = await bundlr.getPrice(quote.size);
    priceWei = ethers.BigNumber.from(bundlrPriceWei.toString(10));
    console.log(`bundlr quote PriceWei = ${bundlrPriceWei}`);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      "Could not query price from payment processor."
    );
    return;
  }
  const quoteTokenAmount = ethers.BigNumber.from(quote.tokenAmount);
  if (priceWei.gte(quoteTokenAmount)) {
    errorResponse(
      req,
      res,
      null,
      400,
      `Quoted tokenAmount is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}`
    );
    return;
  }

  // Create provider
  let provider;
  try {
    console.log("create provider");
    provider = ethers.getDefaultProvider(providerUri);
    console.log(`network = ${JSON.stringify(await provider.getNetwork())}`);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      `Error occurred while establishing connection to Node RPC provider`
    );
    return;
  }

  // Create wallet
  let wallet;
  try {
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      `Error occurred while creating a Wallet instance.`
    );
    return;
  }

  // Create payment token contract handle
  let token;
  try {
    const abi = [
      "function transferFrom(address from, address to, uint256 value) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)",
      "function balanceOf(address owner) external view returns (uint256)",
      "function deposit(uint256 value) external",
      "function withdraw(uint256 value) external",
      "function transfer(address to, uint256 value) external returns (bool)",
    ];
    const tokenAddress = paymentToken.tokenAddress;
    token = new ethers.Contract(tokenAddress, abi, wallet);
    console.log(`payment token address = ${token.address}`);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      `Error occurred while connecting to payment token contract.`
    );
    return;
  }

  // Check allowance
  let allowance;
  try {
    console.log("check allowance");
    allowance = await token.allowance(userAddress, wallet.address);
    console.log(`allowance = ${allowance}`);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      `Error occured while checking allowance.`
    );
    return;
  }
  if (allowance.lt(priceWei)) {
    errorResponse(
      req,
      res,
      null,
      400,
      `Allowance is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}, allowance: ${allowance}`
    );
    return;
  }

  // Check that user has sufficient funds
  let userBalance;
  try {
    console.log("Check that user has sufficient funds");
    userBalance = await token.balanceOf(userAddress);
    console.log(`userBalance = ${userBalance}`);
  } catch (err) {
    errorResponse(
      req,
      res,
      err,
      500,
      `Error occurred while checking user token balance.`
    );
    return;
  }
  if (userBalance.lt(priceWei)) {
    errorResponse(
      req,
      res,
      null,
      400,
      `User balance is less than current rate. Quoted amount: ${quote.tokenAmount}, current rate: ${priceWei}, userBalance: ${userBalance}`
    );
    return;
  }

  // send 200
  console.log(`${req.path} response: 200`);
  res.send(null);

  // change status
  try {
    Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_START);
  } catch (err) {
    console.error(
      `Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_START: ${err?.name}: ${err?.message}`
    );
    return;
  }

  // Fetch Gas price
  let feePerGas;
  let priorityFeePerGas;
  try {
    console.log("Fetch Gas price");
    const feeHistory = await provider.getFeeData();
    priorityFeePerGas = Number(
      feeHistory.maxPriorityFeePerGas?.toString() || MIN_GAS_FEE_POLYGON
    );
    feePerGas = Number(
      feeHistory.maxFeePerGas?.toString() || MIN_GAS_FEE_POLYGON
    );

    // Check gas fees are above minimum
    priorityFeePerGas = Math.max(priorityFeePerGas, MIN_GAS_FEE_POLYGON);
    feePerGas = Math.max(feePerGas, MIN_GAS_FEE_POLYGON);
    console.log(`priorityFeePerGas = ${priorityFeePerGas}`);
    console.log(`feePerGas = ${feePerGas}`);
  } catch (err) {
    console.error(
      `Using default gas price. Error occurred while fetching gas price: ${err?.name}: ${err?.message}`
    );
    priorityFeePerGas = 300000000000; // default values
    feePerGas = 300000000000; // default values
    console.log(`priorityFeePerGas = ${priorityFeePerGas}`);
    console.log(`feePerGas = ${feePerGas}`);
  }

  // Pull payment from user's account using transferFrom(userAddress, amount)
  try {
    console.log(
      "token transferFrom",
      userAddress,
      wallet.address,
      priceWei.toString()
    );

    const txResponse = await token.transferFrom(
      userAddress,
      wallet.address,
      priceWei,
      {
        maxPriorityFeePerGas: priorityFeePerGas,
        maxFeePerGas: feePerGas,
      }
    );
    console.log(`transferFrom txResponse = ${JSON.stringify(txResponse)}`);
  } catch (err) {
    console.error(
      `Error occurred while pulling payment from user address: ${err?.name}: ${err?.message}`
    );
    try {
      Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED);
    } catch (err) {
      console.error(
        `Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PULL_FAILED: ${err?.name}: ${err?.message}`
      );
    }
    return;
  }

  try {
    console.log("Set status QUOTE_STATUS_PAYMENT_PULL_SUCCESS");
    Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PULL_SUCCESS);
  } catch (err) {
    console.error(
      `Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PULL_SUCCESS: ${err?.name}: ${err?.message}`
    );
    return;
  }

  // Fund server's Bundlr Account
  try {
    console.log("Fund Bundlr Account");
    await bundlr.fund(bundlrPriceWei);
    console.log("bundlr funded successfully");
  } catch (err) {
    console.error(
      `Error occurred while funding Bundlr account: ${err?.name}: ${err?.message}`
    );
    try {
      Quote.setStatus(quoteId, Quote.QUOTE_STATUS_PAYMENT_PUSH_FAILED);
    } catch (err) {
      console.error(
        `Error occurred while setting status to Quote.QUOTE_STATUS_PAYMENT_PUSH_FAILED: ${err?.name}: ${err?.message}}`
      );
      return;
    }
  }

  try {
    console.log("Set status QUOTE_STATUS_UPLOAD_START");
    Quote.setStatus(quoteId, Quote.QUOTE_STATUS_UPLOAD_START);
  } catch (err) {
    console.error(
      `Error occurred while setting status to Quote.QUOTE_STATUS_UPLOAD_START: ${err?.name}: ${err?.message}}`
    );
    return;
  }

  Promise.all(
    files.map((file, index) => {
      return new Promise(async (resolve, reject) => {
        // Get quoted file length
        let quotedFileLength;
        try {
          quotedFileLength = File.get(quoteId, index).length;
        } catch (err) {
          console.error(
            `Error occurred while reading quoted file length from database: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`
          );
          reject(Quote.QUOTE_STATUS_UPLOAD_INTERNAL_ERROR);
          return;
        }

        const ipfsFile = process.env.IPFS_GATEWAY + file.substring(7);

        // download file
        console.log("download file");
        await axios({
          method: "get",
          url: ipfsFile,
          responseType: "arraybuffer", // Download in chunks, stored in memory
        })
          .then(async (res) => {
            // download started
            const contentType = res.headers["content-type"];
            console.log("download contentType", contentType);
            const actualLength = parseInt(res.headers["content-length"]);
            console.log("download actualLength", actualLength);

            if (actualLength) {
              if (actualLength > quotedFileLength) {
                console.error(
                  `Actual file length exceeds quoted length. CID = ${file}, file index = ${index}, quoted length = ${quotedFileLength}, actual length ${actualLength}`
                );
                reject(Quote.QUOTE_STATUS_UPLOAD_ACTUAL_FILE_LEN_EXCEEDS_QUOTE);
                return;
              }
            } else {
              console.warn("Warning: Unknown file length. Uploading blindly.");
            }

            // Set the Arweave tags: https://github.com/ArweaveTeam/arweave-standards/blob/master/best-practices/BP-105.md
            const arweaveTags = contentType
              ? [{ name: "Content-Type", value: contentType }]
              : [];
            console.log("arweaveTags", arweaveTags);

            const uploader = bundlr.uploader.chunkedUploader;
            console.log(
              "process.env.BUNDLR_CHUNK_SIZE",
              process.env.BUNDLR_CHUNK_SIZE
            );
            console.log(
              "process.env.BUNDLR_BATCH_SIZE",
              process.env.BUNDLR_BATCH_SIZE
            );

            uploader.setChunkSize(process.env.BUNDLR_CHUNK_SIZE || 524288); // Default: 512 kB
            uploader.setBatchSize(process.env.BUNDLR_BATCH_SIZE || 1); // Default: 1 chunk at a time

            uploader.on("chunkError", (e) => {
              console.error(
                `Error uploading chunk number ${e.id} - ${e.res.statusText}. CID = ${file}, file index = ${index}`
              );
              reject(Quote.QUOTE_STATUS_UPLOAD_UPLOAD_FAILED);
              return;
            });
            uploader.on("done", async (finishRes) => {
              const transactionId = finishRes.data.id;
              console.log("upload done");
              console.log("transactionId", transactionId);
              try {
                File.setHash(quoteId, index, transactionId);
              } catch (err) {
                console.error(
                  `Error occurred while writing file transaction id to database: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`
                );
                reject(Quote.QUOTE_STATUS_UPLOAD_INTERNAL_ERROR);
                return;
              }

              resolve(transactionId);
              return;
            });

            const transactionOptions = { tags: arweaveTags };
            try {
              // Download each chunk and immediately upload to Bundlr without storing to disk.
              console.log(
                "Download each chunk and immediately upload to Bundlr without storing to disk."
              );
              await uploader.uploadData(
                Buffer.from(res.data, "binary"),
                transactionOptions
              );
              console.log("uploader.uploadData complete");
            } catch (err) {
              console.error(
                `Error occurred while uploading file: ${err?.name}: ${err?.message}. CID = ${file}, file index = ${index}`
              );
              // TODO: Consider separate status for insufficient funds.
              reject(Quote.QUOTE_STATUS_UPLOAD_UPLOAD_FAILED);
              return;
            }
          })
          .catch((err) => {
            console.error(
              `Error occurred while downloading file ${file}, index ${index}: ${err?.name}: ${err?.message}`
            );
            reject(Quote.QUOTE_STATUS_UPLOAD_DOWNLOAD_FAILED);
            return;
          });
      });
    })
  )
    .then(() => {
      try {
        console.log("Set status QUOTE_STATUS_UPLOAD_END");
        Quote.setStatus(quoteId, Quote.QUOTE_STATUS_UPLOAD_END);
        // Unwrap payment token (ex. WETH -> ETH)
      } catch (err) {
        console.error(
          `Error occurred while setting status to Quote.QUOTE_STATUS_UPLOAD_END: ${err?.name}: ${err?.message}}`
        );
        return;
      }
      try {
        async function performWithdraw() {
          console.log("withdraw WMATIC into Matic");
          const txResponse = await token.withdraw(priceWei, {
            maxPriorityFeePerGas: priorityFeePerGas,
            maxFeePerGas: feePerGas,
          });
          console.log(
            `withdraw success txResponse = ${JSON.stringify(txResponse)}`
          );
        }

        performWithdraw();
      } catch (err) {
        console.error(
          `Error occurred while unwrapping payment: ${err?.name}: ${err?.message}`
        );
        return;
      }
    })
    .catch((quoteStatus) => {
      try {
        Quote.setStatus(quoteId, quoteStatus);
      } catch (err) {
        console.error(
          `Error occurred while setting status to ${quoteStatus}: ${err?.name}: ${err?.message}}`
        );
        return;
      }
    });
};
