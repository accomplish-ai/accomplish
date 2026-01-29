---
name: skill-creator
description: Guide for creating effective skills. Use when users want to create a new skill (or update an existing skill) that extends the AI's capabilities with specialized knowledge, workflows, or tool integrations.
command: /skill-creator
verified: true
hidden: true
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend AI capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks—they transform a general-purpose agent into a specialized agent
equipped with procedural knowledge.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else needed: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: The AI is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Is this explanation really needed?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   ├── description: (required)
│   │   └── command: (optional, e.g., /my-skill)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

Every SKILL.md consists of:

- **Frontmatter** (YAML): Contains `name`, `description`, and optional `command` fields. These determine when the skill gets used—be clear and comprehensive.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers.

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code for tasks requiring deterministic reliability or that are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks

##### References (`references/`)

Documentation and reference material loaded as needed into context.

- **When to include**: For documentation that should be referenced while working
- **Examples**: `references/schema.md` for database schemas, `references/api_docs.md` for API specifications

##### Assets (`assets/`)

Files not intended to be loaded into context, but used within the output.

- **When to include**: When the skill needs files for the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/template.html` for boilerplate

## Skill Creation Process

1. **Understand the skill** - Gather concrete examples of how the skill will be used
2. **Plan contents** - Identify what scripts, references, and assets would be helpful
3. **Create the skill directory** - Set up the folder structure
4. **Write SKILL.md** - Include frontmatter and instructions
5. **Test and iterate** - Use the skill on real tasks and improve

### Step 1: Understanding the Skill

To create an effective skill, understand concrete examples of how it will be used:

- "What functionality should this skill support?"
- "Can you give examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Planning Contents

Analyze each example to identify reusable resources:

1. Consider how to execute the example from scratch
2. Identify what scripts, references, and assets would help

### Step 3: Create the Skill

Create a new directory for your skill:

```
my-skill/
├── SKILL.md
└── (optional resources)
```

### Step 4: Write SKILL.md

**Frontmatter:**

```yaml
---
name: my-skill
description: Clear description of what the skill does and when to use it.
command: /my-skill
---
```

**Body:**

Write clear instructions for using the skill. Include:
- Overview of the skill's purpose
- Step-by-step workflows
- Examples when helpful
- References to any bundled resources

### Step 5: Test and Iterate

After creating the skill:
1. Use it on real tasks
2. Notice struggles or inefficiencies
3. Update SKILL.md or bundled resources
4. Test again

## Saving Skills in Openwork

**IMPORTANT:** When creating skills in Openwork, you can ONLY create "custom" skills. You CANNOT create "official" skills - those are bundled with the app and managed by the Openwork team.

### User Skills Directory

Skills must be saved to the Openwork user data directory under a `skills` folder:

**macOS:** `~/Library/Application Support/Openwork/skills/<skill-name>/SKILL.md`
**Windows:** `%APPDATA%\Openwork\skills\<skill-name>\SKILL.md`
**Linux:** `~/.config/Openwork/skills/<skill-name>/SKILL.md`

> **Note for development:** In dev mode, the path is `@accomplish/desktop` instead of `Openwork`.

### How to Save a Skill

1. **Create the skill directory** named after your skill (lowercase, hyphenated):
   ```
   ~/Library/Application Support/Openwork/skills/my-awesome-skill/
   ```

2. **Write the SKILL.md file** inside that directory:
   ```
   ~/Library/Application Support/Openwork/skills/my-awesome-skill/SKILL.md
   ```

3. **Add any bundled resources** as subdirectories if needed:
   ```
   ~/Library/Application Support/Openwork/skills/my-awesome-skill/
   ├── SKILL.md
   ├── scripts/
   ├── references/
   └── assets/
   ```

4. **The skill is automatically detected** - Openwork scans this directory on startup and syncs new skills to its database. The skill will appear in Settings > Skills as a "Custom" skill.

### Skill Frontmatter Rules

For custom skills in Openwork:
- `name`: Required - the skill's display name
- `description`: Required - when to use this skill
- `command`: Optional - slash command like `/my-skill`
- **DO NOT use** `verified: true` - only official skills can be verified
- **DO NOT use** `hidden: true` - only internal skills should be hidden

### Example Custom Skill

```yaml
---
name: my-awesome-skill
description: Does something awesome. Use when users want to do awesome things.
command: /awesome
---
```

### After Creating

Once you write the SKILL.md file to the correct location, tell the user:
- The skill has been saved to their skills directory
- Click the **refresh button** (↻) in Settings > Skills to detect the new skill immediately
- They can enable/disable or delete custom skills from the Settings panel

## Example: Creating a Simple Skill

Here's a minimal skill example:

```markdown
---
name: greeting-generator
description: Generate personalized greetings for various occasions. Use when users want help writing greeting cards, welcome messages, or celebratory notes.
command: /greet
---

# Greeting Generator

Generate warm, personalized greetings for any occasion.

## Usage

1. Ask what type of greeting is needed (birthday, holiday, thank you, etc.)
2. Gather details about the recipient
3. Generate multiple greeting options
4. Refine based on feedback

## Tone Guidelines

- **Formal**: Professional settings, business relationships
- **Warm**: Friends and family
- **Playful**: Children, casual occasions

## Examples

**Birthday greeting:**
"Wishing you a day filled with joy and a year filled with success!"

**Thank you note:**
"Your thoughtfulness means more than words can express. Thank you!"
```
