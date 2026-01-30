import { jsPDF } from 'jspdf'

/** Export PDFs ของป้าย Pallet แบบเรียบง่าย */
export async function exportPalletLabels(pallets: Array<{
  pallet: string
  lines: number
  weightKg: number
  maxKg: number
  status?: string
}>) {
  const doc = new jsPDF()
  pallets.forEach((p, i) => {
    if (i !== 0) doc.addPage()
    doc.setFontSize(18)
    doc.text(`Pallet: ${p.pallet}`, 14, 20)
    doc.setFontSize(12)
    doc.text(`Status: ${p.status ?? ''}`, 14, 30)
    doc.text(`Lines : ${p.lines}`, 14, 38)
    doc.text(`Weight: ${p.weightKg} / ${p.maxKg} kg`, 14, 46)
  })
  doc.save('pallet-labels.pdf')
}