import { useEffect, useState } from 'react';
import { refreshSession } from './auth';

export const apiBaseUrl = (import.meta.env.VITE_BLOCKS_API_URL || 'https://api.seliseblocks.com').replace(
  /\/$/,
  '',
);
export const projectKey = import.meta.env.VITE_X_BLOCKS_KEY || '';

export const apiBus = { count: 0, subs: new Set() };
export function bumpApi() {
  apiBus.count += 1;
  apiBus.subs.forEach((fn) => fn(apiBus.count));
}
export function useApiCount() {
  const [count, setCount] = useState(apiBus.count);
  useEffect(() => {
    const fn = (n) => setCount(n);
    apiBus.subs.add(fn);
    return () => apiBus.subs.delete(fn);
  }, []);
  return count;
}

export function commonHeaders() {
  return { 'Content-Type': 'application/json', 'x-blocks-key': projectKey };
}

export async function iamFetch(url, init = {}, retried = false) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { ...commonHeaders(), ...init.headers },
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return iamFetch(url, init, true);
    }
  }
  return response;
}

export function readJsonMaybe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function toCurl({ method = 'POST', url, body }) {
  const lines = [`curl -X ${method} '${url}' \\`, `  -H 'x-blocks-key: ${projectKey || '<project-key>'}' \\`];
  if (body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  --data '${typeof body === 'string' ? body : JSON.stringify(body)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }
  return lines.join('\n');
}