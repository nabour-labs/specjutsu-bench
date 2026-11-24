# Research: Invoice Payment Terms

## Date arithmetic

- **Decision**: Parse the issue date as UTC midnight, add the term's days with `setUTCDate`, and format the result with `toISOString().slice(0, 10)`.
- **Rationale**: Built-in `Date` handles month ends, year ends and leap days; UTC avoids daylight-saving shifts moving the date.
- **Alternatives considered**: A date library (a new dependency for one function); manual day counting per month (more code, easy to get wrong).

## Representing the terms

- **Decision**: A `PAYMENT_TERMS` object mapping each term (`due-on-receipt`, `net-15`, `net-30`) to its days, with the `PaymentTerms` type derived from its keys.
- **Rationale**: One table gives both the allowed values and their days, so validation and `dueDate` cannot disagree.
- **Alternatives considered**: An enum plus a switch (two places to change for a new term).
