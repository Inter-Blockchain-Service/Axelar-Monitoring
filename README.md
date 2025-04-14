# Axelar Validator Monitoring Dashboard

Application de surveillance en temps réel des validateurs Tendermint/Cosmos avec Next.js et Socket.io, spécialement conçue pour monitorer les validateurs Axelar ou d'autres réseaux basés sur Tendermint.

## Fonctionnalités

- Connexion WebSocket en temps réel à un nœud Tendermint
- Surveillance des blocs signés, manqués et proposés par votre validateur
- Visualisation du statut des blocs récents (signé, proposé, manqué)
- Statistiques détaillées sur les performances de signature
- Interface responsive et moderne avec TailwindCSS
- Actualisations automatiques en temps réel

## Structure du projet

```
axelar-monitoring/
├── src/
│   ├── app/             # Pages Next.js (App Router)
│   ├── components/      # Composants React réutilisables
│   ├── hooks/           # Hooks personnalisés
│   └── server/          # Client WebSocket Tendermint et serveur Socket.io
├── public/              # Fichiers statiques
└── ...
```

## Prérequis

- Node.js 18+
- Un nœud Tendermint/Cosmos avec l'API RPC activée
- L'adresse de votre validateur (format hexadécimal)

## Installation

1. Clonez le dépôt
2. Installez les dépendances :

```bash
npm install
```

3. Configurez votre validateur dans le fichier `.env` :

```
# Configuration du validateur
VALIDATOR_ADDRESS=AABBCCDDEEFF0011223344556677889900ABCDEF # Remplacer par votre adresse de validateur
VALIDATOR_MONIKER="Mon Validateur Axelar"
CHAIN_ID="axelar"

# Configuration du nœud RPC
RPC_ENDPOINT=http://localhost:26657

# Configuration du serveur
PORT=3001
```

## Développement

Pour lancer l'application en mode développement :

```bash
npm run dev
```

Cela démarrera :
- Le serveur Next.js sur http://localhost:3000
- Le serveur Socket.io qui se connecte à votre nœud Tendermint

## Production

Pour construire l'application pour la production :

```bash
npm run build
npm start
```

## Comment trouver l'adresse de votre validateur

L'adresse du validateur est une chaîne hexadécimale disponible via plusieurs moyens :
1. Dans la sortie du RPC `localhost:26657/status` sous `validator_info.address`
2. Via la commande CLI de votre chaîne (exemple pour Axelar) :
   ```
   axelard tendermint show-validator
   ```

## Technologies utilisées

- **Frontend** : Next.js, React, TailwindCSS
- **Backend** : Node.js, Express, WebSocket
- **Temps réel** : Socket.io
- **Blockchain** : API RPC Tendermint
- **Langage** : TypeScript

## Sécurité

Cette application est conçue pour une utilisation interne/privée. Si vous l'exposez sur Internet, veuillez implémenter des mesures de sécurité supplémentaires (authentification, HTTPS, etc.).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
