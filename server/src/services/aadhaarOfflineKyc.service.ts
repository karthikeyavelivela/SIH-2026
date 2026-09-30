import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { nameMatchScore } from './docPrecheck.service';

/**
 * Aadhaar Paperless Offline e-KYC.
 *
 * A person downloads a zip from UIDAI (myAadhaar) protected by a share phrase
 * they chose. It holds one XML file, digitally signed by UIDAI. We open the
 * zip in memory with the phrase they type, check the signature against
 * UIDAI's published public key, and keep ONLY the outcome.
 *
 * What is kept: the reference id (last four digits of the Aadhaar number and
 * a timestamp), those four digits, the timestamp, whether the name matches the
 * account, and which certificate verified it.
 *
 * What is never kept: the XML, the photo, the address, the date of birth, the
 * mobile and email hashes, and the share phrase. The phrase is used once to
 * open the zip and is not logged.
 *
 * TRUSTED KEYS
 * The only keys that can verify a file are the certificates in server/certs/
 * (see its README for where they came from). In the test suite alone, a
 * directory named by UIDAI_TEST_CERT_DIR replaces them, so a self-signed
 * fixture can be tested; that override is ignored in any other environment.
 */
export const MAX_ZIP_BYTES = 1_000_000;
export const MAX_XML_BYTES = 2_000_000;
const MAX_ENTRIES = 5;
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const REFERENCE_ID = /^(\d{4})(\d{17})$/;

export interface TrustedKey {
  key: crypto.KeyObject;
  pem: string;
  fingerprint: string;
  source: string;
}

export function certDir(): string {
  if (env.NODE_ENV === 'test' && env.UIDAI_TEST_CERT_DIR) return env.UIDAI_TEST_CERT_DIR;
  return path.join(__dirname, '..', '..', 'certs');
}

/** Every certificate or public key in the trusted directory, as verification keys. */
export function loadTrustedKeys(dir = certDir()): TrustedKey[] {
  if (!fs.existsSync(dir)) return [];
  const out: TrustedKey[] = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.(cer|crt|pem)$/i.test(f)) continue;
    const raw = fs.readFileSync(path.join(dir, f));
    try {
      const cert = new crypto.X509Certificate(raw);
      out.push({
        key: cert.publicKey,
        pem: cert.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        fingerprint: cert.fingerprint256,
        source: f,
      });
    } catch {
      try {
        const key = crypto.createPublicKey(raw);
        const der = key.export({ type: 'spki', format: 'der' });
        out.push({
          key,
          pem: key.export({ type: 'spki', format: 'pem' }).toString(),
          fingerprint: crypto.createHash('sha256').update(der).digest('hex').toUpperCase().match(/../g)!.join(':'),
          source: f,
        });
      } catch {
        /* not a certificate or key: skip it */
      }
    }
  }
  return out;
}

export function offlineKycEnabled(): boolean {
  return env.AADHAAR_OFFLINE_EKYC_ENABLED === true;
}

export interface OfflineKycOutcome {
  referenceId: string;
  last4: string;
  xmlTimestamp: Date;
  nameMatch: 'match' | 'partial' | 'mismatch' | 'not_compared';
  certificateFingerprint: string;
}

