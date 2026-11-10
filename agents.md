
# Project Instructions

This repository contains an existing personal finance tracker built with Next.js 15, TypeScript, Tailwind CSS, MongoDB, and Mongoose.

Read `docs/PROJECT_CONTEXT.md` before planning or implementing changes.

## Core requirements

- Preserve the existing deposit-centric accounting system.
- Every confirmed expense must be associated with a deposit.
- Do not rewrite existing functionality unnecessarily.
- Implement secure bank transaction ingestion from a Samsung Android companion app.
- Keep imported transactions pending until verified.
- Prevent duplicate expense creation.
- Never collect or forward OTPs, UPI PINs, or banking credentials.
- Keep the existing Next.js website as the primary dashboard.

## Development workflow

1. Inspect existing code before suggesting modifications.
2. Explain the implementation plan before making changes.
3. Make incremental, testable changes.
4. Preserve existing database records and functionality.
5. Ask for approval before major architectural changes.
