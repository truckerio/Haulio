import { prisma, LearningDomain, Prisma } from "@truckerio/db";

const DEFAULT_SIMILARITY_THRESHOLD = Number(process.env.LEARNING_SIMILARITY_THRESHOLD || "0.82");
const CHARGE_SIMILARITY_THRESHOLD = Number(process.env.LEARNING_CHARGE_SIMILARITY_THRESHOLD || "0.75");

export type LearningSuggestion = {
  suggestionJson: Record<string, unknown> | null;
  confidence: number;
  reason: string[];
};

type RecordExampleInput = {
  orgId: string;
  domain: LearningDomain;
  inputJson: Record<string, unknown>;
  correctedJson: Record<string, unknown>;
  contextJson?: Record<string, unknown> | null;
  keys?: string[];
  valueJson?: Record<string, unknown>;
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeaderKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(value: string) {
  const tokens = new Set<string>();
  const normalized = normalizeKey(value);
  for (const token of normalized.split(" ")) {
    if (token.length < 3) continue;
    tokens.add(token);
  }
  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function estimateConfidence(score: number, base: number) {
  return Math.max(0, Math.min(0.98, base + score));
}

async function upsertLearnedMapping(params: {
  orgId: string;
  domain: LearningDomain;
  key: string;
  valueJson: Record<string, unknown>;
}) {
  const normalizedKey = normalizeKey(params.key);
  if (!normalizedKey) return;
  if (params.domain === LearningDomain.CHARGE_SUGGESTION) {
    const existing = await prisma.learnedMapping.findFirst({
      where: { orgId: params.orgId, domain: params.domain, key: normalizedKey },
    });
    const nextCount = (existing?.count ?? 0) + 1;
    const amountCents = Number(params.valueJson.amountCents ?? 0);
    const minAmount = existing?.valueJson && typeof (existing.valueJson as any).minAmountCents === "number"
      ? Math.min((existing.valueJson as any).minAmountCents, amountCents)
      : amountCents;
    const maxAmount = existing?.valueJson && typeof (existing.valueJson as any).maxAmountCents === "number"
      ? Math.max((existing.valueJson as any).maxAmountCents, amountCents)
      : amountCents;
    const previousAvg = existing?.valueJson && typeof (existing.valueJson as any).avgAmountCents === "number"
      ? (existing.valueJson as any).avgAmountCents
      : amountCents;
    const avgAmount = Math.round((previousAvg * (nextCount - 1) + amountCents) / nextCount);

    const nextValueJson = {
      ...params.valueJson,
      minAmountCents: minAmount,
      maxAmountCents: maxAmount,
      avgAmountCents: avgAmount,
      count: nextCount,
    };

    if (existing) {
      await prisma.learnedMapping.update({
        where: { id: existing.id },
        data: { valueJson: nextValueJson as Prisma.InputJsonValue, count: nextCount },
      });
    } else {
      await prisma.learnedMapping.create({
        data: {
          orgId: params.orgId,
          domain: params.domain,
          key: normalizedKey,
          valueJson: nextValueJson as Prisma.InputJsonValue,
          count: nextCount,
        },
      });
    }
    return;
  }

  await prisma.learnedMapping.upsert({
    where: { orgId_domain_key: { orgId: params.orgId, domain: params.domain, key: normalizedKey } },
    create: {
      orgId: params.orgId,
      domain: params.domain,
      key: normalizedKey,
      valueJson: params.valueJson as Prisma.InputJsonValue,
      count: 1,
    },
    update: {
      valueJson: params.valueJson as Prisma.InputJsonValue,
      count: { increment: 1 },
    },
  });
}

export async function recordExample(params: RecordExampleInput) {
  await prisma.learningExample.create({
    data: {
      orgId: params.orgId,
      domain: params.domain,
      inputJson: params.inputJson as Prisma.InputJsonValue,
      correctedJson: params.correctedJson as Prisma.InputJsonValue,
      contextJson: params.contextJson ? (params.contextJson as Prisma.InputJsonValue) : undefined,
    },
  });

  if (params.keys && params.valueJson) {
    for (const key of params.keys) {
      await upsertLearnedMapping({
        orgId: params.orgId,
        domain: params.domain,
        key,
        valueJson: params.valueJson,
      });
    }
  }
}

async function findExactMapping(orgId: string, domain: LearningDomain, key: string) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;
  return prisma.learnedMapping.findFirst({
    where: { orgId, domain, key: normalizedKey },
  });
}

async function findBestSimilarity(params: {
  orgId: string;
  domain: LearningDomain;
  key: string;
  threshold: number;
  ignorePrefix?: string;
}) {
  const tokens = tokenize(params.key);
  const candidates = await prisma.learnedMapping.findMany({
    where: { orgId: params.orgId, domain: params.domain },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  let best: { mapping: typeof candidates[number]; score: number } | null = null;
  for (const mapping of candidates) {
    if (params.ignorePrefix && mapping.key.startsWith(params.ignorePrefix)) continue;
    const keyTokens = tokenize(mapping.key);
    const score = jaccardSimilarity(tokens, keyTokens);
    if (score < params.threshold) continue;
    if (!best || score > best.score) {
      best = { mapping, score };
    }
  }
  return best;
}

export async function applyLearned(params: {
  orgId: string;
  domain: LearningDomain;
  inputJson: Record<string, unknown>;
}): Promise<LearningSuggestion> {
  if (params.domain === LearningDomain.MATCH_CUSTOMER) {
    const rawName = String(params.inputJson.rawCustomerName ?? "").trim();
    const emailDomain = String(params.inputJson.emailDomain ?? "").trim().toLowerCase();
    if (!rawName && !emailDomain) {
      return { suggestionJson: null, confidence: 0, reason: ["no-input"] };
    }

    if (rawName) {
      const exact = await findExactMapping(params.orgId, params.domain, rawName);
      if (exact && typeof (exact.valueJson as any).customerId === "string") {
        const customerId = (exact.valueJson as any).customerId as string;
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, orgId: params.orgId },
          select: { id: true, name: true },
        });
        if (customer) {
          return {
            suggestionJson: { customerId: customer.id, customerName: customer.name },
            confidence: 0.9,
            reason: ["exact-name"],
          };
        }
      }
    }

    if (emailDomain) {
      const key = `email:${emailDomain}`;
      const exact = await findExactMapping(params.orgId, params.domain, key);
      if (exact && typeof (exact.valueJson as any).customerId === "string") {
        const customerId = (exact.valueJson as any).customerId as string;
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, orgId: params.orgId },
          select: { id: true, name: true },
        });
        if (customer) {
          return {
            suggestionJson: { customerId: customer.id, customerName: customer.name },
            confidence: 0.86,
            reason: ["email-domain"],
          };
        }
      }
    }

    if (rawName) {
      const best = await findBestSimilarity({
        orgId: params.orgId,
        domain: params.domain,
        key: rawName,
        threshold: DEFAULT_SIMILARITY_THRESHOLD,
        ignorePrefix: "email:",
      });
      if (best && typeof (best.mapping.valueJson as any).customerId === "string") {
        const customerId = (best.mapping.valueJson as any).customerId as string;
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, orgId: params.orgId },
          select: { id: true, name: true },
        });
        if (customer) {
          return {
            suggestionJson: { customerId: customer.id, customerName: customer.name },
            confidence: estimateConfidence(best.score, 0.5),
            reason: ["similar-name"],
          };
        }
      }
    }

    return { suggestionJson: null, confidence: 0, reason: ["no-match"] };
  }

  if (params.domain === LearningDomain.MATCH_ADDRESS) {
    const rawAddress = String(params.inputJson.rawAddressString ?? "").trim();
    if (!rawAddress) {
      return { suggestionJson: null, confidence: 0, reason: ["no-input"] };
    }
    const exact = await findExactMapping(params.orgId, params.domain, rawAddress);
    if (exact) {
      return {
        suggestionJson: exact.valueJson as Record<string, unknown>,
        confidence: 0.9,
        reason: ["exact-address"],
      };
    }
    const best = await findBestSimilarity({
      orgId: params.orgId,
      domain: params.domain,
      key: rawAddress,
      threshold: DEFAULT_SIMILARITY_THRESHOLD,
    });
    if (best) {
      return {
        suggestionJson: best.mapping.valueJson as Record<string, unknown>,
        confidence: estimateConfidence(best.score, 0.5),
        reason: ["similar-address"],
      };
    }
    return { suggestionJson: null, confidence: 0, reason: ["no-match"] };
  }

  if (params.domain === LearningDomain.MATCH_SHIPPER || params.domain === LearningDomain.MATCH_CONSIGNEE) {
    const rawName = String(params.inputJson.rawName ?? params.inputJson.name ?? "").trim();
    if (!rawName) {
      return { suggestionJson: null, confidence: 0, reason: ["no-input"] };
    }
    const exact = await findExactMapping(params.orgId, params.domain, rawName);
    if (exact) {
      return {
        suggestionJson: exact.valueJson as Record<string, unknown>,
        confidence: 0.9,
        reason: ["exact-name"],
      };
    }
    const best = await findBestSimilarity({
      orgId: params.orgId,
      domain: params.domain,
      key: rawName,
      threshold: DEFAULT_SIMILARITY_THRESHOLD,
    });
    if (best) {
      return {
        suggestionJson: best.mapping.valueJson as Record<string, unknown>,
        confidence: estimateConfidence(best.score, 0.5),
        reason: ["similar-name"],
      };
    }
    const stopType = params.domain === LearningDomain.MATCH_SHIPPER ? "PICKUP" : "DELIVERY";
    const stop = await prisma.stop.findFirst({
      where: {
        orgId: params.orgId,
        type: stopType as any,
        name: { equals: rawName, mode: "insensitive" },
      },
      orderBy: { load: { createdAt: "desc" } },
      select: { address: true, city: true, state: true, zip: true },
    });
    if (stop) {
      return {
        suggestionJson: {
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
        },
        confidence: 0.55,
        reason: ["recent-stop"],
      };
    }
    return { suggestionJson: null, confidence: 0, reason: ["no-match"] };
  }

  if (params.domain === LearningDomain.IMPORT_MAPPING) {
    const headers = Array.isArray(params.inputJson.headers) ? (params.inputJson.headers as string[]) : [];
    const mapping: Record<string, string> = {};
    const learnedHeaders: string[] = [];
    for (const header of headers) {
      const key = normalizeHeaderKey(header);
      const exact = await findExactMapping(params.orgId, params.domain, key);
      if (exact && typeof (exact.valueJson as any).field === "string") {
        mapping[header] = (exact.valueJson as any).field;
        learnedHeaders.push(header);
      }
    }
    return {
      suggestionJson: { mapping, learnedHeaders },
      confidence: learnedHeaders.length > 0 ? 0.8 : 0,
      reason: learnedHeaders.length > 0 ? ["learned-headers"] : ["no-match"],
    };
  }

  if (params.domain === LearningDomain.CHARGE_SUGGESTION) {
    const description = String(params.inputJson.description ?? "").trim();
    if (!description) {
      return { suggestionJson: null, confidence: 0, reason: ["no-input"] };
    }
    const customerId = String(params.inputJson.customerId ?? "").trim();
    const normalizedDescription = normalizeKey(description);
    if (!normalizedDescription) {
      return { suggestionJson: null, confidence: 0, reason: ["no-input"] };
    }
    const customerKey = customerId ? `${customerId}::${normalizedDescription}` : null;
    if (customerKey) {
      const exact = await findExactMapping(params.orgId, params.domain, customerKey);
      if (exact) {
        return {
          suggestionJson: exact.valueJson as Record<string, unknown>,
          confidence: 0.88,
          reason: ["exact-customer"],
        };
      }
    }
    const exact = await findExactMapping(params.orgId, params.domain, normalizedDescription);
    if (exact) {
      return {
        suggestionJson: exact.valueJson as Record<string, unknown>,
        confidence: 0.84,
        reason: ["exact-description"],
      };
    }
    const best = await findBestSimilarity({
      orgId: params.orgId,
      domain: params.domain,
      key: normalizedDescription,
      threshold: CHARGE_SIMILARITY_THRESHOLD,
    });
    if (best) {
      return {
        suggestionJson: best.mapping.valueJson as Record<string, unknown>,
        confidence: estimateConfidence(best.score, 0.45),
        reason: ["similar-description"],
      };
    }
    return { suggestionJson: null, confidence: 0, reason: ["no-match"] };
  }

  return { suggestionJson: null, confidence: 0, reason: ["unsupported-domain"] };
}

export function buildLearningKeysForCustomer(rawName: string, emailDomain?: string | null) {
  const keys = new Set<string>();
  const nameKey = normalizeKey(rawName);
  if (nameKey) keys.add(nameKey);
  if (emailDomain) {
    const normalized = emailDomain.trim().toLowerCase();
    if (normalized) keys.add(`email:${normalized}`);
  }
  return Array.from(keys);
}

export function buildLearningKeyForAddress(rawAddress: string) {
  return normalizeKey(rawAddress);
}

export function buildLearningKeyForHeader(header: string) {
  return normalizeHeaderKey(header);
}

export function buildLearningKeyForCharge(description: string) {
  return normalizeKey(description);
}

export function buildLearningKeyForStopName(name: string) {
  return normalizeKey(name);
}
