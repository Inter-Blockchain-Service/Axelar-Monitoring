"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupApiRoutes = void 0;
/**
 * Set up API routes for the Express application
 */
const setupApiRoutes = (app, metrics, tendermintClient) => {
    // API route for general metrics
    app.get('/api/metrics', (req, res) => {
        res.json(metrics);
    });
    // API route for EVM votes
    app.get('/api/evm-votes', (req, res) => {
        if (metrics.evmVotesEnabled) {
            res.json(metrics.evmVotes);
        }
        else {
            res.status(404).json({ error: "EVM votes manager not enabled" });
        }
    });
    // API route for EVM votes of a specific chain
    app.get('/api/evm-votes/:chain', (req, res) => {
        if (metrics.evmVotesEnabled) {
            const chain = req.params.chain.toLowerCase();
            const votes = tendermintClient.getEvmChainVotes(chain);
            if (votes) {
                res.json(votes);
            }
            else {
                res.status(404).json({ error: `No votes data for chain: ${chain}` });
            }
        }
        else {
            res.status(404).json({ error: "EVM votes manager not enabled" });
        }
    });
    // API route for supported AMPD chains
    app.get('/api/ampd/chains', (req, res) => {
        if (metrics.ampdEnabled) {
            res.json(metrics.ampdSupportedChains);
        }
        else {
            res.status(404).json({ error: "AMPD manager not enabled" });
        }
    });
    // API route for AMPD votes of a specific chain
    app.get('/api/ampd/votes/:chain', (req, res) => {
        if (metrics.ampdEnabled) {
            const chain = req.params.chain.toLowerCase();
            const votes = tendermintClient.getAmpdChainVotes(chain);
            if (votes) {
                res.json(votes);
            }
            else {
                res.status(404).json({ error: `No votes data for chain: ${chain}` });
            }
        }
        else {
            res.status(404).json({ error: "AMPD manager not enabled" });
        }
    });
    // API route for AMPD signatures of a specific chain
    app.get('/api/ampd/signings/:chain', (req, res) => {
        if (metrics.ampdEnabled) {
            const chain = req.params.chain.toLowerCase();
            const signings = tendermintClient.getAmpdChainSignings(chain);
            if (signings) {
                res.json(signings);
            }
            else {
                res.status(404).json({ error: `No signings data for chain: ${chain}` });
            }
        }
        else {
            res.status(404).json({ error: "AMPD manager not enabled" });
        }
    });
};
exports.setupApiRoutes = setupApiRoutes;
