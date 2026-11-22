/**
 * Host half of the DeepSeek orca bundle.
 *
 * The companion is a Client-only overlay: it observes the public Session
 * Controller surface in the page and registers no Host services, routes,
 * model calls or storage. This entry exists so the bundle row activates.
 */
export function apply() {}
