import * as pdfjsLib from 'pdfjs-dist';

// Force worker to use unpkg with explicit version matching
// This avoids strict MIME type checks or build issues with local workers
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();

        // Load PDF
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = '';
        const limit = Math.min(pdf.numPages, 5); // Scan up to 5 pages

        for (let i = 1; i <= limit; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // Join strings with space. 
            // Note: meaningful spaces are sometimes separate items, but often items are just words/letters.
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + ' ';
        }

        return fullText;

    } catch (error) {
        console.warn("PDFJS Error, falling back to Raw Scan:", error);
        try {
            // Fallback: Raw binary scan (Good for uncompressed text or finding hidden strings)
            const arrayBuffer = await file.arrayBuffer();
            const decoder = new TextDecoder('utf-8');
            const raw = decoder.decode(arrayBuffer);
            return raw;
        } catch (e) {
            console.error("Raw Scan failed", e);
            return "";
        }
    }
};
