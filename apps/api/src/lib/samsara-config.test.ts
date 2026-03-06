import assert from "node:assert/strict";
import {
  buildSamsaraConfigJson,
  extractSamsaraApiToken,
  extractSamsaraAuthMode,
  extractSamsaraOAuthClientId,
  extractSamsaraOAuthClientSecret,
  extractSamsaraOAuthRefreshToken,
  extractSamsaraOAuthTokenExpiresAt,
  hasEncryptedSamsaraCredentials,
  migrateLegacySamsaraConfig,
  writeSamsaraOAuthClientConfig,
  writeSamsaraOAuthCredentials,
} from "./samsara-config";

const previousSecret = process.env.INTEGRATION_SECRET;
process.env.INTEGRATION_SECRET = "integration-secret-key-for-tests-32-bytes";

const config = buildSamsaraConfigJson({
  apiToken: "samsara_token_123",
  webhookSigningSecret: "webhook_secret_123",
  orgExternalId: "org_ext_1",
});

assert.equal(extractSamsaraApiToken(config as any), "samsara_token_123");
assert.equal(hasEncryptedSamsaraCredentials(config as any), true);

const legacy = {
  apiToken: "legacy_plain_token",
  webhookSigningSecret: "legacy_plain_secret",
} as const;

const migrated = migrateLegacySamsaraConfig(legacy as any);
assert.equal(migrated.changed, true);
assert.equal(extractSamsaraApiToken(migrated.configJson as any), "legacy_plain_token");
assert.equal(hasEncryptedSamsaraCredentials(migrated.configJson as any), true);

const oauth = writeSamsaraOAuthCredentials({
  previousConfig: config as any,
  accessToken: "oauth_access_token_1",
  refreshToken: "oauth_refresh_token_1",
  expiresInSeconds: 3600,
  scope: "read_fleet",
});
assert.equal(extractSamsaraApiToken(oauth as any), "oauth_access_token_1");
assert.equal(extractSamsaraOAuthRefreshToken(oauth as any), "oauth_refresh_token_1");
assert.equal(extractSamsaraAuthMode(oauth as any), "oauth2");
assert.ok(extractSamsaraOAuthTokenExpiresAt(oauth as any));

const oauthClient = writeSamsaraOAuthClientConfig({
  previousConfig: oauth as any,
  clientId: "client_123",
  clientSecret: "secret_123",
});
assert.equal(extractSamsaraOAuthClientId(oauthClient as any), "client_123");
assert.equal(extractSamsaraOAuthClientSecret(oauthClient as any), "secret_123");

if (previousSecret === undefined) {
  delete process.env.INTEGRATION_SECRET;
} else {
  process.env.INTEGRATION_SECRET = previousSecret;
}

console.log("samsara config helpers tests passed");
