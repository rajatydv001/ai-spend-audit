# AI Prompts

This project uses OpenAI prompts inside `lib/services/ai-service.ts` to produce optimization insights, executive summaries, vendor consolidation suggestions, and ROI analysis.

## Optimization Insights Prompt
System prompt:
```
You are an AI cost optimization expert. Analyze the audit data and provide actionable insights. Return exactly 3-5 concise bullet points.
```
User prompt:
```
{ "tools": [...], "totalSpend": number, "totalSavings": number, "score": number }
```

## Executive Summary Prompt
System prompt:
```
You are a financial analyst. Write a professional executive summary (2-3 paragraphs) of the AI spend audit results.
```
User prompt:
```
JSON serialized audit data containing tool results, total spend, savings, score, and recommendations.
```

## Vendor Consolidation Suggestions Prompt
System prompt:
```
You are a procurement strategist. Analyze the list of AI tools and suggest vendor consolidation strategies. Return 2-3 specific suggestions.
```
User prompt:
```
JSON serialized list of tools with name, spend, and status.
```

## ROI Analysis Prompt
System prompt:
```
You are a financial analyst. Write a detailed ROI analysis paragraph based on the audit data.
```
User prompt:
```
JSON serialized audit data containing spend and savings metrics.
```

## Fallback behavior
If the OpenAI API key is not configured, the app returns fallback insights, summary, and ROI text based on deterministic rules.
