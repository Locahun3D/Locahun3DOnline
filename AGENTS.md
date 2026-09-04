<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project context (Codex / any agent)

- **Read `CLAUDE.md` in this directory first** — it is the project rulebook (stack, typography rules, works integration, verification harness). It was written for Claude but every rule applies to you.
- Global start guide and working rules with the owner: `F:\docs\CODEX_START.md`.
- Latest handoff (current architecture, pitfalls, open items): `F:\docs\HANDOFF_2026-09-05_works完全統合・ヘッダー根本治療・整理.md`.
- Hard rules: no `git push` without explicit instruction (push = production deploy); verify on a real browser at 1440/820/390 before claiming a fix; run `python scripts/design-fb-audit.py` before reporting any UI change; never change a works URL; keep reports short.
<!-- END:nextjs-agent-rules -->
