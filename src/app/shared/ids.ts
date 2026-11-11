/** Gera um identificador único (UUID quando o navegador suporta). */
export function generateId(): string {
	const globalCrypto = globalThis.crypto;
	if (globalCrypto?.randomUUID) {
		return globalCrypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
