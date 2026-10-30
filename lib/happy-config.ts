import { prisma } from "./prisma";
import {
  DEFAULT_HAPPY_CONFIG,
  readHappyConfig,
  type HappyConfig,
} from "./happy-ticket-rules";
import { RewardError, type RewardTx } from "./november";

export const HAPPY_CONFIG_KEY = "happy_ticket_config";
export type HappySettings = { version: number; config: HappyConfig };
export function parseHappySettings(value: string): HappySettings {
  const parsed = JSON.parse(value);
  if (!Number.isSafeInteger(parsed.version) || parsed.version < 0)
    throw new Error("Invalid Happy Ticket configuration version.");
  return {
    version: parsed.version,
    config: readHappyConfig(JSON.stringify(parsed.config)),
  };
}
export async function readHappySettings(
  tx: RewardTx = prisma,
): Promise<HappySettings> {
  const row = await tx.setting.findUnique({ where: { key: HAPPY_CONFIG_KEY } });
  return row
    ? parseHappySettings(row.value)
    : { version: 0, config: DEFAULT_HAPPY_CONFIG };
}
export async function writeHappySettings(
  tx: RewardTx,
  config: HappyConfig,
  version: number,
) {
  const row = await tx.setting.upsert({
    where: { key: HAPPY_CONFIG_KEY },
    create: {
      key: HAPPY_CONFIG_KEY,
      value: JSON.stringify({ version: 0, config: DEFAULT_HAPPY_CONFIG }),
    },
    update: {},
  });
  const previous = parseHappySettings(row.value);
  if (previous.version !== version)
    throw new RewardError(
      "STALE_EDIT",
      "Configuration changed. Refresh first.",
      409,
    );
  const next = { version: version + 1, config };
  const saved = await tx.setting.updateMany({
    where: { key: HAPPY_CONFIG_KEY, value: row.value },
    data: { value: JSON.stringify(next) },
  });
  if (saved.count !== 1)
    throw new RewardError(
      "STALE_EDIT",
      "Configuration changed. Refresh first.",
      409,
    );
  return { previous, next };
}
