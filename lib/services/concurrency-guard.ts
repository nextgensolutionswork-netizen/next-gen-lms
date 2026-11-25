/**
 * TASK-02: Concurrency Guard
 * Detects concurrent update conflicts, prevents silent overwrites,
 * and preserves newer authoritative database records.
 */

export class RecordConflictError extends Error {
  public statusCode = 409;
  public conflictType: 'modified' | 'deleted';
  public currentRecord?: any;

  constructor(
    message: string = 'This record has been updated by another user. Please review the latest information before saving your changes.',
    conflictType: 'modified' | 'deleted' = 'modified',
    currentRecord?: any
  ) {
    super(message);
    this.name = 'RecordConflictError';
    this.conflictType = conflictType;
    this.currentRecord = currentRecord;
  }
}

export const concurrencyGuard = {
  /**
   * Asserts that a record has not been updated since the client loaded it.
   * If current record does not exist -> throws deleted conflict error.
   * If current.updated_at is newer than expectedUpdatedAt -> throws modified conflict error.
   */
  assertVersionMatch(
    currentRecord: { id?: string; updated_at?: string | null } | null | undefined,
    expectedUpdatedAt?: string | null
  ): void {
    if (!currentRecord) {
      throw new RecordConflictError(
        'This record has been deleted or is no longer available.',
        'deleted'
      );
    }

    if (!expectedUpdatedAt) {
      // If caller did not provide an expected version, allow the operation but record warning
      return;
    }

    const currentTs = currentRecord.updated_at ? new Date(currentRecord.updated_at).getTime() : 0;
    const expectedTs = new Date(expectedUpdatedAt).getTime();

    // If current database timestamp is strictly newer than what client read
    if (currentTs > expectedTs) {
      throw new RecordConflictError(
        'This record has been updated by another user. Please review the latest information before saving your changes.',
        'modified',
        currentRecord
      );
    }
  },
};
