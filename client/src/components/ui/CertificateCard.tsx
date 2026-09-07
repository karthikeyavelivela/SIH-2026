'use client';

import { useState } from 'react';
import { QRCodeDisplay } from './QRCodeDisplay';
import { Icon } from './Icon';
import { Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { ChipRow } from '@/components/fy/Controls';

/* Built against the credential cards on
   client/public/design/worker_certifications.html.

   Anatomy there: an issuer line with a credential id, the qualification
   title, issue and expiry dates as a labelled pair, an "Endorsed
   competencies" chip row, and a verification block that expands.

   The design's verification block prints a blockchain-style consensus
   record — "Block #18,492,109 · Epoch 84", a signer node, and a SHA-256
   digest. There is no ledger, no signer node and no digest anywhere in
   this product; a certification is a database row. Printing a fabricated
   hash beside the words "Consensus Validated" would be the single most
   misleading thing on this screen, so the verification block is what
   actually verifies the credential: the scannable QR a depot gate checks. */

interface CertificateCardProps {
  title: string;
  skills: string[];
  validFrom: string;
  validUntil: string;
  qrValue: string;
  expired?: boolean;
  /** Credential id, shown beside the issuer as the design has it. */
  credentialId?: string;
  onDownload?: () => void;
}

export function CertificateCard({
  title,
  skills,
  validFrom,
  validUntil,
  qrValue,
  expired = false,
  credentialId,
  onDownload,
}: CertificateCardProps) {
  const [showProof, setShowProof] = useState(false);

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <IconTile tone={expired ? 'peach' : 'lime'} size="lg">
            <Icon name="workspace_premium" size={24} />
          </IconTile>
          <div className="min-w-0">
            {credentialId && <EyebrowLabel>{credentialId}</EyebrowLabel>}
            <SectionHeading as="h3">{title}</SectionHeading>
          </div>
        </div>
        <StatusPill tone={expired ? 'critical' : 'lime'} className="shrink-0">
          {expired ? 'Expired' : 'Certified'}
        </StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <EyebrowLabel>Issued</EyebrowLabel>
          <p className="font-body text-label font-semibold text-fy-ink">{validFrom}</p>
        </div>
        <div>
          <EyebrowLabel>Valid until</EyebrowLabel>
          <p className="font-body text-label font-semibold text-fy-ink">{validUntil}</p>
        </div>
      </div>

      {skills.length > 0 && (
        <div>
          <EyebrowLabel>Endorsed competencies</EyebrowLabel>
          <ChipRow className="mt-1">
            {skills.map((s) => (
              <span key={s} className="px-2.5 py-1 rounded-full bg-fy-well font-body text-label text-fy-ink-soft">
                {s}
              </span>
            ))}
          </ChipRow>
        </div>
      )}

      <Divider />

      <button
        type="button"
        onClick={() => setShowProof((v) => !v)}
        aria-expanded={showProof}
        className="flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon name="qr_code_2" size={18} className="text-fy-brown shrink-0" />
          <span className="font-body text-label font-semibold text-fy-ink">Gate verification</span>
        </span>
        <Icon name={showProof ? 'expand_less' : 'expand_more'} size={18} className="text-fy-muted shrink-0" />
      </button>

      {showProof && (
        <div className="flex flex-col items-center gap-2">
          <QRCodeDisplay value={qrValue} size={140} />
          <Body size="label" className="text-center">
            Scanned at a depot gate to confirm this credential against the cooperative&apos;s own record.
          </Body>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 font-body text-label font-semibold text-fy-brown hover:underline"
            >
              <Icon name="download_for_offline" size={16} />
              Download credential
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
