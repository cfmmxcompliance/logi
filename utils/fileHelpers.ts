
/**
 * Universal Robust Download Strategy (Cross-Browser)
 * Handles Blob URL lifecycle, cleanups, and browser-specific quirks (Safari/Firefox).
 */
export const downloadFile = (blob: Blob, fileName: string) => {
    // 1. Detectar si es Safari (Suelen tener problemas con Blob URLs)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;

    // 2. Forzar visibilidad para navegadores estrictos (Firefox/Safari)
    link.style.display = 'none';
    link.setAttribute('target', '_blank'); // Abre una pestaña temporal si es necesario

    document.body.appendChild(link);
    link.click();

    // 3. Limpieza Diferida (Crucial para colaboración)
    // No borramos el objeto hasta que estemos seguros de que el SO lo tomó
    const delay = isSafari ? 5000 : 3000;
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        if (document.body.contains(link)) {
            document.body.removeChild(link);
        }
    }, delay);
};
