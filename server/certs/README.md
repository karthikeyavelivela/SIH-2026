# Trusted certificates for Aadhaar Paperless Offline e-KYC

Only the certificates in this folder can verify an Aadhaar offline e-KYC file. A file signed by any other key is refused.

## What is here

| File | Source | SHA-256 fingerprint |
|---|---|---|
| `uidai-okyc-publickey.cer` | https://backend.uidai.gov.in/get/files/media/document/2026-05/okyc-publickey.cer, linked from UIDAI's page https://uidai.gov.in/en/aadhaar-paperless-offline-e-kyc ("Steps to validate signature"). Downloaded 2026-09-30. | `E7:23:06:42:ED:F3:05:F6:16:D5:DD:F4:87:70:EC:F1:32:B8:4F:6B:32:D9:D1:D6:9F:2D:FD:50:41:7E:A5:78` |

## Please read before switching the feature on

The file above is exactly what UIDAI's page links for **every** date range it lists (current, before 7 June 2020, before 18 June 2019, and the old client). Its own details are: subject and issuer `CN=hcl-aua, O=hcl-aua, L=Bangalore, ST=Karnataka, C=IN`, valid **3 January 2018 to 3 January 2019**.

That is an old certificate. FYRO verifies a file by the certificate's **public key** and does not reject a certificate for being past its dates (UIDAI's own guidance is to validate the signature with the public key), but this means:

- Files signed today may be signed with a **different key** than the one here. If so, every real file will be refused with "The UIDAI signature on this file could not be verified".
- Before enabling `AADHAAR_OFFLINE_EKYC_ENABLED`, confirm with UIDAI (or by testing one of your own offline files on a device you control) that this is the key that signs current files. If it is not, add the current certificate here as another `.cer`, `.crt` or `.pem` file; every file in this folder is tried.

Nothing in this repository has been tested against a real UIDAI file. The tests use a throwaway key and a synthetic file, and only trust it because `NODE_ENV` is `test`.

## Adding or replacing a certificate

Put the `.cer` (DER or PEM), `.crt` or `.pem` file here, add a row to the table above with its source URL and fingerprint (`openssl x509 -in FILE -noout -fingerprint -sha256`), and commit. Do not put private keys here.
