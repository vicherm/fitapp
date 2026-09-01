# Agent Instructions

## Keep `PRODUCT.md` current

`PRODUCT.md` is the source of truth for GymLog behavior. Every agent that adds, removes, or changes user-visible functionality must update `PRODUCT.md` in the same change. Do not treat a feature as complete until the implementation and product specification agree.

Before changing code:

1. Read the relevant section of `PRODUCT.md`.
2. Decide whether the requested change introduces a new requirement, changes an existing requirement, or removes one.
3. If the requirement is not represented, add it to the appropriate section instead of documenting it only in code comments or the README.

After changing code:

1. Re-read the affected product section and update it to describe the behavior that actually exists.
2. Remove or rewrite requirements that are no longer true.
3. Update `Last Updated` to the current date (`YYYY-MM-DD`).
4. Increment `Version` for externally visible product behavior changes; keep the existing version for wording-only corrections.
5. Check that routes, data entities, backup/export formats, and platform constraints mentioned in the spec still match the implementation.
6. Mention any intentionally unimplemented or deferred requirement in the final response.

## Documentation rules

- Keep requirements user-observable and implementation-independent where possible.
- Document important edge cases, validation rules, persistence behavior, and mobile/desktop interaction behavior.
- Do not claim a feature is implemented unless it is present in the current source and verified where practical.
- Keep the existing structure and terminology of `PRODUCT.md`; avoid creating duplicate requirements in other files.
- If a change affects multiple screens or data flows, update every affected section, not just the section where the work started.

## Verification

For a product change, compare the final code and `PRODUCT.md` before handing off. Run the project’s relevant checks, normally `npm run build` and `npm run lint`, and report failures or warnings. If a requirement cannot be verified automatically, state what remains to be checked manually.
