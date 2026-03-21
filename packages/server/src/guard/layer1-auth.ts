import { GuardLayerResult } from '../audit/types';
import { config } from '../config';

const requestCounts: Map<string, { count: number; windowStart: number }> = new Map();
const MAX_REQUESTS_PER_MINUTE = 30;

export function evaluateLayer1(sessionId: string): GuardLayerResult {
  // Check BitGo token is configured
  if (!config.bitgo.accessToken) {
    return { layer: 1, name: 'Auth & Rate Limit', passed: false, reason: 'BitGo access token not configured' };
  }

  // Check session exists
  if (!sessionId) {
    return { layer: 1, name: 'Auth & Rate Limit', passed: false, reason: 'No session ID provided' };
  }

  // Rate limiting (sliding window per minute)
  const now = Date.now();
  const record = requestCounts.get(sessionId);

  if (record) {
    if (now - record.windowStart > 60_000) {
      // Reset window
      record.count = 1;
      record.windowStart = now;
    } else {
      record.count++;
      if (record.count > MAX_REQUESTS_PER_MINUTE) {
        return {
          layer: 1,
          name: 'Auth & Rate Limit',
          passed: false,
          reason: `Rate limit exceeded: ${record.count}/${MAX_REQUESTS_PER_MINUTE} requests per minute`,
        };
      }
    }
  } else {
    requestCounts.set(sessionId, { count: 1, windowStart: now });
  }

  return { layer: 1, name: 'Auth & Rate Limit', passed: true };
}
