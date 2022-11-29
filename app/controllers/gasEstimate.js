const ethers = require('ethers');

/**
 * Sum of gas estimates for:
 * 1. transferFrom
 * 2. unwrap
 * 3. send native
 * 4. wrap
 * 5. transfer
 *
 * This number empirically derived from:
 * https://github.com/MantisClone/arweave-upload/blob/c119111744c69658af33067cde53147087340978/scripts/estimateGas.js
 */
const gasEstimate = ethers.BigNumber.from(158751);

module.exports = { gasEstimate };