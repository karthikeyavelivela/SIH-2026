import './setup';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { signAccessToken } from '../src/services/token.service';
import { analyzeOcrText, hasUnmaskedAadhaar, nameMatchScore, similarity } from '../src/services/docPrecheck.service';
import * as ocr from '../src/services/ocr.service';

const FIXTURES = path.join(__dirname, 'fixtures', 'ocr');
const asDataUrl = (file: string) => `data:image/png;base64,${fs.readFileSync(path.join(FIXTURES, file)).toString('base64')}`;
const status = (r: ReturnType<typeof analyzeOcrText>, key: string) => r.checks.find((c) => c.key === key)?.status;

describe('unmasked Aadhaar detection', () => {
  it('flags twelve digits in groups of four, however they are separated', () => {
    expect(hasUnmaskedAadhaar('Name\n1234 5678 9012\nMale')).toBe(true);
    expect(hasUnmaskedAadhaar('123456789012')).toBe(true);
    expect(hasUnmaskedAadhaar('1234-5678-9012')).toBe(true);
  });

  it('does not flag a masked number, a sixteen-digit virtual ID, or ordinary numbers', () => {
    expect(hasUnmaskedAadhaar('XXXX XXXX 1234')).toBe(false);
    expect(hasUnmaskedAadhaar('**** **** 1234')).toBe(false);
    expect(hasUnmaskedAadhaar('VID 1234 5678 9012 3456')).toBe(false);
    expect(hasUnmaskedAadhaar('Issued 2019, pincode 522001, phone 9876543210')).toBe(false);
  });
});

describe('name matching', () => {
  it('tolerates the odd OCR slip but not a different name', () => {
    expect(similarity('RAVI', 'RAVI')).toBe(1);
    expect(nameMatchScore('Ravi Kumar', 'GOVT OF INDIA\nRAVl KUMAR\nDOB 1990')).toBe(1);
    expect(nameMatchScore('Ravi Kumar', 'SURESH REDDY')).toBe(0);
  });

  it('cannot compare a name with no Latin letters', () => {
    expect(nameMatchScore('రవి కుమార్', 'RAVI KUMAR')).toBeNull();
  });
});

describe('analyzeOcrText', () => {
  const profile = { name: 'Sample Card Holder' };

  it('masked Aadhaar with the right name reads as fine', () => {
    const r = analyzeOcrText('GOVERNMENT SAMPLE ID\nSAMPLE CARD HOLDER\nYear of Birth 1990\nXXXX XXXX 1234', 88, 'aadhaar', profile);
    expect(r.recommendation).toBe('looks_ok');
    expect(status(r, 'unmasked_aadhaar')).toBe('pass');
    expect(status(r, 'id_pattern')).toBe('pass');
    expect(status(r, 'name_match')).toBe('pass');
  });

  it('an unmasked Aadhaar is called out as such', () => {
    const r = analyzeOcrText('SAMPLE CARD HOLDER\n1234 5678 9012', 90, 'aadhaar', profile);
    expect(r.recommendation).toBe('unmasked_aadhaar');
    expect(status(r, 'unmasked_aadhaar')).toBe('fail');
  });

  it('a name that does not match goes to review rather than being rejected', () => {
    const r = analyzeOcrText('SOMEONE ELSE\nXXXX XXXX 1234\nenough readable characters here', 90, 'aadhaar', profile);
    expect(r.recommendation).toBe('needs_review');
    expect(status(r, 'name_match')).toBe('warn');
  });

  it('low confidence or too little text is flagged as illegible', () => {
    expect(status(analyzeOcrText('SAMPLE CARD HOLDER XXXX XXXX 1234 more text', 20, 'aadhaar', profile), 'legible')).toBe('warn');
    expect(status(analyzeOcrText('abc', 95, 'aadhaar', profile), 'legible')).toBe('warn');
  });

  it('checks the PAN and GSTIN shapes', () => {
    expect(status(analyzeOcrText('SAMPLE CARD HOLDER\nABCDE1234F\nPermanent Account Number', 90, 'pan', profile), 'id_pattern')).toBe('pass');
    expect(status(analyzeOcrText('SAMPLE CARD HOLDER\nnot a number\nPermanent Account Number', 90, 'pan', profile), 'id_pattern')).toBe('warn');
    expect(status(analyzeOcrText('GSTIN 37ABCDE1234F1Z5 SAMPLE CARD HOLDER Andhra Pradesh', 90, 'gstin', profile), 'id_pattern')).toBe('pass');
  });

  it('checks the year of birth only when the account has one', () => {
    const text = 'SAMPLE CARD HOLDER Year of Birth 1990 XXXX XXXX 1234';
    expect(status(analyzeOcrText(text, 90, 'aadhaar', profile), 'dob_year')).toBe('skipped');
    expect(status(analyzeOcrText(text, 90, 'aadhaar', { ...profile, birthYear: 1990 }), 'dob_year')).toBe('pass');
    expect(status(analyzeOcrText(text, 90, 'aadhaar', { ...profile, birthYear: 1985 }), 'dob_year')).toBe('warn');
  });

  it('never carries the text, a name or a number in its result', () => {
    const r = analyzeOcrText('SAMPLE CARD HOLDER\nABCDE1234F\n1990', 90, 'pan', profile);
    const json = JSON.stringify(r);
    expect(json).not.toContain('ABCDE1234F');
    expect(json).not.toContain('SAMPLE');
    expect(json).not.toContain('1990');
  });
});

