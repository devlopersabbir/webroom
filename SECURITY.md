# Security Policy

The WebRoom team takes the security of our users, peers, and contributors seriously. We appreciate responsible disclosure of security vulnerabilities.

---

## 🛡️ Supported Versions

We actively support the current major release of WebRoom with security patches and critical fixes.

| Version | Supported | Notes |
| :--- | :--- | :--- |
| **3.0.x** | ✅ Supported | Current stable release (WebRoom v3) |
| **2.x.x** | ❌ Unsupported | Legacy versions; please upgrade to v3 |
| **< 2.0** | ❌ Unsupported | Deprecated |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability in WebRoom, **please do not report it through public GitHub issues or discussions.**

Instead, please report vulnerabilities via one of the following private channels:

1. **GitHub Private Security Advisory (Preferred)**:  
   Submit a report via [GitHub Security Advisories](https://github.com/devlopersabbir/webroom/security/advisories/new).
2. **Direct Email**:  
   Send an email to **[devlopersabbir@gmail.com](mailto:devlopersabbir@gmail.com)** with the subject line `[SECURITY] WebRoom Vulnerability Report`.

### What to Include in Your Report

To help us investigate and remediate the issue promptly, please include:
- A detailed description of the vulnerability.
- Affected components (e.g. content script, background bridge, WebRTC signaling, options page).
- Step-by-step instructions to reproduce the issue or a minimal Proof of Concept (PoC).
- Any potential impact on users or peer nodes.

---

## ⏱️ Response Timeline

- **Initial Acknowledgment**: We aim to acknowledge receipt of security reports within **48 hours**.
- **Assessment & Triage**: We will confirm the vulnerability and assess its severity within **5 business days**.
- **Resolution**: We will provide a patched release and coordinate public disclosure once the fix is deployed.

---

## 🔒 Security Architecture Guarantees

WebRoom is designed with privacy and security as core principles:

- **Decentralized Transport**: No central servers, databases, or user accounts. All communication occurs peer-to-peer over encrypted WebRTC data channels.
- **Cryptographic Signatures**: In WebRoom v3, peer messages and cluster heartbeats are verified using cryptographic node signatures (`src/identity/`).
- **No Remote Code Execution**: WebRoom complies strictly with Manifest V3 policies. We do not use `eval()`, `Function()` constructors, or external script CDNs.
- **Strict HTTPS Isolation**: WebRoom only operates on secure `https://` web pages and rejects non-secure contexts.
