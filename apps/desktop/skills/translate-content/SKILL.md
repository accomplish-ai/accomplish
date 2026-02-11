---
name: translate-content
description: Translate English content to the user's preferred language when creating files. Use when creating documentation, notes, README files, or any user-facing text content.
---

# Translate Content

Use this MCP tool to translate English content to the user's preferred language when creating user-facing files.

## When to Use

**Use this tool when creating:**
- Documentation files (README.md, CONTRIBUTING.md, etc.)
- Meeting notes
- Text files (.txt, .md) meant for the user to read
- Any content the user explicitly asked for in their language

**Do NOT use this tool for:**
- Code (variable names, function names)
- Code comments (usually kept in English by convention)
- Log messages in code
- Configuration file keys/values
- Technical identifiers

## How It Works

The tool automatically detects the user's language from their input:
- If the user wrote in Chinese, content is translated to Chinese
- If the user wrote in Hebrew, content is translated to Hebrew
- If the user wrote in English, no translation occurs (text returned as-is)

## Parameters

```json
{
  "text": "The English text to translate",
  "context": "Optional context hint (e.g., 'documentation', 'meeting notes')"
}
```

- `text` (required): The English text content to translate
- `context` (optional): Helps improve translation quality by providing context

## Example Usage

### Creating meeting notes in user's language

```text
translate_to_user_language({
  "text": "## Meeting Notes - January 29, 2026\n\n### Attendees\n- John Smith\n- Jane Doe\n\n### Discussion Points\n1. Project timeline review\n2. Budget allocation\n3. Next steps\n\n### Action Items\n- John: Update project plan by Feb 1\n- Jane: Send budget proposal",
  "context": "meeting notes"
})
```

### Creating README for a project

```text
translate_to_user_language({
  "text": "# Project Name\n\nA brief description of what this project does.\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\nRun the following command to start:\n\n```bash\nnpm start\n```",
  "context": "README documentation"
})
```

## Response Format

The tool returns the translated text directly:

```text
## 会议记录 - 2026年1月29日

### 参会人员
- John Smith
- Jane Doe

### 讨论要点
1. 项目时间表审查
2. 预算分配
3. 下一步计划

### 行动项目
- John: 在2月1日前更新项目计划
- Jane: 发送预算提案
```

If the user is using English, the original text is returned unchanged.

## Workflow Example

When user asks (in Chinese): "Create meeting notes for today's discussion"

1. **Think in English** - Plan and draft content in English
2. **Translate before writing** - Call `translate_to_user_language` with your English draft
3. **Write the file** - Use the translated content when creating the file

```text
// Step 1: Draft in English (internal)
englishContent = "## Meeting Notes..."

// Step 2: Translate to user's language
translatedContent = translate_to_user_language({ text: englishContent })

// Step 3: Write file with translated content
Write({ path: "meeting-notes.md", content: translatedContent })
```
