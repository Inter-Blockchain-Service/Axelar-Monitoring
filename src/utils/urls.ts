export const getAxelarscanUrl = (chainId: string): string => {
  const mainnetChainId = process.env.CHAIN_ID || 'axelar-dojo-1';
  return chainId === mainnetChainId 
    ? 'https://axelarscan.io' 
    : 'https://testnet.axelarscan.io';
}; 