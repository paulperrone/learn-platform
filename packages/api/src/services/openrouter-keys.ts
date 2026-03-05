const OPENROUTER_API = "https://openrouter.ai/api/v1/keys";

type KeyData = {
  hash: string;
  name: string;
  label: string;
  disabled: boolean;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  usage: number;
  usageMonthly: number;
  createdAt: string;
  updatedAt: string | null;
};

type CreateKeyResponse = {
  key: string; // Raw API key — only returned once
  data: KeyData;
};

type KeyResponse = {
  data: KeyData;
};

export function createOpenRouterKeyService(managementApiKey: string) {
  function headers() {
    return {
      Authorization: `Bearer ${managementApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://learn.perrone.dev",
      "X-Title": "Learn Platform",
    };
  }

  return {
    /** Provision a new API key for a family. Returns the raw key (store it!) and hash. */
    async provisionKey(
      familyName: string,
      monthlyLimitCents: number | null
    ): Promise<{ apiKey: string; hash: string }> {
      const response = await fetch(OPENROUTER_API, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: `learn-platform:${familyName}`,
          limit: monthlyLimitCents !== null ? monthlyLimitCents / 100 : null,
          limitReset: monthlyLimitCents !== null ? "monthly" : null,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter key creation failed (${response.status}): ${error}`);
      }

      const result = (await response.json()) as CreateKeyResponse;
      return { apiKey: result.key, hash: result.data.hash };
    },

    /** Disable a provisioned key (preserves usage records). */
    async disableKey(keyHash: string): Promise<void> {
      const response = await fetch(`${OPENROUTER_API}/${keyHash}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ disabled: true }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter key disable failed (${response.status}): ${error}`);
      }
    },

    /** Update the spending limit on a provisioned key. */
    async updateLimit(keyHash: string, monthlyLimitCents: number | null): Promise<void> {
      const response = await fetch(`${OPENROUTER_API}/${keyHash}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({
          limit: monthlyLimitCents !== null ? monthlyLimitCents / 100 : null,
          limitReset: monthlyLimitCents !== null ? "monthly" : null,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter key limit update failed (${response.status}): ${error}`);
      }
    },

    /** Get usage info for a provisioned key. */
    async getKeyUsage(keyHash: string): Promise<{ usageUsd: number; usageMonthlyUsd: number; limitUsd: number | null; limitRemainingUsd: number | null }> {
      const response = await fetch(`${OPENROUTER_API}/${keyHash}`, {
        method: "GET",
        headers: headers(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter key usage fetch failed (${response.status}): ${error}`);
      }

      const result = (await response.json()) as KeyResponse;
      return {
        usageUsd: result.data.usage,
        usageMonthlyUsd: result.data.usageMonthly,
        limitUsd: result.data.limit,
        limitRemainingUsd: result.data.limitRemaining,
      };
    },
  };
}
