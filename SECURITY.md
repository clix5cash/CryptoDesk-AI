# Security Policy

## Scope

Security reports are welcome for repository code, package boundaries, generated
artifacts, dependency configuration, credential handling, and documented
runtime behavior. Reports about unsupported deployments or third-party services
should be directed to their operators unless the issue originates in this
repository.

## Reporting a vulnerability

Do not open a public issue for an unresolved vulnerability and do not include
credentials in an issue, pull request, test fixture, or discussion.

When GitHub private vulnerability reporting is enabled for the future public
repository, use the repository's **Security → Report a vulnerability** flow. If
that flow is unavailable, contact the repository maintainers privately through
a contact method published on the repository owner's GitHub profile. If no
private channel is available, disclose only that a private security report is
needed; do not send exploit details publicly.

Include, when applicable:

- A concise description and affected package or path.
- Reproduction steps using synthetic data.
- Expected and observed behavior.
- Potential impact and prerequisites.
- Suggested mitigation, if known.

No response or resolution time is promised.

## Safe testing

- Use synthetic, non-usable credentials and reserved example domains.
- Do not access accounts, wallets, systems, or data without authorization.
- Do not test against live financial or blockchain assets.
- Do not perform denial-of-service testing or upload private repository content
  to external scanners.
- Stop and report privately if testing exposes a real credential or sensitive
  user data.

Never commit secrets. Revoke and rotate any real credential that is accidentally
disclosed, then assess both the current tree and Git history before publication.
