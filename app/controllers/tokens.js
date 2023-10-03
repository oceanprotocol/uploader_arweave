// TODO: Update `confirms` fields
const allTokens = [
  // Mainnets, used with public Bundlr URIs. See for details https://docs.bundlr.network/docs/bundlers
  {
    bundlrName: 'ethereum',
    chainId: 1,
    symbol: 'ETH',
    providerUrl: 'https://cloudflare-eth.com/',
    tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    confirms: 1
  },
  {
    bundlrName: 'matic',
    chainId: 137,
    symbol: 'MATIC',
    providerUrl: 'https://polygon-rpc.com',
    tokenAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    confirms: 30
  },
  {
    bundlrName: 'bnb',
    chainId: 56,
    symbol: 'BNB',
    providerUrl: 'https://bsc-dataseed.binance.org',
    tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    confirms: 1
  },
  {
    bundlrName: 'arbitrum',
    chainId: 42161,
    symbol: 'ETH',
    providerUrl: 'https://arb1.arbitrum.io/rpc',
    tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    confirms: 1
  },
  {
    bundlrName: 'avalanche',
    chainId: 43114,
    symbol: 'AVAX',
    providerUrl: 'https://api.avax.network/ext/bc/C/rpc',
    tokenAddress: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    confirms: 1
  },
  {
    bundlrName: 'boba-eth',
    chainId: 288,
    symbol: 'ETH',
    providerUrl: 'https://mainnet.boba.network/',
    tokenAddress: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',
    confirms: 1
  },
  // Testnets, used with devnet Bundlr URI. See for details: https://docs.bundlr.network/docs/devnet
  {
    bundlrName: 'matic',
    chainId: 80001,
    symbol: 'MATIC',
    providerUrl: 'https://rpc-mumbai.maticvigil.com/',
    tokenAddress: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    confirms: 1
  },
  {
    bundlrName: 'ethereum',
    chainId: 5,
    symbol: 'ETH',
    providerUrl: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    tokenAddress: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    confirms: 1
  }
]

const mainnetTokens = [
  // Mainnets, used with public Bundlr URIs. See for details https://docs.bundlr.network/docs/bundlers
  {
    bundlrName: 'ethereum',
    chainId: 1,
    symbol: 'ETH',
    providerUrl: 'https://cloudflare-eth.com/',
    tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    confirms: 1
  },
  {
    bundlrName: 'matic',
    chainId: 137,
    symbol: 'WMATIC',
    providerUrl: 'https://polygon-rpc.com',
    tokenAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    confirms: 30
  },
  {
    bundlrName: 'bnb',
    chainId: 56,
    symbol: 'BNB',
    providerUrl: 'https://bsc-dataseed.binance.org',
    tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    confirms: 1
  },
  {
    bundlrName: 'arbitrum',
    chainId: 42161,
    symbol: 'ETH',
    providerUrl: 'https://arb1.arbitrum.io/rpc',
    tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    confirms: 1
  },
  {
    bundlrName: 'avalanche',
    chainId: 43114,
    symbol: 'AVAX',
    providerUrl: 'https://api.avax.network/ext/bc/C/rpc',
    tokenAddress: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    confirms: 1
  },
  {
    bundlrName: 'boba-eth',
    chainId: 288,
    symbol: 'ETH',
    providerUrl: 'https://mainnet.boba.network/',
    tokenAddress: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',
    confirms: 1
  }
]

const tokens = process.env.ARWEAVE_PRODUCTION === 'true' ? mainnetTokens : allTokens

getToken = (chainId, tokenAddress) => {
  const accepted = process.env.ACCEPTED_PAYMENTS.split(',')
  let acceptedToken
  tokens.forEach((token) => {
    if (accepted.includes(token.bundlrName)) {
      if (token.chainId == chainId && token.tokenAddress == tokenAddress) {
        acceptedToken = token
        return
      }
    }
  })
  return acceptedToken
}

/**
 * Get a list of supported payment options in the format expected by /register
 */
getAcceptedPaymentDetails = () => {
  const acceptedPayments = process.env.ACCEPTED_PAYMENTS.split(',')
  const acceptedDetails = tokens.filter((token) =>
    acceptedPayments.includes(token.bundlrName)
  )
  const compressedDetails = []
  acceptedDetails.forEach((detail) => {
    let added = false
    const acceptedToken = {}
    acceptedToken[detail.symbol] = detail.tokenAddress
    compressedDetails.forEach((compressedDetail) => {
      if (detail.chainId == compressedDetail.chainId) {
        compressedDetail.acceptedTokens.push(acceptedToken)
        added = true
      }
    })
    if (!added) {
      compressedDetails.push({
        chainId: detail.chainId,
        acceptedTokens: [acceptedToken]
      })
    }
  })
  return compressedDetails
}

module.exports = { tokens, getToken, getAcceptedPaymentDetails }
