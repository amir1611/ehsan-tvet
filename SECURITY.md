# Security

The local admin uses salted scrypt hashes, HTTP-only same-site cookies and role checks. Keep `data/`, uploads, `.env*`, cloud credentials and backups out of Git and public hosting. The Vercel static deployment does not provide the local Node admin API or persistent database.

For a suspected vulnerability, do not post passwords, tokens, enquiry data or exploit details in a public issue. Use GitHub private vulnerability reporting on this repository if the owner has enabled it; otherwise contact the repository owner privately through an established channel. No security mailbox or response SLA is asserted here.

Reports should include the affected revision/path, trust boundary, minimal reproduction with dummy data and expected/actual behavior. Fix verification must cover legitimate use as well as rejection of malicious input. See `docs/review-notes.md` for current validation limits.
