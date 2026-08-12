# Mokahr profile schema

The extension accepts schema version `1`. Values are strings unless noted. Empty optional object fields may be omitted, but include every top-level section.

## Top-level shape

```json
{
  "version": 1,
  "basic": {},
  "education": [],
  "work": [],
  "internship": [],
  "projects": [],
  "works": [],
  "awards": [],
  "languages": [],
  "selfEvaluation": "",
  "social": [],
  "custom": {}
}
```

## Basic information

Allowed `basic` keys:

| Key | Meaning | Format |
| --- | --- | --- |
| `referralCode` | Referral code | String |
| `intentionCity` | Preferred city | String |
| `name` | Name | String |
| `mobile` | Mobile number | Preserve country code when supplied |
| `email` | Email | String |
| `experienceYears` | Years of work experience | String |
| `age` | Age | String |
| `gender` | Gender | Source wording |
| `nationality` | Nationality/region | String |
| `currentCity` | Current city/location | String |
| `hometownCity` | Hometown | String |
| `idType` | Identity-document type | Sensitive string |
| `idNumber` | Identity-document number | Sensitive string |
| `identification` | Combined identity-document field | Sensitive string |
| `expectedLocation` | Expected work location | String |
| `birthday` | Birth date | `YYYY-MM-DD` only when complete |
| `maritalStatus` | Marital status | Source wording |
| `currentHomeAddress` | Home address | Sensitive string |

Do not derive `age` from education dates or derive `birthday` from age.

## Repeated sections

Preserve source order. Date fields use `YYYY-MM` only when both year and month are known.

| Section | Allowed entry keys |
| --- | --- |
| `education` | `school`, `degree`, `major`, `educationType`, `academicRanking`, `startDate`, `endDate` |
| `work` | `company`, `title`, `startDate`, `endDate`, `description` |
| `internship` | `company`, `title`, `startDate`, `endDate`, `description` |
| `projects` | `nameOfItem`, `role`, `startDate`, `endDate`, `link`, `description` |
| `works` | `link`, `description` |
| `awards` | `nameOfItem`, `date`, `description` |
| `languages` | `language`, `proficiency` |
| `social` | `platform`, `link` |

`awards[].date` may be `YYYY` or `YYYY-MM` when that precision exists in the source. For an ongoing experience with no explicit end month, omit `endDate`; do not invent the current month.

## Other fields

- `selfEvaluation`: a string copied from the source or written only at the user's request.
- `custom`: an object of exact page labels to string values, for example `{ "可入职时间": "一个月内" }`. Do not use it to duplicate or override standard resume fields.

## Minimal example

```json
{
  "version": 1,
  "basic": { "name": "示例用户" },
  "education": [
    {
      "school": "示例大学",
      "degree": "本科",
      "major": "计算机科学",
      "startDate": "2022-09",
      "endDate": "2026-06"
    }
  ],
  "work": [],
  "internship": [],
  "projects": [],
  "works": [],
  "awards": [],
  "languages": [],
  "selfEvaluation": "",
  "social": [],
  "custom": {}
}
```