/** The reference id's timestamp, YYYYMMDDHHMMSSmmm, is in Indian Standard Time. */
export function parseReferenceTimestamp(stamp: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(stamp);
  if (!m) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  const [, y, mo, d, h, mi, s, ms] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}+05:30`);
}

async function openZip(zip: Buffer, shareCode: string): Promise<string> {
  const reader = new ZipReader(new BlobReader(new Blob([new Uint8Array(zip)])), { password: shareCode });
  try {
    const entries = await reader.getEntries();
    if (entries.length === 0 || entries.length > MAX_ENTRIES) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
    const xml = entries.find((e) => !e.directory && /\.xml$/i.test(e.filename));
    if (!xml || xml.directory) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
    // Refuse a zip that claims to expand into something huge before opening it.
    if (xml.uncompressedSize > MAX_XML_BYTES) throw new ApiError(422, 'This file is too large to be an Aadhaar offline e-KYC file.');
    let text: string;
    try {
      const blob = await xml.getData!(new BlobWriter(), { password: shareCode });
      text = await blob.text();
    } catch {
      throw new ApiError(422, 'The share code did not open the file. Check it and try again.');
    }
    if (text.length > MAX_XML_BYTES) throw new ApiError(422, 'This file is too large to be an Aadhaar offline e-KYC file.');
    return text;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(422, 'This does not look like a zip file, or the share code is wrong.');
  } finally {
    await reader.close().catch(() => undefined);
  }
}

type XmlDoc = ReturnType<DOMParser['parseFromString']>;
type SigNode = Parameters<SignedXml['loadSignature']>[0];

function parseXml(text: string): XmlDoc {
  // A DOCTYPE is how entity-expansion and external-entity tricks are done.
  // The real file has none.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (_level, msg) => void errors.push(String(msg)) }).parseFromString(text, 'text/xml');
  if (errors.length > 0 || !doc.documentElement) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  return doc;
}

function rootOf(doc: XmlDoc) {
  if (!doc.documentElement) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  return doc.documentElement;
}

/** Checks the signature against each trusted key; returns the signed XML and the key that verified it. */
function verifySignature(xml: string, keys: TrustedKey[]): { signedXml: string; key: TrustedKey } {
  const doc = parseXml(xml);
  if (rootOf(doc).localName !== 'OfflinePaperlessKyc') throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  const sigs = doc.getElementsByTagNameNS(XMLDSIG_NS, 'Signature');
  if (sigs.length !== 1) throw new ApiError(422, 'This file is not signed by UIDAI, so it cannot be used.');

  for (const key of keys) {
    try {
      const verifier = new SignedXml({ publicCert: key.pem, getCertFromKeyInfo: () => null });
      verifier.loadSignature(sigs[0] as unknown as SigNode);
      if (!verifier.checkSignature(xml)) continue;
      // Read the data from what the signature actually covers, not from the
      // surrounding document, so nothing unsigned can be mistaken for signed.
      const signed = verifier.getSignedReferences();
      if (signed.length !== 1) continue;
      const signedDoc = parseXml(signed[0]);
      if (rootOf(signedDoc).localName !== 'OfflinePaperlessKyc') continue;
      return { signedXml: signed[0], key };
    } catch {
      /* this key did not verify it; try the next */
    }
  }
  throw new ApiError(422, 'The UIDAI signature on this file could not be verified, so it cannot be used.');
}

export async function verifyOfflineKycZip(zip: Buffer, shareCode: string, profile: { name: string }): Promise<OfflineKycOutcome> {
  if (zip.byteLength === 0 || zip.byteLength > MAX_ZIP_BYTES) throw new ApiError(422, 'This file is not the right size for an Aadhaar offline e-KYC file.');
  const keys = loadTrustedKeys();
  if (keys.length === 0) throw new ApiError(503, 'Aadhaar offline e-KYC is not set up on this server yet.');

  const xml = await openZip(zip, shareCode);
  const { signedXml, key } = verifySignature(xml, keys);

  const root = rootOf(parseXml(signedXml));
  const ref = REFERENCE_ID.exec(root.getAttribute('referenceId') ?? '');
  if (!ref) throw new ApiError(422, 'This file does not look like an Aadhaar offline e-KYC file.');
  const xmlTimestamp = parseReferenceTimestamp(ref[2]);
  const ageDays = (Date.now() - xmlTimestamp.getTime()) / 86_400_000;
  if (ageDays > env.AADHAAR_XML_MAX_AGE_DAYS) {
    throw new ApiError(422, 'This file is too old. Please download a fresh one from myAadhaar and try again.');
  }
  if (ageDays < -1) throw new ApiError(422, 'This file is dated in the future, so it cannot be used.');

  const poi = root.getElementsByTagName('Poi')[0];
  const nameOnFile = poi?.getAttribute('name') ?? '';
  const score = nameOnFile ? nameMatchScore(profile.name, nameOnFile) : null;
  const nameMatch: OfflineKycOutcome['nameMatch'] = score === null ? 'not_compared' : score >= 0.6 ? 'match' : score > 0 ? 'partial' : 'mismatch';

  // Nothing else from the file leaves this function.
  return {
    referenceId: `${ref[1]}${ref[2]}`,
    last4: ref[1],
    xmlTimestamp,
    nameMatch,
    certificateFingerprint: key.fingerprint,
  };
}
