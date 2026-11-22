# Runtime selection

- Node 24 is the target runtime and container major. The workstation verification used Node 26.12.0. Next.js uses the 16.4 release line and the final lockfile pins 16.4.6. [Next.js releases](https://github.com/vercel/next.js/releases)
- Nest.js uses the 11 release line with Express, Prisma 7 with the PostgreSQL adapter, and BullMQ 5 with queue Redis kept separate from the cache. Exact direct and transitive versions are pinned in package-lock.json. [NestJS migration guide](https://docs.nestjs.com/migration-guide) · [Prisma runtime support](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
- Host solver verification used Python 3.12.13 with OR-Tools 9.14.6206. The pip dependency list includes the transitive versions used by the solver. [OR-Tools Python setup](https://developers.google.com/optimization/install/python)
- The OIDC adapter uses an OpenID Connect client library with Authorization Code, PKCE, validated state and nonce, and signed ID token verification. The institution must provision issuer and subject mappings. [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) · [OpenID client library](https://github.com/panva/openid-client)

Sources were consulted on 22 November 2026. Dependency advisories were checked against the final application lockfile. Snapshot records remain local to the repository.
