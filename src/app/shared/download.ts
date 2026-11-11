/** Dispara o download de um Blob no navegador. */
export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Converte um data URL (ex.: PNG do canvas) em Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
	const [header, payload] = dataUrl.split(',');
	const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
	const binary = atob(payload);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Blob([bytes], { type: mime });
}
