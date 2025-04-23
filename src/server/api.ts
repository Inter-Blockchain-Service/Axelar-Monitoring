import express, { Request, Response } from 'express';
import { ValidatorMetrics } from './metrics';
import { TendermintClient } from './tendermint';

/**
 * Set up API routes for the Express application
 */
export const setupApiRoutes = (
  app: express.Application,
  metrics: ValidatorMetrics,
  tendermintClient: TendermintClient
): void => {
  // API route for general metrics
  app.get('/api/metrics', (req: Request, res: Response) => {
    res.json(metrics);
  });
  
  // API route for EVM votes
  app.get('/api/evm-votes', (req: Request, res: Response) => {
    if (metrics.evmVotesEnabled) {
      res.json(metrics.evmVotes);
    } else {
      res.status(404).json({ error: "EVM votes manager not enabled" });
    }
  });
  
  // API route for EVM votes of a specific chain
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
  
  // API route for supported AMPD chains
  app.get('/api/ampd/chains', (req: Request, res: Response) => {
    if (metrics.ampdEnabled) {
      res.json(metrics.ampdSupportedChains);
    } else {
      res.status(404).json({ error: "AMPD manager not enabled" });
    }
  });
  
  // API route for AMPD votes of a specific chain
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
  
  // API route for AMPD signatures of a specific chain
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