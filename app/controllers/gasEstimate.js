const ethers = require('ethers');

const estimateGas = async (
  providerUrl,
  tokenAddress,
  bundlrAddress,
  priceWei
) => {
  console.log(`provider URL = ${providerUrl}`);

  let provider;
  try {
    provider = ethers.getDefaultProvider(providerUrl);
    console.log(`network = ${JSON.stringify(await provider.getNetwork())}`);
  } catch (err) {
    console.error(`Error occurred while getting network info. ${err?.name}: ${err?.message}`);
    return;
  }

  const serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const userWallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY, provider);
  const token = new ethers.Contract(tokenAddress, abi, serverWallet);

  const estimates = [
    { method: () => token.estimateGas.transferFrom(userWallet.address, serverWallet.address, priceWei), name: 'transferFrom' },
    { method: () => token.estimateGas.withdraw(priceWei), name: 'withdraw' },
    { method: () => serverWallet.estimateGas({ to: bundlrAddress, value: priceWei }), name: 'send ETH' },
    { method: () => token.estimateGas.deposit(priceWei), name: 'deposit' },
    { method: () => token.estimateGas.transfer(userWallet.address, priceWei), name: 'transfer' },
  ];

  let gasEstimate = ethers.BigNumber.from(0);
  for (const { method, name } of estimates) {
    try {
      const estimate = await method();
      console.log(`${name}Estimate = ${estimate}`);
      gasEstimate = gasEstimate.add(estimate);
    } catch (err) {
      console.error(`Error occurred while estimating ${name} gas cost. ${err?.name}: ${err?.message}`);
      return;
    }
  }

  console.log(`gasEstimate = ${gasEstimate}`);
  return gasEstimate;
};

module.exports = { estimateGas };
