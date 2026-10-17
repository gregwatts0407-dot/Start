/**
 * True in the single-page build published as a claude.ai artifact, where
 * service workers, file downloads and the Web Share API aren't available.
 */
export const IS_ARTIFACT = import.meta.env.VITE_ARTIFACT === '1';
