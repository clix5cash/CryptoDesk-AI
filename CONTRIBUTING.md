# Contributing to CryptoDesk AI

CryptoDesk AI favors small, reviewable changes that preserve deterministic
domain behavior, explicit authority boundaries, and provider isolation.

## Local setup

Use Node.js 22 or later and pnpm 11.17.0.

```sh
pnpm install
```

## Making changes

- Keep each change focused and explain the behavior or problem it addresses.
- Import workspace packages through their package-root exports; do not rely on
  unsupported internal deep imports.
- Add focused tests for new or changed behavior, including failure and security
  cases where relevant.
- Keep fixtures synthetic and never commit credentials, wallet keys, private
  endpoints, or production data.
- Update documentation when a supported command or public contract changes.

Security-sensitive changes must fail closed, avoid reflecting external errors or
credentials, and preserve explicit configuration and capability injection. For
privately reporting a vulnerability, follow [SECURITY.md](SECURITY.md).

## Architecture boundaries

Contributions must preserve these boundaries:

- Portfolio and Morning Meeting retain canonical authority.
- AI output remains non-authoritative and follows the documented trust
  progression.
- Provider-specific code stays outside provider-neutral domain packages.
- Ritual-specific behavior remains owned by Ritual Gateway.
- Runtime Safety remains provider-neutral, dependency-free, and Ritual-free.
- Authorization is explicit; permission is single-attempt; execution is at most
  once and terminates without retry, recursion, or an autonomous loop.

Do not introduce hidden provider selection, fallback, credential discovery,
wallet/private-key handling, live trading, canonical mutation by AI, or trust
promotion.

## Validation

Before proposing a change, run:

```sh
pnpm lint
pnpm typecheck
pnpm build --force
pnpm test
pnpm format:check
```

Also run the most relevant package tests directly while iterating.

## Pull requests

A pull request should:

- Describe the change, scope, and security or compatibility implications.
- Identify affected packages and public contracts.
- Include focused test evidence and full validation results.
- Avoid unrelated formatting, generated noise, or dependency changes.
- Call out any unresolved limitation or follow-up explicitly.

Reviewers may request a smaller patch when a change crosses package ownership or
authority boundaries.
