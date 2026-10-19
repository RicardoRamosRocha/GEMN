# Billing identity crypto contract

This module is backend-only. It is the only supported boundary for converting
an authenticated buyer's CPF/CNPJ into the opaque fields stored by
`public.billing_identities`.

## Ciphertext format

The persisted `document_ciphertext` format is:

```text
gbi1.<key_version>.<document_type>.<nonce_base64url>.<ciphertext_and_tag_base64url>
```

`gbi1` is the format version. AES-256-GCM uses a fresh 12-byte nonce for every
encryption. The Web Crypto AES-GCM result contains the 16-byte authentication
tag appended to the ciphertext.

The authenticated additional data is:

```text
gbi1|<lowercase_user_uuid>|<cpf_or_cnpj>
```

Therefore, changing the user or document type causes decryption to fail. The
plaintext document is normalized to digits and validated before encryption and
after decryption.

## Fingerprint format

The persisted `document_fingerprint` format is:

```text
gbi1.<key_version>.<hmac_sha256_base64url>
```

The HMAC message is `gbi1|<document_type>|<normalized_digits>`. Encryption and
HMAC keys are independent.

## Required secrets

Configure these secrets separately in each environment; never commit values:

- `GEMN_BILLING_ACTIVE_KEY_VERSION`: positive decimal version, such as `1`.
- `GEMN_BILLING_ENCRYPTION_KEY_V1`: base64url encoding of exactly 32 random bytes.
- `GEMN_BILLING_HMAC_KEY_V1`: base64url encoding of exactly 32 random bytes.

For rotation, provision the next pair first, for example
`GEMN_BILLING_ENCRYPTION_KEY_V2` and `GEMN_BILLING_HMAC_KEY_V2`, verify both
environments, then change `GEMN_BILLING_ACTIVE_KEY_VERSION` to `2`. Retain old
encryption keys while ciphertexts of that version remain stored. Removing an
old key makes those identities unreadable and must be treated as a migration
incident.

Use different secret material for DEV, Sandbox and PROD. Secret provisioning
must be performed through the deployment secret manager, outside SQL and
outside the repository. The module intentionally does not create, print or
persist secrets.

Callers must not log the document, normalized value, ciphertext, keys or full
fingerprint. Errors contain only stable error codes/messages without sensitive
input values.
