import express, { Request, Response } from 'express';
import { ValidatorMetrics } from './metrics';
import { TendermintClient } from './tendermint';

/**
 * Configure les routes API pour l'application Express
 */
export const setupApiRoutes = (
  app: express.Application,
  metrics: ValidatorMetrics,
  tendermintClient: TendermintClient
): void => {
  // Route API pour les métriques générales
  app.get('/api/metrics', (req: Request, res: Response) => {
    res.json(metrics);
  });
  
  // Route API pour les votes EVM
  app.get('/api/evm-votes', (req: Request, res: Response) => {
    if (metrics.evmVotesEnabled) {
      res.json(metrics.evmVotes);
    } else {
      res.status(404).json({ error: "EVM votes manager not enabled" });
    }
  });
  
  // Route API pour les votes EVM d'une chaîne spécifique
  app.get('/api/evm-votes/:chain', (req: Request, res: Response) => {
    if (metrics.evmVotesEnabled) {
      const chain = req.params.chain.toLowerCase();
      const votes = tendermintClient.getEvmChainVotes(chain);
      if (votes) {
        res.json(votes);
      } else {
        res.status(404).json({ error: `No votes data for chain: ${chain}` });
      }
    } else {
      res.status(404).json({ error: "EVM votes manager not enabled" });
    }
  });
  
  // Route API pour les chaînes AMPD supportées
  app.get('/api/ampd/chains', (req: Request, res: Response) => {
    if (metrics.ampdEnabled) {
      res.json(metrics.ampdSupportedChains);
    } else {
      res.status(404).json({ error: "AMPD manager not enabled" });
    }
  });
  
  // Route API pour les votes AMPD d'une chaîne spécifique
  app.get('/api/ampd/votes/:chain', (req: Request, res: Response) => {
    if (metrics.ampdEnabled) {
      const chain = req.params.chain.toLowerCase();
      const votes = tendermintClient.getAmpdChainVotes(chain);
      if (votes) {
        res.json(votes);
      } else {
        res.status(404).json({ error: `No votes data for chain: ${chain}` });
      }
    } else {
      res.status(404).json({ error: "AMPD manager not enabled" });
    }
  });
  
  // Route API pour les signatures AMPD d'une chaîne spécifique
  app.get('/api/ampd/signings/:chain', (req: Request, res: Response) => {
    if (metrics.ampdEnabled) {
      const chain = req.params.chain.toLowerCase();
      const signings = tendermintClient.getAmpdChainSignings(chain);
      if (signings) {
        res.json(signings);
      } else {
        res.status(404).json({ error: `No signings data for chain: ${chain}` });
      }
    } else {
      res.status(404).json({ error: "AMPD manager not enabled" });
    }
  });
}; 