---
name: mokahr-profile-json
description: Convert resume information from natural-language notes, pasted text, or PDF resumes into a privacy-conscious JSON profile compatible with the Mokahr Resume Autofill browser extension. Use when a user wants to create, update, normalize, or validate a mokahr-profile.json file, especially for first-time setup from an existing PDF or an unstructured description.
---

# Create a Mokahr profile JSON

Convert user-provided resume content into the extension schema without inventing facts. Keep all processing local unless the user explicitly authorizes another destination.

## Workflow

1. Read [references/profile-schema.md](references/profile-schema.md) completely before mapping data.
2. Read the supplied natural-language text. For a PDF, extract its text with the available local PDF tools; use OCR only when the PDF has no usable text layer.
3. Map only explicit source facts. Preserve the source order of repeated education, work, internship, project, work sample, award, language, and social entries.
4. Normalize complete month values to `YYYY-MM` and complete dates to `YYYY-MM-DD`. Do not convert an unknown month to January. Leave uncertain or missing values empty or omit the field.
5. Keep `work` and `internship` separate. Do not move internships into work experience unless the source explicitly classifies them as work.
6. Write the complete profile to `mokahr-profile.json` in the user-requested directory, or the current working directory when no destination is given. Never overwrite an existing file without confirming the target or choosing a new filename.
7. Validate the result:

   ```bash
   node skills/mokahr-profile-json/scripts/validate_profile_json.js mokahr-profile.json
   ```

   When the skill is installed independently, use the equivalent paths inside its installed folder.
8. Report the exact output path, validation result, and any important fields omitted because the source did not contain them. Do not echo sensitive values in the summary.

## Accuracy and privacy rules

- Never infer or fabricate names, phone numbers, email addresses, dates, schools, employers, links, identity documents, demographic attributes, achievements, or metrics.
- Never include hidden PDF metadata, local paths, recruiter notes, application URLs, or information unrelated to the resume.
- Treat identity-document numbers, home addresses, birth dates, phone numbers, and email addresses as sensitive. Include them only when the user supplied them and they are needed in the profile.
- Keep unsupported page-specific fields in `custom` only when their exact label and value are present in the source or supplied by the user.
- Prefer omission over guessing. If ambiguity materially changes meaning, ask one focused question; otherwise produce a valid partial profile and list the omission.
- Do not upload, publish, commit, or send the source resume or generated JSON anywhere unless the user explicitly requests that action.

## Output requirements

- Produce valid UTF-8 JSON with two-space indentation.
- Use schema version `1`.
- Include all top-level sections shown in the reference, using empty arrays or strings when no source data exists.
- Do not add commentary inside JSON.
- Keep descriptions faithful to the source. Light formatting cleanup is allowed; substantive rewriting requires the user's request.
