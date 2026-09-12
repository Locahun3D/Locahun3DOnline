/** Serialize writes from one editor; cancel already queued work after a failure. */
export function createPropertyWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let generation = 0;
  return function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const expectedGeneration = generation;
    const result = tail.then(async () => {
      if (expectedGeneration !== generation) {
        throw new Error("直前の保存に失敗したため、後続の操作を中止しました。もう一度保存してください。");
      }
      try {
        return await run();
      } catch (error) {
        generation++;
        throw error;
      }
    });
    tail = result.catch(() => {});
    return result;
  };
}
