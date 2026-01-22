type DelegateWithFindFirst<T> = {
  findFirst: (args: { where: { id: string; orgId: string } }) => Promise<T | null>;
};

export async function requireOrgEntity<T>(
  delegate: DelegateWithFindFirst<T>,
  orgId: string,
  id: string,
  label: string
) {
  const record = await delegate.findFirst({ where: { id, orgId } });
  if (!record) {
    throw new Error(`${label} not found`);
  }
  return record;
}
