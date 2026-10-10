import { createClient, type RedisClientType } from "redis";

/**
 * The Redis connections one process shares (ADR 0006): one command connection for reads, writes
 * and publishes, and one dedicated subscriber connection, however many Runs are live. Each opens
 * on first use, so building one connects to nothing.
 */
export type RedisConnection = {
  command: () => Promise<RedisClientType>;
  subscriber: () => Promise<RedisClientType>;
  /** Closes both connections; a later use opens them again. */
  close: () => Promise<void>;
};

export function createRedisConnection(url: string): RedisConnection {
  const commandClient = createClient({ url });
  const subscriberClient = commandClient.duplicate();
  for (const client of [commandClient, subscriberClient]) {
    client.on("error", (error: unknown) => console.error("Redis connection error", error));
  }

  // The first use opens the client. A failed open is forgotten, so the next use tries again.
  const opener = (client: RedisClientType) => {
    let opened: Promise<RedisClientType> | undefined;
    const open = () => {
      opened ??= client.connect().catch((error: unknown) => {
        opened = undefined;
        throw error;
      });
      return opened;
    };
    return {
      open,
      reset: () => {
        opened = undefined;
      },
    };
  };
  const commandOpener = opener(commandClient);
  const subscriberOpener = opener(subscriberClient);

  const closeClient = (client: RedisClientType) => {
    if (client.isReady) return client.close();
    // Still connecting or never opened: nothing to drain, and a pending handshake must not hold up stop().
    if (client.isOpen) client.destroy();
    return Promise.resolve();
  };

  return {
    command: commandOpener.open,
    subscriber: subscriberOpener.open,
    close: async () => {
      commandOpener.reset();
      subscriberOpener.reset();
      await Promise.all([closeClient(commandClient), closeClient(subscriberClient)]);
    },
  };
}
