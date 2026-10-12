// Certificates for the email channel's TLS tests (tasks.md T190), made at run time from node:crypto: no key or
// certificate sits in a file, where the secret scan and the content-scan hook would refuse it. A certificate is a few
// DER structures (RFC 5280 §4.1), written here by hand and signed with ECDSA P-256 and SHA-256. node:crypto parses
// each one back, so a malformed certificate fails where it is made, not in a handshake.
import { generateKeyPairSync, randomBytes, sign, X509Certificate, type KeyObject } from "node:crypto";
import { createSecureContext, type SecureContext } from "node:tls";

export interface TestCert {
  /**
   * The server's side, the certificate and its key, as a TLS context. It is made with the certificate, so a test that
   * spies on tls.createSecureContext to trust an authority changes the client's context only.
   */
  context: SecureContext;
  /** The certificate, parsed: the names, fingerprints, and serial a test looks for where they must not be. */
  x509: X509Certificate;
}

export interface TestAuthority {
  /** The authority's own certificate, PEM, for a client to trust. */
  pem: string;
  /** A certificate for a server, signed by this authority. */
  issue(o: { subject: string; dnsNames: string[] }): TestCert;
}

/** A DER element: its tag, its length in the short or the long form, and its contents (X.690 §8.1). */
function der(tag: number, ...contents: Buffer[]): Buffer {
  const body = Buffer.concat(contents);
  const n = body.length;
  const length = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
}

const sequence = (...items: Buffer[]): Buffer => der(0x30, ...items);

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const base128 = [arc & 0x7f];
    for (let v = arc >> 7; v > 0; v >>= 7) base128.unshift((v & 0x7f) | 0x80);
    bytes.push(...base128);
  }
  return der(0x06, Buffer.from(bytes));
}

/** A name with one attribute, its common name, as a UTF8String. */
const commonName = (cn: string): Buffer =>
  sequence(der(0x31, sequence(oid("2.5.4.3"), der(0x0c, Buffer.from(cn, "utf8")))));

/** UTCTime, YYMMDDHHMMSSZ: right until 2050. */
const utcTime = (ms: number): Buffer =>
  der(0x17, Buffer.from(`${new Date(ms).toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`, "ascii"));

const ECDSA_WITH_SHA256 = sequence(oid("1.2.840.10045.4.3.2"));
const TRUE = der(0x01, Buffer.from([0xff]));

interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

const keyPair = (): KeyPair => generateKeyPairSync("ec", { namedCurve: "P-256" });

/** An X.509 v3 certificate, valid from an hour ago for a day, with its DNS names, or the basic constraints of a CA. */
function certificate(o: {
  subject: string;
  issuer: string;
  subjectKey: KeyPair;
  issuerKey: KeyPair;
  dnsNames?: string[];
  ca?: boolean;
}): X509Certificate {
  const serial = randomBytes(8);
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x01; // positive, and in DER's shortest form
  const extensions: Buffer[] = [];
  if (o.dnsNames !== undefined && o.dnsNames.length > 0) {
    const names = sequence(...o.dnsNames.map((name) => der(0x82, Buffer.from(name, "ascii"))));
    extensions.push(sequence(oid("2.5.29.17"), der(0x04, names)));
  }
  if (o.ca === true) extensions.push(sequence(oid("2.5.29.19"), TRUE, der(0x04, sequence(TRUE))));
  const now = Date.now();
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ECDSA_WITH_SHA256,
    commonName(o.issuer),
    sequence(utcTime(now - 3_600_000), utcTime(now + 86_400_000)),
    commonName(o.subject),
    o.subjectKey.publicKey.export({ type: "spki", format: "der" }),
    ...(extensions.length > 0 ? [der(0xa3, sequence(...extensions))] : []),
  );
  const signature = sign("sha256", tbs, o.issuerKey.privateKey);
  return new X509Certificate(sequence(tbs, ECDSA_WITH_SHA256, der(0x03, Buffer.from([0]), signature)));
}

function serverCert(x509: X509Certificate, key: KeyPair): TestCert {
  const pem = key.privateKey.export({ type: "pkcs8", format: "pem" });
  return { context: createSecureContext({ cert: x509.toString(), key: pem }), x509 };
}

/** A certificate that signs itself, which no client trusts. */
export function selfSigned(o: { subject: string; dnsNames: string[] }): TestCert {
  const key = keyPair();
  return serverCert(certificate({ ...o, issuer: o.subject, subjectKey: key, issuerKey: key }), key);
}

/** An authority of the test's own, which a client trusts only when told to. */
export function testAuthority(subject: string): TestAuthority {
  const key = keyPair();
  const own = certificate({ subject, issuer: subject, subjectKey: key, issuerKey: key, ca: true });
  return {
    pem: own.toString(),
    issue: (o) => {
      const leaf = keyPair();
      return serverCert(certificate({ ...o, issuer: subject, subjectKey: leaf, issuerKey: key }), leaf);
    },
  };
}
