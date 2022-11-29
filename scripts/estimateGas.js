const ethers = require('ethers');
const { tokens } = require('../app/controllers/tokens.js');

/**
Print gas estimates for uploading a file to Arweave
Export PRIVATE_KEY and TEST_PRIVATE_KEY before running
 */
estimateGas = async (providerUrl, tokenAddress, bundlrAddress) => {

    const priceWei = ethers.BigNumber.from(634380980125554);

    // Create provider
    console.log(`provider URL = ${providerUrl}`)

    let provider
    try {
        provider = ethers.getDefaultProvider(providerUrl);
        console.log(`network = ${JSON.stringify(await provider.getNetwork())}`);
    }
    catch(err) {
        console.log(`Error occurred while getting network info. ${err?.name}: ${err?.message}`);
        return;
    }

    // Create server wallet
    const serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log(`server wallet address = ${serverWallet.address}`);

    // Create user wallet
    const userWallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY, provider);
    console.log(`user wallet address = ${userWallet.address}`);

    // Create token contract instance, connected to server wallet
    const abi = [
        'function transferFrom(address from, address to, uint256 value) external returns (bool)',
        'function approve(address, uint256) external returns (bool)',
        'function balanceOf(address owner) external view returns (uint256)',
        'function deposit(uint256 value) external',
        'function withdraw(uint256 value) external',
        'function transfer(address to, uint256 value) external returns (bool)'
    ];
    const token = new ethers.Contract(tokenAddress, abi, serverWallet);
    console.log(`payment token address = ${token.address}`);

	// Check that user has sufficient funds
	let userBalance;
	try {
		userBalance = await token.balanceOf(userWallet.address);
	}
	catch(err) {
		console.log(`Error occurred while checking user token balance. ${err?.name}: ${err?.message}`);
		return;
	}
	console.log(`userBalance = ${userBalance}`);
	if(userBalance.lt(priceWei)) {
		console.log(`User balance is less than current price. current price: ${priceWei}, userBalance: ${userBalance}`);
		return;
	}

    // Check that server has sufficient funds
	let serverBalance;
	try {
		serverBalance = await token.balanceOf(serverWallet.address);
	}
	catch(err) {
		console.log(`Error occurred while checking user token balance. ${err?.name}: ${err?.message}`);
		return;
	}
	console.log(`serverBalance = ${serverBalance}`);
	if(serverBalance.lt(priceWei)) {
		console.log(`User balance is less than current price. current price: ${priceWei}, serverBalance: ${serverBalance}`);
		return;
	}

    // User: grant infinite approval to server
    console.log(`Waiting for approval...`);
    try {
        await (await token.connect(userWallet).approve(serverWallet.address, ethers.constants.MaxInt256)).wait();
    }
    catch(err) {
        console.log(`Error occurred while granting infinite approval. ${err?.name}: ${err?.message}`)
        return;
    }

    // Estimate gas costs for full upload process
    let transferFromEstimate;
    try {
        transferFromEstimate = await token.estimateGas.transferFrom(userWallet.address, serverWallet.address, priceWei);
    }
    catch(err) {
        console.log(`Error occurred while estimating transferFrom gas cost. ${err?.name}: ${err?.message}`);
        return;
    }
    console.log(`transferFromEstimate = ${transferFromEstimate}`);


    let unwrapEstimate;
    try {
        unwrapEstimate = await token.estimateGas.withdraw(priceWei);
    }
    catch(err) {
        console.log(`Error occurred while estimating withdraw gas cost. ${err?.name}: ${err?.message}`);
        return;
    }
    console.log(`unwrapEstimate = ${unwrapEstimate}`);

    let sendEthEstimate
    try {
        sendEthEstimate = await serverWallet.estimateGas({to: bundlrAddress, value: priceWei}); // Assume price not dependent on "to" address
    }
    catch(err) {
        console.log(`Error occurred while estimating send ETH gas cost. ${err?.name}: ${err?.message}`);
        return;
    }
    console.log(`sendEthEstimate = ${sendEthEstimate}`);

    let wrapEstimate;
    try {
        wrapEstimate = await token.estimateGas.deposit(priceWei); // Assume price not dependent on amount
    }
    catch(err) {
        console.log(`Error occurred while estimating deposit gas cost. ${err?.name}: ${err?.message}`);
        return;
    }
    console.log(`wrapEstimate = ${wrapEstimate}`);

    let transferEstimate;
    try {
        transferEstimate = await token.estimateGas.transfer(userWallet.address, priceWei); // Assume price not dependent on amount
    }
    catch(err) {
        console.log(`Error occurred while estimating transfer gas cost. ${err?.name}: ${err?.message}`);
        return;
    }
    console.log(`transferEstimate = ${transferEstimate}`);

    let gasEstimate = transferFromEstimate.add(sendEthEstimate).add(transferEstimate).add(unwrapEstimate).add(wrapEstimate);
    console.log(`gasEstimate = ${gasEstimate}`);

    // User: revoke approval to server
    console.log(`Waiting for revoke...`);
    try {
        await (await token.connect(userWallet).approve(serverWallet.address, ethers.BigNumber.from(0))).wait();
    }
    catch(err) {
        console.log(`Error occurred while revoking approval. ${err?.name}: ${err?.message}`)
        return;
    }

    console.log("");
}

(async () => {
    for(let i = 0; i < tokens.length; i++) {
        if([80001, 5].includes(tokens[i].chainId)) {
            await estimateGas(
                tokens[i].providerUrl,
                tokens[i].tokenAddress,
                '0x853758425e953739F5438fd6fd0Efe04A477b039' // Bundlr Address
            );
        }
    }
})();
