import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceAccount } from '../../lib/env';

const KEY = '-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n';
const json = JSON.stringify({ type: 'service_account', client_email: 'bot@proj.iam.gserviceaccount.com', private_key: KEY });

test('GOOGLE_SERVICE_ACCOUNT_JSON: isi file JSON apa adanya', () => {
  assert.deepEqual(serviceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON: json }), { email: 'bot@proj.iam.gserviceaccount.com', key: KEY.trim() });
});

test('GOOGLE_SERVICE_ACCOUNT_JSON: versi base64', () => {
  const b64 = Buffer.from(json).toString('base64');
  assert.equal(serviceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON: b64 }).key, KEY.trim());
});

test('variabel terpisah: private key dengan \\n literal dan tanda kutip', () => {
  const pasted = `"${KEY.replace(/\n/g, '\\n')}"`;
  assert.deepEqual(serviceAccount({ GOOGLE_SERVICE_ACCOUNT_EMAIL: ' bot@x.com ', GOOGLE_PRIVATE_KEY: pasted }), { email: 'bot@x.com', key: KEY.trim() });
  assert.equal(serviceAccount({ GOOGLE_PRIVATE_KEY: KEY }).key, KEY.trim());
});
