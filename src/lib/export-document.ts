import type { DocFolder, DocDocument } from "@/types/documents";
import { toast } from "sonner";

export function exportDocumentAsMd(title: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Markdown exportado!");
}

export async function exportDocumentAsPdf(title: string, content: string) {
  try {
    // Dynamic import to avoid loading react-pdf unless needed
    const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");

    const styles = StyleSheet.create({
      page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.6 },
      title: { fontSize: 22, fontWeight: "bold", marginBottom: 16, fontFamily: "Helvetica-Bold" },
      paragraph: { marginBottom: 8 },
      heading2: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8, fontFamily: "Helvetica-Bold" },
      heading3: { fontSize: 13, fontWeight: "bold", marginTop: 12, marginBottom: 6, fontFamily: "Helvetica-Bold" },
      code: { fontFamily: "Courier", fontSize: 9, backgroundColor: "#f5f5f5", padding: 4 },
      listItem: { marginBottom: 4, paddingLeft: 16 },
    });

    // Simple markdown → PDF blocks
    const lines = content.split("\n");
    const elements: any[] = [];

    const { createElement } = await import("react");

    for (const line of lines) {
      if (line.startsWith("# ")) {
        elements.push(createElement(Text, { style: styles.title, key: elements.length }, line.slice(2)));
      } else if (line.startsWith("## ")) {
        elements.push(createElement(Text, { style: styles.heading2, key: elements.length }, line.slice(3)));
      } else if (line.startsWith("### ")) {
        elements.push(createElement(Text, { style: styles.heading3, key: elements.length }, line.slice(4)));
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        elements.push(createElement(Text, { style: styles.listItem, key: elements.length }, `• ${line.slice(2)}`));
      } else if (line.match(/^\d+\. /)) {
        elements.push(createElement(Text, { style: styles.listItem, key: elements.length }, line));
      } else if (line.startsWith("```")) {
        // skip code fences
      } else if (line.trim()) {
        // Strip inline markdown
        const clean = line
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/\*(.*?)\*/g, "$1")
          .replace(/`(.*?)`/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        elements.push(createElement(Text, { style: styles.paragraph, key: elements.length }, clean));
      }
    }

    const doc = createElement(Document, {},
      createElement(Page, { size: "A4", style: styles.page },
        createElement(View, {}, ...elements)
      )
    );

    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PDF exportado!");
  } catch (err: any) {
    console.error("PDF export error:", err);
    toast.error("Erro ao exportar PDF: " + err.message);
  }
}

export async function exportFolderAsZip(
  folders: DocFolder[],
  documents: DocDocument[],
  rootName: string
) {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const buildFolder = (parentId: string | null, zipFolder: any) => {
      const childFolders = folders.filter((f) => f.parent_id === parentId);
      const docs = documents.filter((d) => d.folder_id === parentId);

      for (const doc of docs) {
        if (doc.content) {
          zipFolder.file(`${doc.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`, doc.content);
        }
      }

      for (const folder of childFolders) {
        const sub = zipFolder.folder(folder.name.replace(/[^a-zA-Z0-9_-]/g, "_"));
        buildFolder(folder.id, sub);
      }
    };

    // Root docs (no folder)
    const rootDocs = documents.filter((d) => !d.folder_id);
    for (const doc of rootDocs) {
      if (doc.content) {
        zip.file(`${doc.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`, doc.content);
      }
    }

    // Root folders
    const rootFolders = folders.filter((f) => !f.parent_id);
    for (const folder of rootFolders) {
      const sub = zip.folder(folder.name.replace(/[^a-zA-Z0-9_-]/g, "_"));
      buildFolder(folder.id, sub);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rootName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("ZIP exportado!");
  } catch (err: any) {
    console.error("ZIP export error:", err);
    toast.error("Erro ao exportar ZIP: " + err.message);
  }
}
