// backend/src/utils/tinyRateLimit.js

/**
 * Retorna os limites da API Tiny baseados no plano do cliente.
 * Regras:
 * - Começar: 0 requisições
 * - Descontinuados (Free, Teen, Premium, Profissional): 20 reqs/min -> 1 req a cada 3000ms
 * - Crescer: 30 reqs/min -> 1 req a cada 2000ms
 * - Evoluir: 60 reqs/min -> 1 req a cada 1000ms
 * - Potencializar: 120 reqs/min -> 1 req a cada 500ms
 */
export function getTinyRateLimit(plano) {
  const normPlano = (plano || 'descontinuado').toLowerCase().trim();

  const limites = {
    'começar': { delayMs: 0, concurrency: 0, blocked: true },
    'comecar': { delayMs: 0, concurrency: 0, blocked: true },
    'crescer': { delayMs: 2000, concurrency: 7, blocked: false },
    'evoluir': { delayMs: 1000, concurrency: 15, blocked: false },
    'potencializar': { delayMs: 500, concurrency: 30, blocked: false },
    'descontinuados': { delayMs: 3000, concurrency: 5, blocked: false },
    'descontinuado': { delayMs: 3000, concurrency: 5, blocked: false }
  };

  return limites[normPlano] || limites['descontinuado'];
}
