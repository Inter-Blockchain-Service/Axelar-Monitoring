export const getAxelarscanUrl = (): string => {
  const envChainId = process.env.CHAIN_ID;

  if (envChainId === 'axelar-dojo-1') {
    return 'https://axelarscan.io';
  } else if (envChainId === 'axelar-testnet-lisbon-3') {
    return 'https://testnet.axelarscan.io';
  } else {
    // Par défaut, on retourne l'URL testnet
    return 'https://axelarscan.io';
  }
}; 