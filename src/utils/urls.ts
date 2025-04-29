export const getAxelarscanUrl = (chainId: string): string => {
  return chainId === 'axelar-dojo-1' 
    ? 'https://axelarscan.io' 
    : 'https://testnet.axelarscan.io';
}; 