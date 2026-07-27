export interface Releasable {
  release(): void;
}

export type SceneRenderTransactionStatus =
  | "COMMITTED"
  | "STALE"
  | "FAILED";

export interface SceneRenderTransaction<TResolved, TBuilt> {
  resolve(): Promise<TResolved>;
  acquire(resolved: TResolved): Promise<readonly Releasable[]>;
  build(
    resolved: TResolved,
    leases: readonly Releasable[],
  ): Promise<TBuilt>;
  /** Destroys an off-stage build that never became the committed scene. */
  discard?(built: TBuilt): void;
  /**
   * Atomically installs the built scene and returns resources from the
   * previously committed scene. Those old resources are released only after
   * this callback succeeds.
   */
  commit(built: TBuilt, leases: readonly Releasable[]): readonly Releasable[] | void;
  afterCommit?(): void;
  onFailure?(cause: unknown): void;
}

function releaseAll(resources: readonly Releasable[]): void {
  for (const resource of resources) resource.release();
}

export class SceneRenderCoordinator {
  private renderEpoch = 0;
  private destroyed = false;

  begin(): number {
    this.renderEpoch += 1;
    return this.renderEpoch;
  }

  isCurrent(epoch: number): boolean {
    return !this.destroyed && epoch === this.renderEpoch;
  }

  invalidate(): void {
    this.renderEpoch += 1;
  }

  async run<TResolved, TBuilt>(
    transaction: SceneRenderTransaction<TResolved, TBuilt>,
  ): Promise<SceneRenderTransactionStatus> {
    if (this.destroyed) return "STALE";
    const epoch = this.begin();
    let provisional: readonly Releasable[] = [];
    let built: TBuilt | undefined;
    let hasBuilt = false;

    try {
      const resolved = await transaction.resolve();
      if (!this.isCurrent(epoch)) return "STALE";

      provisional = await transaction.acquire(resolved);
      if (!this.isCurrent(epoch)) {
        releaseAll(provisional);
        return "STALE";
      }

      built = await transaction.build(resolved, provisional);
      hasBuilt = true;
      if (!this.isCurrent(epoch)) {
        transaction.discard?.(built);
        hasBuilt = false;
        releaseAll(provisional);
        return "STALE";
      }

      const previous = transaction.commit(built, provisional) ?? [];
      hasBuilt = false;
      releaseAll(previous);
      transaction.afterCommit?.();
      return "COMMITTED";
    } catch (cause) {
      if (hasBuilt) transaction.discard?.(built as TBuilt);
      releaseAll(provisional);
      transaction.onFailure?.(cause);
      return "FAILED";
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.invalidate();
  }
}
