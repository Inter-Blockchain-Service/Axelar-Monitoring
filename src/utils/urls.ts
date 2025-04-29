export const getAxelarscanUrl = (chainId: string): string => {
  const envChainId = process.env.CHAIN_ID;
  
  if (envChainId === 'axelar-dojo-1') {
    return 'https://axelarscan.io';
  } else {
    return 'https://testnet.axelarscan.io';
  }
}; 