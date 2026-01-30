import { Prisma, prisma } from "@truckerio/db";

const DEFAULT_START_NUMBER = 1001;
const DEFAULT_LOAD_PREFIX = "LD-";
const DEFAULT_TRIP_PREFIX = "TR-";

export type OrgSequenceSnapshot = {
  orgId: string;
  nextLoadNumber: number;
  nextTripNumber: number;
  loadPrefix: string;
  tripPrefix: string;
};

const formatNumber = (prefix: string, value: number) => `${prefix}${value}`;

async function ensureOrgSequence(orgId: string, client: Prisma.TransactionClient | typeof prisma) {
  return client.orgSequence.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      nextLoadNumber: DEFAULT_START_NUMBER,
      nextTripNumber: DEFAULT_START_NUMBER,
      loadPrefix: DEFAULT_LOAD_PREFIX,
      tripPrefix: DEFAULT_TRIP_PREFIX,
    },
  });
}

export async function getOrgSequence(orgId: string) {
  const sequence = await ensureOrgSequence(orgId, prisma);
  return {
    orgId: sequence.orgId,
    nextLoadNumber: sequence.nextLoadNumber,
    nextTripNumber: sequence.nextTripNumber,
    loadPrefix: sequence.loadPrefix,
    tripPrefix: sequence.tripPrefix,
  } satisfies OrgSequenceSnapshot;
}

async function allocateWithClient(orgId: string, client: Prisma.TransactionClient) {
  const sequence = await client.orgSequence.upsert({
    where: { orgId },
    update: {
      nextLoadNumber: { increment: 1 },
      nextTripNumber: { increment: 1 },
    },
    create: {
      orgId,
      nextLoadNumber: DEFAULT_START_NUMBER + 1,
      nextTripNumber: DEFAULT_START_NUMBER + 1,
      loadPrefix: DEFAULT_LOAD_PREFIX,
      tripPrefix: DEFAULT_TRIP_PREFIX,
    },
  });

  return {
    loadNumber: formatNumber(sequence.loadPrefix, sequence.nextLoadNumber - 1),
    tripNumber: formatNumber(sequence.tripPrefix, sequence.nextTripNumber - 1),
  };
}

export async function allocateLoadAndTripNumbers(
  orgId: string,
  tx?: Prisma.TransactionClient
) {
  if (tx) {
    return allocateWithClient(orgId, tx);
  }

  return prisma.$transaction(async (innerTx) => allocateWithClient(orgId, innerTx));
}
