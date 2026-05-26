# Pricing Data

## AI Tool Pricing Assumptions
The audit engine uses a simplified pricing model to estimate optimization opportunities.

### ChatGPT
- Free: $0/user
- Plus: $20/user
- Team: $30/user (minimum 2 users)
- Enterprise: $50/user (minimum 10 users)

### Claude
- Free: $0/user
- Pro: $20/user
- Max: $20/user
- Team: $25/user (minimum 2 users)
- Enterprise: $45/user (minimum 10 users)

### Cursor
- Hobby: $0/user
- Pro: $20/user
- Business: $40/user (minimum 3 users)
- Enterprise: $60/user (minimum 10 users)

### Copilot
- Individual: $20/user
- Business: $15/user (minimum 5 users)
- Enterprise: $25/user (minimum 20 users)

### Gemini
- Free: $0/user
- Pro: $20/user
- Ultra: $20/user

### Windsurf
- Hobby: $0/user
- Pro: $20/user
- Business: $40/user (minimum 3 users)
- Enterprise: $60/user (minimum 10 users)

## Stripe Billing Plans
- Free tier: 5 audits per month, no charge
- Pro tier: larger usage quota and AI recommendations enabled
- Enterprise tier: custom pricing, dedicated onboarding

## Notes
- The audit engine uses simple per-user cost multipliers and minimum seat constraints.
- API spend tools like OpenAI API and Anthropic API are modeled with a `volume pricing` recommendation when monthly spend exceeds $100.
- These figures are intentionally conservative and are intended to support a demonstration-grade SaaS audit.