describe('upload with the OCR pre-check', () => {
  async function driver(phone: string) {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const user = await User.create({ name: 'Sample Card Holder', phone, passwordHash, role: 'driver' });
    const agent = request.agent(app);
    agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'driver' })}`);
    return { agent, user };
  }

  afterEach(() => jest.restoreAllMocks());

  it('does nothing when OCR is off: the upload still works, with no pre-check', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(false);
    const spy = jest.spyOn(ocr, 'recognizeImage');
    const { agent } = await driver('9810000001');
    const r = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: asDataUrl('aadhaar-masked.png') });
    expect(r.status).toBe(200);
    expect(r.body.document.precheck).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('stores the recommendation on a masked Aadhaar and lets the reviewer decide', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(true);
    jest.spyOn(ocr, 'recognizeImage').mockResolvedValue({ text: 'SAMPLE CARD HOLDER\nYear of Birth 1990\nXXXX XXXX 1234', confidence: 90 });
    const { agent } = await driver('9810000002');
    const r = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: asDataUrl('aadhaar-masked.png') });
    expect(r.status).toBe(200);
    expect(r.body.document.status).toBe('under_review'); // still the admin's call
    expect(r.body.document.precheck.recommendation).toBe('looks_ok');
    expect(JSON.stringify(r.body)).not.toContain('SAMPLE CARD');
  });

  it('refuses an unmasked Aadhaar and keeps nothing', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(true);
    jest.spyOn(ocr, 'recognizeImage').mockResolvedValue({ text: 'SAMPLE CARD HOLDER\n1234 5678 9012', confidence: 90 });
    const { agent, user } = await driver('9810000003');
    const r = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: asDataUrl('aadhaar-unmasked.png') });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/masked/i);
    expect((await User.findById(user._id).lean())!.kycDocs).toHaveLength(0);
  });

  it('refuses it in Telugu too', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(true);
    jest.spyOn(ocr, 'recognizeImage').mockResolvedValue({ text: '1234 5678 9012', confidence: 90 });
    const { agent } = await driver('9810000004');
    const r = await agent.post('/api/kyc/documents').set('Accept-Language', 'te').send({ type: 'aadhaar', fileBase64: asDataUrl('aadhaar-unmasked.png') });
    expect(r.status).toBe(422);
  });

  it('a PAN with a wrong number is stored with needs_review, not rejected', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(true);
    jest.spyOn(ocr, 'recognizeImage').mockResolvedValue({ text: 'SAMPLE CARD HOLDER Permanent Account Number unreadable', confidence: 80 });
    const { agent } = await driver('9810000005');
    const r = await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: asDataUrl('pan.png') });
    expect(r.status).toBe(200);
    expect(r.body.document.precheck.recommendation).toBe('needs_review');
  });

  it('if OCR fails, the upload proceeds without a pre-check', async () => {
    jest.spyOn(ocr, 'ocrEnabled').mockReturnValue(true);
    jest.spyOn(ocr, 'recognizeImage').mockResolvedValue(null);
    const { agent } = await driver('9810000006');
    const r = await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: asDataUrl('pan.png') });
    expect(r.status).toBe(200);
    expect(r.body.document.precheck).toBeUndefined();
  });
});

// The real engine, on the synthetic fixture images. Off by default because it
// downloads language data and is slow; run with RUN_OCR_TESTS=1 and
// DOC_OCR_ENABLED=true to check the pipeline end to end.
const realOcr = process.env.RUN_OCR_TESTS === '1' ? describe : describe.skip;
realOcr('real tesseract.js on the fixtures', () => {
  jest.setTimeout(180_000);
  const read = (file: string) => ocr.recognizeImage(fs.readFileSync(path.join(FIXTURES, file)), 'eng');

  it('reads the masked Aadhaar fixture as masked', async () => {
    const r = await read('aadhaar-masked.png');
    expect(r).not.toBeNull();
    const a = analyzeOcrText(r!.text, r!.confidence, 'aadhaar', { name: 'Sample Card Holder' });
    expect(hasUnmaskedAadhaar(r!.text)).toBe(false);
    expect(a.recommendation).not.toBe('unmasked_aadhaar');
  });

  it('reads the unmasked Aadhaar fixture as unmasked', async () => {
    const r = await read('aadhaar-unmasked.png');
    expect(r).not.toBeNull();
    expect(analyzeOcrText(r!.text, r!.confidence, 'aadhaar', { name: 'Sample Card Holder' }).recommendation).toBe('unmasked_aadhaar');
  });

  it('reads the PAN fixture shape', async () => {
    const r = await read('pan.png');
    expect(r).not.toBeNull();
    expect(analyzeOcrText(r!.text, r!.confidence, 'pan', { name: 'Sample Card Holder' }).checks.find((c) => c.key === 'id_pattern')?.status).toBe('pass');
  });
});
