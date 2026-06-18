import http from 'http';
import { AlertManager } from './alert-manager';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * HTTP routes for operational visibility (alert state, health).
 * Only handles /api/* — other requests (Socket.io, etc.) are left to their handlers.
 */
export const setupHttpApi = (server: http.Server, alertManager: AlertManager): void => {
  server.on('request', (req, res) => {
    if (!req.url) return;

    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/')) return;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...JSON_HEADERS,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (pathname === '/api/health') {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
      return;
    }

    if (pathname === '/api/alerts/status') {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(alertManager.getAlertStatus()));
      return;
    }

    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
};
