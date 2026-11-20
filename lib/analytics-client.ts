'use client';

export function trackPublicEvent(eventName: string, path?: string) {
  if (typeof window === 'undefined') return;

  const payload = {
    event_name: eventName,
    path: path || window.location.pathname || '/',
    timestamp: new Date().toISOString(),
  };

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics', blob);
      return;
    }
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Non-blocking telemetry should never affect user interaction
  }
}
