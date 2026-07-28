export type EntityId = string;
export type IsoTimestamp = string;

export enum SortDirection {
  Ascending = 'asc',
  Descending = 'desc',
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface Page<T> {
  readonly items: ReadonlyArray<T>;
  readonly nextCursor?: string;
}

export interface Sort {
  readonly field: string;
  readonly direction: SortDirection;
}

export interface RecordMetadata {
  readonly id: EntityId;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface DataTransaction {
  readonly id: string;
}

/** Generic persistence boundary; implementations select the storage technology. */
export interface Repository<TEntity extends RecordMetadata> {
  findById(id: EntityId): Promise<TEntity | null>;
  list(page?: PageRequest, sort?: Sort): Promise<Page<TEntity>>;
  save(entity: TEntity): Promise<TEntity>;
  delete(id: EntityId): Promise<void>;
}

/** Boundary for atomic work without exposing a database implementation. */
export interface TransactionManager {
  withinTransaction<T>(work: (transaction: DataTransaction) => Promise<T>): Promise<T>;
}
