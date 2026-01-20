// src/utils/labels.ts
import jsPDF from 'jspdf'
import QRCode from 'qrcode'

export interface PalletSummary {
  pallet: string
  weightKg: number
}

/**
 * พิมพ์ฉลากพาเลตเป็น PDF พร้อม QR
 * - ใช้ for..of เพื่อให้ p เป็น PalletSummary แน่นอน (ไม่เป็น undefined)
 * - มี guard กรณีรายการว่าง
 * - จัดหน้ากระดาษอัตโนมัติเมื่อเกินความสูง
 */
export async function exportPalletLabels(pallets: readonly PalletSummary[]): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'A4' })

  if (!Array.isArray(pallets) || pallets.length === 0) {
    doc.setFontSize(14)
    doc.text('No pallets to print.', 10, 15)
    doc.save('pallet-labels.pdf')
    return
  }

  let y = 10
  let idx = 0
  const maxY = 260 // ขอบเขตก่อนขึ้นหน้าใหม่ (ประมาณ A4 margin)

  for (const p of pallets) {
    // ----- ทำ QR -----
    const payload = JSON.stringify({ pallet: p.pallet, weightKg: p.weightKg })
    const dataUrl: string = await QRCode.toDataURL(payload, {
      margin: 1,
      width: 100,
      errorCorrectionLevel: 'M',
    })

    // ----- วาดข้อความ + QR -----
    doc.setFontSize(14)
    doc.text(`Pallet: ${p.pallet}`, 10, y)
    doc.text(`Weight (kg): ${p.weightKg.toFixed(2)}`, 10, y + 7)
    doc.addImage(dataUrl, 'PNG', 150, y - 5, 40, 40)

    // เตรียมตำแหน่งบรรทัดถัดไป
    y += 48
    idx++

    // ถ้าเกินหน้ากระดาษและยังเหลือรายการ ⇒ ขึ้นหน้าใหม่
    if (y > maxY && idx < pallets.length) {
      doc.addPage()
      y = 10
    }
  }

  doc.save('pallet-labels.pdf')
}
