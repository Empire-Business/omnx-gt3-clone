import { jsPDF } from 'jspdf';
import { downloadBlob } from './export-diagram';

export type MarkdownExportFormat = 'md' | 'html' | 'pdf';

function markdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion for export
  let html = markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documento de Processo</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    h2 { color: #374151; margin-top: 2rem; }
    h3 { color: #4b5563; }
    code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    blockquote { border-left: 4px solid #7c3aed; margin: 1rem 0; padding: 0.5rem 1rem; background: #f5f3ff; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}

export function exportMarkdownAsFile(markdown: string, format: MarkdownExportFormat, filename?: string) {
  const baseName = filename || 'processo';

  switch (format) {
    case 'md':
      downloadBlob(markdown, `${baseName}.md`, 'text/markdown');
      break;

    case 'html': {
      const html = markdownToHtml(markdown);
      downloadBlob(html, `${baseName}.html`, 'text/html');
      break;
    }

    case 'pdf': {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const lines = markdown.split('\n');
      let y = 20;
      const margin = 15;
      const pageWidth = 210 - 2 * margin;

      for (const line of lines) {
        if (y > 270) { pdf.addPage(); y = 20; }
        
        // Remove markdown formatting chars but preserve content
        const clean = line
          .replace(/^#{1,6}\s+/, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .replace(/^[-*]\s+/, '• ')
          .replace(/^\d+\.\s+/, (m) => m)
          .trim();
        
        if (!clean) { y += 4; continue; }

        if (line.startsWith('# ')) {
          pdf.setFontSize(18);
          pdf.setFont('helvetica', 'bold');
        } else if (line.startsWith('## ')) {
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
        } else if (line.startsWith('### ')) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
        } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\./.test(line)) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
        } else {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
        }

        // Sanitize text for jsPDF (remove chars that cause encoding issues)
        const sanitized = clean.replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) => {
          // Map common Unicode chars to ASCII equivalents
          const map: Record<string, string> = {
            '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'",
            '\u201C': '"', '\u201D': '"', '\u2022': '*', '\u2026': '...',
            '\u00E9': 'e', '\u00E1': 'a', '\u00E3': 'a', '\u00ED': 'i',
            '\u00F3': 'o', '\u00F5': 'o', '\u00FA': 'u', '\u00E7': 'c',
            '\u00C9': 'E', '\u00C1': 'A', '\u00C3': 'A', '\u00CD': 'I',
            '\u00D3': 'O', '\u00D5': 'O', '\u00DA': 'U', '\u00C7': 'C',
            '\u00EA': 'e', '\u00CA': 'E', '\u00F4': 'o', '\u00D4': 'O',
          };
          return map[ch] || ch;
        });

        const splitLines = pdf.splitTextToSize(sanitized, pageWidth);
        for (const sl of splitLines) {
          if (y > 270) { pdf.addPage(); y = 20; }
          pdf.text(sl, margin, y);
          y += pdf.getFontSize() * 0.5 + 2;
        }
        y += 2;
      }

      pdf.save(`${baseName}.pdf`);
      break;
    }
  }
}
