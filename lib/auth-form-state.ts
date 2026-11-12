/** Keep submit buttons from remaining busy when any synchronous or async step fails. */
export async function runWhileBusy<T>(setBusy: (busy: boolean) => void, action: () => Promise<T>): Promise<T> {
  setBusy(true);
  try {
    return await action();
  } finally {
    setBusy(false);
  }
}
