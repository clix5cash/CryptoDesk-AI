import { PortfolioValidationError } from './errors.js';
import type {
  WalletAddress,
  WalletAddressValidator,
  WalletIdentity,
  WalletMetadata,
  WalletSnapshot,
  WalletSnapshotQuery,
} from './wallet.js';

/**
 * Validates only generic address text rules that are safe across networks.
 * It preserves casing and does not decode, checksum, or otherwise rewrite an address.
 */
export function normalizeWalletAddress(address: WalletAddress): WalletAddress {
  assertNonEmpty(address, 'Wallet address');
  if (address.trim() !== address || /\s/u.test(address) || containsControlCharacter(address)) {
    throw new PortfolioValidationError(
      'Wallet address must not contain whitespace or control characters.',
    );
  }
  return address;
}

/** Derives stable identity from the explicit network and unchanged address text. */
export function walletIdentity(wallet: WalletMetadata): WalletIdentity {
  validateWalletMetadata(wallet);
  return JSON.stringify([wallet.networkId, wallet.address]);
}

/** Validates one externally identified wallet record without inventing a wallet ID. */
export function validateWalletMetadata(
  wallet: WalletMetadata,
  addressValidator?: WalletAddressValidator,
): void {
  assertNonEmpty(wallet.id, 'Wallet ID');
  assertNonEmpty(wallet.networkId, 'Wallet network ID');
  const address = normalizeWalletAddress(wallet.address);
  assertOptionalNonEmpty(wallet.label, 'Wallet label');
  assertOptionalNonEmpty(wallet.externalRecordId, 'Wallet external record ID');

  if (addressValidator !== undefined) {
    try {
      addressValidator.validate(wallet.networkId, address);
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      throw new PortfolioValidationError(`Wallet address validator rejected the address${detail}`);
    }
  }
}

/**
 * Validates a collection without overwriting duplicates. Same logical identity
 * under distinct external IDs and conflicting external IDs are both explicit errors.
 */
export function validateWalletMetadataCollection(
  wallets: ReadonlyArray<WalletMetadata>,
  addressValidator?: WalletAddressValidator,
): void {
  const byId = new Map<string, WalletIdentity>();
  const byIdentity = new Map<WalletIdentity, string>();

  for (const wallet of wallets) {
    validateWalletMetadata(wallet, addressValidator);
    const identity = walletIdentity(wallet);
    const existingIdentity = byId.get(wallet.id);
    if (existingIdentity !== undefined) {
      if (existingIdentity !== identity) {
        throw new PortfolioValidationError(
          `Wallet ID "${wallet.id}" has conflicting address or network identity.`,
        );
      }
      throw new PortfolioValidationError(`Wallet ID "${wallet.id}" is duplicated.`);
    }
    const existingId = byIdentity.get(identity);
    if (existingId !== undefined) {
      throw new PortfolioValidationError(
        `Wallet identity "${identity}" is duplicated by wallet IDs "${existingId}" and "${wallet.id}".`,
      );
    }
    byId.set(wallet.id, identity);
    byIdentity.set(identity, wallet.id);
  }
}

/** Validates raw snapshot identity while preserving raw balances and observation facts. */
export function validateWalletSnapshotIdentity(
  snapshot: WalletSnapshot,
  addressValidator?: WalletAddressValidator,
): void {
  validateWalletMetadata(snapshot.wallet, addressValidator);
  assertIsoTimestamp(snapshot.observedAt, 'Wallet snapshot observedAt');
  if (snapshot.blockHeight !== undefined)
    assertUnsignedDecimal(snapshot.blockHeight, 'Wallet snapshot block height');
}

/** Validates an explicit, network-scoped wallet snapshot request. */
export function validateWalletSnapshotQuery(query: WalletSnapshotQuery): void {
  assertNonEmpty(query.walletId, 'Wallet snapshot query wallet ID');
  assertNonEmpty(query.networkId, 'Wallet snapshot query network ID');
  if (query.asOf !== undefined) assertIsoTimestamp(query.asOf, 'Wallet snapshot query asOf');
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioValidationError(`${label} is required.`);
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function assertIsoTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new PortfolioValidationError(`${label} must be a valid ISO timestamp.`);
  }
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function assertUnsignedDecimal(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (!/^\d+$/u.test(value)) {
    throw new PortfolioValidationError(`${label} must contain only unsigned decimal digits.`);
  }
}
