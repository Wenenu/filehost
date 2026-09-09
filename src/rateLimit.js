'use strict';

// Simple in-memory sliding-window rate limiter keyed by IP.
function rateLimiter(limit, windowMs) {
  const hits = new Map(); // ip -> [timestamps]
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      const alive = times.filter((t) => t > cutoff);
      if (alive.length === 0) hits.delete(ip);
      else hits.set(ip, alive);
    }
  }, windowMs).unref();

  return function check(req) {
    const ip = req.ip || 'unknown';
    const cutoff = Date.now() - windowMs;
    let times = hits.get(ip) || [];
    times = times.filter((t) => t > cutoff);
    if (times.length >= limit) return false;
    times.push(Date.now());
    hits.set(ip, times);
    return true;
  };
}

module.exports = { rateLimiter };