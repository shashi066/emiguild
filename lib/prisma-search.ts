type PortableContainsFilter = {
  contains: string;
};

const POSTGRES_URL_PATTERN = /^(?:postgres(?:ql)?|prisma(?:\+postgres)?):\/\//i;

export function caseInsensitiveContains(
  query: string,
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): PortableContainsFilter {
  const filter: PortableContainsFilter & { mode?: 'insensitive' } = { contains: query };
  if (databaseUrl && POSTGRES_URL_PATTERN.test(databaseUrl.trim())) {
    filter.mode = 'insensitive';
  }
  return filter;
}
