import type { CompanyStampSettings } from '@/lib/company-stamp'

type Props = {
  settings: CompanyStampSettings
  borderColor: string
  textColor: string
  lineColor: string
}

export default function CompanyStampApproval({ settings, borderColor, textColor, lineColor }: Props) {
  return (
    <>
      <style>{`
        body.company-stamp-disabled .company-stamp-image { display: none !important; }
        body.company-stamp-enabled .company-stamp-line { display: none !important; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ border: `1px solid ${borderColor}`, borderRadius: '3px', padding: '10px 12px', minHeight: '92px', width: '260pt' }}>
          <div style={{ fontSize: '8pt', fontWeight: 700, color: textColor }}>Firma Yetkili İmza / Kaşe</div>
          {settings.stampDataUrl ? (
            <div className="company-stamp-image" style={{ height: '58px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={settings.stampDataUrl}
                alt="Firma kaşe ve imza"
                style={{ maxWidth: '210pt', maxHeight: '54px', objectFit: 'contain' }}
              />
            </div>
          ) : null}
          <div className="company-stamp-line" style={{ marginTop: settings.stampDataUrl ? '44px' : '58px', borderBottom: `1px dashed ${lineColor}` }} />
        </div>
      </div>
    </>
  )
}
