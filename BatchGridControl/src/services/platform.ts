/**
 * Refreshing the parent form's totals from inside a PCF control is not a supported API.
 * Keep it isolated here so it can be swapped for a supported mechanism later.
 */
export function refreshParentForm(): void {
  try {
    const xrm = (window as unknown as { Xrm?: { Page?: { data?: { refresh(save: boolean): Promise<void> } } } }).Xrm;
    void xrm?.Page?.data?.refresh(false);
  } catch { /* best effort */ }
}