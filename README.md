> ## ⚠️ Project Archived
>
> After much consideration, I've chosen to focus my limited time and energy on my other project, [Pocket ID](https://github.com/pocket-id/pocket-id). As a solo developer, I've found it difficult to actively maintain multiple open source projects with the care and attention they deserve.
>
> If you're interested in continuing this work through a fork, I'd be happy to link to it here in the README.
>
> Thanks to all the contributors and users who have supported Pingvin Share over the years :)

# <div align="center"><img  src="https://user-images.githubusercontent.com/58886915/166198400-c2134044-1198-4647-a8b6-da9c4a204c68.svg" width="40"/> </br>Pingvin Share</div>

[![](https://dcbadge.limes.pink/api/server/wHRQ9nFRcK)](https://discord.gg/wHRQ9nFRcK) [![](https://img.shields.io/badge/Crowdin-2E3340.svg?style=for-the-badge&logo=Crowdin&logoColor=white)](https://crowdin.com/project/pingvin-share) [![](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#white)](https://github.com/sponsors/stonith404)

---

Pingvin Share is a self-hosted file sharing platform and an alternative for WeTransfer.

## ✨ Features

- Share files using a link
- Unlimited file size (restricted only by disk space)
- Set an expiration date for shares
- Secure shares with visitor limits and passwords
- Email recipients
- Reverse shares
- OIDC and LDAP authentication
- Integration with ClamAV for security scans
- Different file providers: local storage and S3

## 🐧 Get to know Pingvin Share

- [Demo](https://pingvin-share.dev.eliasschneider.com)
- [Review by DB Tech](https://www.youtube.com/watch?v=rWwNeZCOPJA)

<img src="https://user-images.githubusercontent.com/58886915/225038319-b2ef742c-3a74-4eb6-9689-4207a36842a4.png" width="700"/>

## ⌨️ Setup

### Installation with Docker (recommended)

1. Download the `docker-compose.yml` file
2. Run `docker compose up -d`

The website is now listening on `http://localhost:3000`, have fun with Pingvin Share 🐧!

> [!TIP]
> Checkout [Pocket ID](https://github.com/stonith404/pocket-id), a user-friendly OIDC provider that lets you easily log in to services like Pingvin Share using Passkeys.

## 📚 Documentation

For more installation options and advanced configurations, please refer to the [documentation](https://stonith404.github.io/pingvin-share).

> [!IMPORTANT]
> Anonymous browser uploads now generate a dedicated edit link for the uploader. Treat that link as a secret because it grants owner-level access to the share.

## 🤖 Automation API

Pingvin Share now includes an automation-focused API under `/api/v1`.

- Authentication for `/api/v1` uses bearer tokens, not the browser `access_token` cookie
- Bearer tokens can be created from the account page and are shown only once
- Small uploads can use `multipart/form-data`; large or resumable uploads can keep using chunked `application/octet-stream`
- Browser-based cross-origin access to `/api/v1` is disabled by default and can be enabled with `api.corsAllowedOrigins`

Example small upload:

```bash
curl -X POST \
  -H "Authorization: Bearer $PINGVIN_API_TOKEN" \
  -F "file=@artifact.zip" \
  http://localhost:3000/api/v1/shares/my-share/files/multipart
```

Example chunk upload:

```bash
curl -X POST \
  -H "Authorization: Bearer $PINGVIN_API_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk.bin \
  "http://localhost:3000/api/v1/shares/my-share/files?name=artifact.zip&chunkIndex=0&totalChunks=1"
```

In development mode, Swagger documents both the legacy routes and the new automation endpoints at `/api/swagger`.

## 🖤 Contribute

We would love it if you want to help make Pingvin Share better! You can either [help to translate](https://stonith404.github.io/pingvin-share/help-out/translate) Pingvin Share or [contribute to the codebase](https://stonith404.github.io/pingvin-share/help-out/contribute).
